"""
routers/workers.py
──────────────────
Specialist self-service endpoints.
All routes are JWT protected — specialist can only access their own data.

Routes (must match frontend lib/api.ts workerApi exactly):
    GET   /workers/by-user/{user_id}          → fetch own specialist profile
    PATCH /workers/{worker_id}/availability   → toggle availability on/off
    GET   /workers/{worker_id}/bookings       → list own bookings
    GET   /workers/{worker_id}/earnings       → earnings summary
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import Optional, List
import os
import sys
import uuid

if __package__ and "." in __package__:
    from ..database import get_db
    from ..dbmodels import Booking, Service, User, Worker, WorkerService
    from ..models import (
        SpecialistProfileOut,
        UpdateAvailabilityRequest,
        BookingDetailOut,
        WorkerCreate,
        WorkerOut,
        WorkerServiceCreate,
        WorkerServiceOut,
    )
    from ..auth_utils import get_current_user
    from ..services.rate_limiter import rate_limit
    from ..services.worker_services import build_worker_services, build_worker_service_out
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db
    from dbmodels import Booking, Service, User, Worker, WorkerService
    from models import (
        SpecialistProfileOut,
        UpdateAvailabilityRequest,
        BookingDetailOut,
        WorkerCreate,
        WorkerOut,
        WorkerServiceCreate,
        WorkerServiceOut,
    )
    from auth_utils import get_current_user
    from services.rate_limiter import rate_limit
    from services.worker_services import build_worker_services, build_worker_service_out

router = APIRouter(prefix="/workers", tags=["Workers"])


def _worker_options():
    return joinedload(Worker.services).joinedload(WorkerService.service)


def _get_worker_with_services(db: Session, worker_id: str) -> Worker | None:
    return (
        db.query(Worker)
        .options(_worker_options())
        .filter(Worker.id == worker_id)
        .first()
    )


def _build_profile(worker: Worker) -> SpecialistProfileOut:
    has_pending_skill = any(s.status == "pending" for s in worker.services)
    return SpecialistProfileOut(
        id=worker.id,
        userId=worker.user_id,
        services=build_worker_services(worker),
        hasPendingSkill=has_pending_skill,
        isVerified=worker.is_verified,
        verificationStatus=worker.verification_status,
        isAvailable=worker.is_available,
        rejectionReason=worker.rejection_reason,
    )


def _ensure_service_exists(db: Session, service_id: str) -> Service:
    service = db.query(Service).filter(Service.id == service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Service not found",
        )
    return service


def create_worker_profile(
    payload: WorkerCreate,
    db: Session,
    current_user: User,
) -> SpecialistProfileOut:
    if current_user.id != payload.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create a specialist profile for your own account",
        )

    _ensure_service_exists(db, payload.service_id)

    existing = (
        db.query(Worker)
        .options(_worker_options())
        .filter(Worker.user_id == payload.userId)
        .first()
    )
    if existing:
        return _build_profile(existing)

    worker = Worker(
        id=str(uuid.uuid4()),
        user_id=payload.userId,
        email=current_user.email,
        verification_status="pending",
        is_available=False,
        is_verified=False,
    )
    db.add(worker)
    db.flush()

    worker_service = WorkerService(
        worker_id=worker.id,
        service_id=payload.service_id,
        status="pending",
    )
    db.add(worker_service)
    db.commit()

    return _build_profile(_get_worker_with_services(db, worker.id))


@router.post("", response_model=SpecialistProfileOut, status_code=status.HTTP_201_CREATED)
def create_worker(
    payload: WorkerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return create_worker_profile(payload, db, current_user)


@router.get("", response_model=list[WorkerOut])
def list_workers(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    workers = (
        db.query(Worker)
        .options(_worker_options())
        .order_by(Worker.submitted_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return [_build_profile(worker) for worker in workers]


# ─────────────────────────────────────────────
#  GET /workers/by-user/{user_id}
#  Frontend: workerApi.getProfileByUserId()
#  Redux:    fetchSpecialistProfile thunk
#  Called:   on mode switch + dashboard load
# ─────────────────────────────────────────────

@router.get("/by-user/{user_id}", response_model=SpecialistProfileOut)
def get_worker_by_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Fetch the specialist profile attached to a user account.
    Returns 404 if the user hasn't switched to specialist mode yet
    (frontend uses this to decide whether to show onboarding).
    """
    # Security: can only fetch your own profile
    if current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    worker = (
        db.query(Worker)
        .options(_worker_options())
        .filter(Worker.user_id == user_id)
        .first()
    )
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Specialist profile not found",
        )

    return _build_profile(worker)


@router.get("/{worker_id}", response_model=WorkerOut)
def get_worker(
    worker_id: str,
    db: Session = Depends(get_db),
    _current_user: User = Depends(get_current_user),
):
    worker = _get_worker_with_services(db, worker_id)
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )
    return _build_profile(worker)


@router.post(
    "/{worker_id}/services",
    response_model=WorkerServiceOut,
    status_code=status.HTTP_201_CREATED,
)
def add_worker_service(
    worker_id: str,
    payload: WorkerServiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = _get_worker_with_services(db, worker_id)
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )

    if worker.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    _ensure_service_exists(db, payload.service_id)

    if len(worker.services) >= 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have reached the maximum of 3 skills.",
        )

    # Only enforce "one pending at a time" once the specialist already has a
    # verified skill. Brand-new specialists may submit multiple skills during
    # initial onboarding (still capped at the 3-skill maximum below).
    has_verified = any(item.status == "verified" for item in worker.services)
    if has_verified:
        pending_skills = [item for item in worker.services if item.status == "pending"]
        if pending_skills:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You already have a pending skill submission. Please wait for it to be reviewed before submitting another.",
            )

    duplicate = any(item.service_id == payload.service_id for item in worker.services)
    if duplicate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This skill has already been submitted.",
        )

    worker_service = WorkerService(
        worker_id=worker.id,
        service_id=payload.service_id,
        status="pending",
        price_override=payload.price_override,
        experience_years=payload.experience_years,
    )
    db.add(worker_service)
    db.commit()
    db.refresh(worker_service)

    worker_service = (
        db.query(WorkerService)
        .options(joinedload(WorkerService.service))
        .filter(
            WorkerService.worker_id == worker.id,
            WorkerService.service_id == payload.service_id,
        )
        .first()
    )
    return build_worker_service_out(worker_service)


