"""
routers/admin.py
────────────────
Admin-only endpoints for ShuroqX.
All routes protected by get_admin_user (JWT + role === 'admin').

Routes (must match frontend lib/api.ts adminApi exactly):
    GET   /admin/specialists?status=pending|approved|rejected
    GET   /admin/specialists/{id}
    PATCH /admin/specialists/{id}/approve
    PATCH /admin/specialists/{id}/reject
    GET   /admin/stats
    GET   /admin/users
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List
from datetime import datetime
import os
import sys

if __package__ and "." in __package__:
    from ..database import get_db
    from ..dbmodels import User, Worker, WorkerService, Service
    from ..models import (
        SpecialistReviewOut,
        PendingSkillSubmissionOut,
        RejectPayload,
        AdminStatsOut,
        AdminUserOut,
    )
    from ..auth_utils import get_admin_user
    from ..services.worker_services import build_worker_services
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db
    from dbmodels import User, Worker, WorkerService, Service
    from models import (
        SpecialistReviewOut,
        PendingSkillSubmissionOut,
        RejectPayload,
        AdminStatsOut,
        AdminUserOut,
    )
    from auth_utils import get_admin_user
    from services.worker_services import build_worker_services

router = APIRouter(prefix="/admin", tags=["Admin"])


# ─────────────────────────────────────────────
#  Helper: build SpecialistReviewOut from Worker + User
# ─────────────────────────────────────────────

def _build_review(worker: Worker, user: User | None) -> SpecialistReviewOut:
    return SpecialistReviewOut(
        id=worker.id,
        userId=worker.user_id or "",
        name=user.name if user else None,
        email=user.email if user else worker.email,
        phone=user.phone if user else None,
        address=user.address if user else None,
        services=build_worker_services(worker),
        submittedAt=worker.submitted_at.isoformat() if worker.submitted_at else "",
        reviewedAt=worker.reviewed_at.isoformat() if worker.reviewed_at else None,
        reviewedBy=worker.reviewed_by,
        verificationStatus=worker.verification_status,
        rejectionReason=worker.rejection_reason,
        avatar=user.avatar if user else None,
    )


# ─────────────────────────────────────────────
#  GET /admin/specialists?status=pending
#  Frontend: adminApi.getSpecialists(status)
#  Redux:    fetchSpecialistsByStatus thunk
# ─────────────────────────────────────────────

@router.get("/specialists", response_model=List[SpecialistReviewOut])
def list_specialists(
    status: str = Query("pending", pattern="^(pending|approved|rejected)$"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),   # ← JWT + role check
):
    workers = (
        db.query(Worker)
        .options(joinedload(Worker.services).joinedload(WorkerService.service))
        .filter(Worker.verification_status == status)
        .order_by(Worker.submitted_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for w in workers:
        user = db.query(User).filter(User.id == w.user_id).first()
        result.append(_build_review(w, user))
    return result


# ─────────────────────────────────────────────
#  GET /admin/specialists/{specialist_id}
#  Frontend: adminApi.getSpecialistById(id)
#  Redux:    fetchSpecialistDetail thunk
# ─────────────────────────────────────────────

@router.get("/specialists/{specialist_id}", response_model=SpecialistReviewOut)
def get_specialist(
    specialist_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    worker = (
        db.query(Worker)
        .options(joinedload(Worker.services).joinedload(WorkerService.service))
        .filter(Worker.id == specialist_id)
        .first()
    )
    if not worker:
        raise HTTPException(status_code=404, detail="Specialist not found")

    user = db.query(User).filter(User.id == worker.user_id).first()
    return _build_review(worker, user)


# ─────────────────────────────────────────────
#  PATCH /admin/specialists/{specialist_id}/approve
#  Frontend: adminApi.approveSpecialist(id)
#  Redux:    approveSpecialist thunk
# ─────────────────────────────────────────────

@router.patch("/specialists/{specialist_id}/approve", status_code=204)
def approve_specialist(
    specialist_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Approve a specialist. Sets:
        verification_status = 'approved'
        is_verified = True
        reviewed_at = now
        reviewed_by = admin.id
    After approval, specialist can toggle availability and accept requests.
    """
    worker = (
        db.query(Worker)
        .options(joinedload(Worker.services))
        .filter(Worker.id == specialist_id)
        .first()
    )
    if not worker:
        raise HTTPException(status_code=404, detail="Specialist not found")

    worker.verification_status = "approved"
    worker.is_verified = True
    worker.reviewed_at = datetime.utcnow()
    worker.reviewed_by = admin.id
    worker.rejection_reason = None
    for worker_service in worker.services:
        worker_service.status = "verified"
    db.commit()


# ─────────────────────────────────────────────
#  PATCH /admin/specialists/{specialist_id}/reject
#  Frontend: adminApi.rejectSpecialist(id, reason)
#  Redux:    rejectSpecialist thunk
# ─────────────────────────────────────────────

