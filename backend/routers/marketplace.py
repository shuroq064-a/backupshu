from __future__ import annotations



import os
import sys

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

if __package__ and "." in __package__:
    from .. import dbmodels, models
    from ..auth_utils import get_current_user
    from ..database import get_db
    from ..services.nlp_service import predict_pipeline
    from ..services.worker_matching import find_available_workers_by_intent
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    import dbmodels
    import models
    from auth_utils import get_current_user
    from database import get_db
    from services.nlp_service import predict_pipeline
    from services.worker_matching import find_available_workers_by_intent

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


def _resolve_search_intent(query: str) -> str:
    try:
        prediction = predict_pipeline(query)
        intent = str(prediction.get("intent") or "").strip()
        return intent if intent and intent != "unknown" else ""
    except Exception:
        return ""


def _to_marketplace_specialist(
    worker: models.MatchedWorkerOut,
) -> models.MarketplaceSpecialistOut:
    display_name = (worker.name or "").strip() or worker.email.split("@")[0] or "Specialist"

    return models.MarketplaceSpecialistOut(
        workerId=worker.id,
        name=display_name,
        services=worker.services,
        avatar=worker.avatar,
        phone=worker.phone,
        email=worker.email,
        isAvailable=worker.isAvailable,
        isVerified=worker.isVerified,
    )


@router.post("/search", response_model=list[models.MarketplaceSpecialistOut])
def search_specialists(
    payload: models.MarketplaceSearchRequest,
    db: Session = Depends(get_db),
    _current_user: dbmodels.User = Depends(get_current_user),
):
    query = payload.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty",
        )

    intent = _resolve_search_intent(query)
    workers = find_available_workers_by_intent(db, intent)

    return [_to_marketplace_specialist(worker) for worker in workers]
