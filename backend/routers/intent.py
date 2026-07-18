from __future__ import annotations

import os
import sys

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

if __package__ and "." in __package__:
    from .. import dbmodels, models
    from ..auth_utils import get_current_user
    from ..database import get_db
    from ..services.worker_matching import find_available_workers_by_intent
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    import dbmodels
    import models
    from auth_utils import get_current_user
    from database import get_db
    from services.worker_matching import find_available_workers_by_intent

router = APIRouter(prefix="/intent", tags=["intent"])


# 🔥 FIXED: FETCH LATEST PENDING QUERY USING created_at
def _get_current_user_pending_query(
    db: Session,
    current_user: dbmodels.User,
) -> dbmodels.UserQuery | None:

    return (
        db.query(dbmodels.UserQuery)
        .filter(
            dbmodels.UserQuery.user_id == current_user.id,
            or_(
                dbmodels.UserQuery.intent.is_(None),
                dbmodels.UserQuery.intent == "",
            ),
        )
        .order_by(dbmodels.UserQuery.created_at.desc())
        .first()
    )


# 🔥 FIXED: FETCH LATEST COMPLETED QUERY USING created_at
def _get_current_user_latest_query_with_intent(
    db: Session,
    current_user: dbmodels.User,
) -> dbmodels.UserQuery | None:

    return (
        db.query(dbmodels.UserQuery)
        .filter(
            dbmodels.UserQuery.user_id == current_user.id,

            dbmodels.UserQuery.intent.is_not(None),

            dbmodels.UserQuery.intent != "",

            dbmodels.UserQuery.intent != "unknown",

            dbmodels.UserQuery.status == "done",
        )
        .order_by(dbmodels.UserQuery.created_at.desc())
        .first()
    )

@router.get(
    "/user-intent/{query_id}",
    response_model=models.IntentWorkerMatchResponse
)
def get_workers_by_current_user_intent(
    query_id: str,
    db: Session = Depends(get_db),
    current_user: dbmodels.User = Depends(get_current_user),
):

    # ==========================================
    # FETCH QUERY
    # ==========================================

    query = (
        db.query(dbmodels.UserQuery)
        .filter(
            dbmodels.UserQuery.id == query_id,
            dbmodels.UserQuery.user_id == current_user.id,
        )
        .first()
    )

    # ==========================================
    # QUERY NOT FOUND
    # ==========================================

    if not query:

        return {
            "status": "processing",
            "message": "Still processing request",
            "intent": None,
            "data": [],
        }

    # ==========================================
    # INTENT NOT READY YET
    # ==========================================

    stored_intent = (query.intent or "").strip()

    if (
        not stored_intent
        or query.status != "done"
    ):

        return {
            "status": "processing",
            "message": "Intent detection in progress",
            "intent": None,
            "data": [],
        }

    # ==========================================
    # UNKNOWN INTENT
    # ==========================================

    if stored_intent == "unknown":

        return {
            "status": "clarification_needed",
            "message": (
                "I saved your request. "
                "Needs more clarification."
            ),
            "intent": "unknown",
            "data": [],
        }

    # ==========================================
    # FIND MATCHING WORKERS
    # ==========================================

    workers = find_available_workers_by_intent(
        db,
        stored_intent
    )

    # ==========================================
    # NO WORKERS AVAILABLE
    # ==========================================

    if not workers:

        return {
            "status": "no_workers",
            "message": (
                f"No available specialists found "
                f"for {stored_intent} right now."
            ),
            "intent": stored_intent,
            "data": [],
        }

    # ==========================================
    # SUCCESS
    # ==========================================

    return {
        "status": "success",
        "message": "Available workers fetched successfully",
        "intent": stored_intent,
        "data": workers,
    }