# ─────────────────────────────────────────────
#  PATCH /workers/{worker_id}/availability
#  Frontend: workerApi.updateAvailability()
#  Called:   when specialist toggles the master switch
# ─────────────────────────────────────────────

@router.patch("/{worker_id}/availability")
def update_availability(
    worker_id: str,
    payload: UpdateAvailabilityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Toggle specialist availability (accept/reject new requests).
    Only allowed if the specialist is verified (admin approved).
    """
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )

    # Security: can only update your own availability
    if worker.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    # Business rule: must be verified before going available
    if payload.is_available and not worker.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Your profile must be approved by admin before you can accept requests",
        )

    worker.is_available = payload.is_available
    db.commit()

    return {"is_available": worker.is_available}


# ─────────────────────────────────────────────
#  GET /workers/{worker_id}/bookings
#  Frontend: workerApi.getBookings()
#  TODO: wire to Bookings table once created
# ─────────────────────────────────────────────

@router.get("/{worker_id}/bookings", response_model=List[BookingDetailOut])
def get_worker_bookings(
    worker_id: str,
    booking_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all bookings for a specialist.
    Optionally filter by status: upcoming | accepted | started | reached |
    ongoing | completed | cancelled | rejected.
    """
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )

    if worker.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    query = db.query(Booking).filter(Booking.worker_id == worker_id)
    if booking_status:
        query = query.filter(Booking.status == booking_status)

    bookings = query.order_by(Booking.created_at.desc()).all()

    from routers.bookings import _build_detail
    return [_build_detail(booking, db) for booking in bookings]


# ─────────────────────────────────────────────
#  GET /workers/{worker_id}/earnings
#  Frontend: workerApi.getEarnings()
#  TODO: calculate from Bookings table once created
# ─────────────────────────────────────────────


# ─────────────────────────────────────────────
#  GET /workers/{worker_id}/reviews  (Task 11)
# ─────────────────────────────────────────────

@router.get("/{worker_id}/reviews")
def get_worker_reviews(
    worker_id: str,
    request: Request,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Public endpoint — returns all reviews for a specialist profile."""
    rate_limit(request, "worker-reviews", max_requests=30, window_seconds=60)
    from dbmodels import Booking, User as UserModel
    skip = (page - 1) * limit

    bookings_with_reviews = (
        db.query(Booking)
        .filter(
            Booking.worker_id == worker_id,
            Booking.customer_rating.isnot(None),
        )
        .order_by(Booking.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for b in bookings_with_reviews:
        client = db.query(UserModel).filter(UserModel.id == b.client_id).first()
        result.append({
            "bookingId":     b.id,
            "bookingNumber": b.booking_number or f"#{b.id[:6].upper()}",
            "clientName":    client.name if client else "Client",
            "rating":        b.customer_rating,
            "feedback":      b.customer_feedback,
            "serviceType":   b.service_type,
            "date":          str(b.updated_at)[:10] if b.updated_at else "",
        })

    return result


# ─────────────────────────────────────────────
#  GET /workers/{worker_id}/active-booking
#  Returns the specialist's current active booking (if any)
# ─────────────────────────────────────────────

@router.get("/{worker_id}/active-booking")
def get_active_booking(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker or worker.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    from dbmodels import Booking
    active = (
        db.query(Booking)
        .filter(
            Booking.worker_id == worker_id,
            Booking.status.in_(["accepted", "started", "reached", "ongoing"]),
        )
        .first()
    )
    if not active:
        return {"hasActive": False, "booking": None}

    from routers.bookings import _build_detail
    return {"hasActive": True, "booking": _build_detail(active, db)}


@router.get("/{worker_id}/earnings")
def get_worker_earnings(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get earnings summary for a specialist.
    Placeholder: returns zeros until Bookings table is implemented (Phase 2 - NLP).
    """
    worker = db.query(Worker).filter(Worker.id == worker_id).first()
    if not worker:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Worker not found",
        )

    if worker.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    from sqlalchemy import func
    from dbmodels import Booking
    from datetime import datetime, timedelta

    today = datetime.utcnow().date()
    week_start = today - timedelta(days=today.weekday())

    def _sum(q):
        r = q.scalar()
        return round(float(r), 2) if r else 0.0

    def _count(q):
        return q.scalar() or 0

    base = db.query(Booking).filter(
        Booking.worker_id == worker_id,
        Booking.status == "completed",
    )

    today_q = base.filter(
        func.date(Booking.updated_at) == today
    )
    week_q = base.filter(
        func.date(Booking.updated_at) >= week_start
    )

    return {
        "today":       _sum(today_q.with_entities(func.sum(Booking.total_amount))),
        "week":        _sum(week_q.with_entities(func.sum(Booking.total_amount))),
        "total":       _sum(base.with_entities(func.sum(Booking.total_amount))),
        "todayCount":  _count(today_q.with_entities(func.count())),
        "weekCount":   _count(week_q.with_entities(func.count())),
        "totalCount":  _count(base.with_entities(func.count())),
    }