@router.patch("/specialists/{specialist_id}/reject", status_code=204)
def reject_specialist(
    specialist_id: str,
    payload: RejectPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """
    Reject a specialist with a reason.
    Sets is_available=False so they can't accept requests.
    Rejection reason is shown to the specialist on their dashboard.
    """
    worker = db.query(Worker).filter(Worker.id == specialist_id).first()
    if not worker:
        raise HTTPException(status_code=404, detail="Specialist not found")

    worker.verification_status = "rejected"
    worker.is_verified = False
    worker.is_available = False
    worker.reviewed_at = datetime.utcnow()
    worker.reviewed_by = admin.id
    worker.rejection_reason = payload.reason
    db.commit()


# ─────────────────────────────────────────────
#  GET /admin/pending-skills
#  Frontend: adminApi.getPendingSkills()
#  Returns:  All pending skill submissions across all workers
# ─────────────────────────────────────────────

@router.get("/pending-skills", response_model=List[PendingSkillSubmissionOut])
def get_pending_skills(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    """Get all pending skill submissions (not approved/rejected yet)"""
    pending_submissions = (
        db.query(WorkerService, Worker, User)
        .join(Worker, WorkerService.worker_id == Worker.id)
        .outerjoin(User, Worker.user_id == User.id)
        .filter(WorkerService.status == "pending")
        .order_by(WorkerService.requested_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for worker_service, worker, user in pending_submissions:
        service = (
            db.query(Service)
            .filter(Service.id == worker_service.service_id)
            .first()
        )
        if service:
            result.append(
                PendingSkillSubmissionOut(
                    workerId=worker.id,
                    workerName=user.name if user else None,
                    workerEmail=user.email if user else worker.email,
                    workerAvatar=user.avatar if user else None,
                    serviceId=service.id,
                    serviceName=service.name,
                    requestedAt=worker_service.requested_at.isoformat()
                    if worker_service.requested_at
                    else "",
                    status=worker_service.status,
                )
            )
    return result


# ─────────────────────────────────────────────
#  PATCH /admin/skills/{worker_id}/{service_id}/approve
#  Frontend: adminApi.approveSkill(workerId, serviceId)
#  Approves: Individual skill submission
# ─────────────────────────────────────────────

@router.patch("/skills/{worker_id}/{service_id}/approve", status_code=204)
def approve_skill(
    worker_id: str,
    service_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Approve a pending skill submission"""
    worker_service = (
        db.query(WorkerService)
        .filter(
            WorkerService.worker_id == worker_id,
            WorkerService.service_id == service_id,
        )
        .first()
    )
    if not worker_service:
        raise HTTPException(status_code=404, detail="Skill submission not found")

    worker_service.status = "verified"
    worker_service.reviewed_at = datetime.utcnow()
    worker_service.reviewed_by = admin.id
    db.commit()


# ─────────────────────────────────────────────
#  PATCH /admin/skills/{worker_id}/{service_id}/reject
#  Frontend: adminApi.rejectSkill(workerId, serviceId)
#  Rejects:  Individual skill submission
# ─────────────────────────────────────────────

@router.patch("/skills/{worker_id}/{service_id}/reject", status_code=204)
def reject_skill(
    worker_id: str,
    service_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Reject a pending skill submission and remove it from worker's services"""
    worker_service = (
        db.query(WorkerService)
        .filter(
            WorkerService.worker_id == worker_id,
            WorkerService.service_id == service_id,
        )
        .first()
    )
    if not worker_service:
        raise HTTPException(status_code=404, detail="Skill submission not found")

    db.delete(worker_service)
    db.commit()


# ─────────────────────────────────────────────
#  GET /admin/stats
#  Frontend: adminApi.getStats()
#  Redux:    fetchAdminStats thunk
#  Used by:  AdminSidebar badge + stats cards
# ─────────────────────────────────────────────

@router.get("/stats", response_model=AdminStatsOut)
def get_stats(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    return AdminStatsOut(
        totalPending=db.query(Worker).filter(Worker.verification_status == "pending").count(),
        totalApproved=db.query(Worker).filter(Worker.verification_status == "approved").count(),
        totalRejected=db.query(Worker).filter(Worker.verification_status == "rejected").count(),
        totalUsers=db.query(User).filter(User.role == "user").count(),
    )


# ─────────────────────────────────────────────
#  GET /admin/users
#  Frontend: adminApi.getAllUsers()
#  Redux:    fetchAllUsers thunk
# ─────────────────────────────────────────────

@router.get("/users", response_model=List[AdminUserOut])
def list_users(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_admin_user),
):
    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for user in users:
        has_profile = (
            db.query(Worker).filter(Worker.user_id == user.id).first() is not None
        )
        result.append(
            AdminUserOut(
                id=user.id,
                email=user.email,
                name=user.name,
                role=user.role,
                createdAt=user.created_at.isoformat() if user.created_at else "",
                hasSpecialistProfile=has_profile,
            )
        )
    return result
