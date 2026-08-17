from __future__ import annotations



import logging
import os
import sys

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

if __package__ and "." in __package__:
    from .. import dbmodels, models
    from ..auth_utils import get_current_user
    from ..database import get_db
    from ..services.rate_limiter import rate_limit
    from ..services.nlp_service import predict_pipeline
    from ..services.ola_maps.geocoding_service import geocode_address
    from ..services.worker_matching import (
        find_available_workers_by_intent,
        find_nearby_workers_by_intent,
    )
    from ..services.eta_service import compute_worker_etas
    from sqlalchemy import func
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    import dbmodels
    import models
    from auth_utils import get_current_user
    from database import get_db
    from services.rate_limiter import rate_limit
    from services.nlp_service import predict_pipeline
    from services.ola_maps.geocoding_service import geocode_address
    from services.worker_matching import (
        find_available_workers_by_intent,
        find_nearby_workers_by_intent,
    )
    from services.eta_service import compute_worker_etas
    from sqlalchemy import func

router = APIRouter(prefix="/marketplace", tags=["Marketplace"])


def _resolve_search_intent(query: str) -> str:
    try:
        prediction = predict_pipeline(query)
        intent = str(prediction.get("intent") or "").strip()
        return intent if intent and intent != "unknown" else ""
    except Exception:
        return ""


def _worker_rating(worker_id: str, db: Session):
    """Real average rating from completed-service customer reviews (1–5)."""
    result = db.query(
        func.avg(dbmodels.Booking.customer_rating),
        func.count(dbmodels.Booking.customer_rating),
    ).filter(
        dbmodels.Booking.worker_id == worker_id,
        dbmodels.Booking.customer_rating.isnot(None),
    ).first()
    return (round(float(result[0]), 1) if result[0] else 0.0), (result[1] or 0)


def _to_marketplace_specialist(
    worker: models.MatchedWorkerOut,
    db: Session,
    eta_minutes: int | None = None,
) -> models.MarketplaceSpecialistOut:
    display_name = (worker.name or "").strip() or "Specialist"

    avg_rating, _review_count = _worker_rating(worker.id, db)

    return models.MarketplaceSpecialistOut(
        workerId=worker.id,
        name=display_name,
        services=worker.services,
        avatar=worker.avatar,
        isAvailable=worker.isAvailable,
        isVerified=worker.isVerified,
        rating=avg_rating or None,
        distanceKm=worker.distanceKm,
        etaMinutes=eta_minutes,
    )


@router.post("/search", response_model=list[models.MarketplaceSpecialistOut])
def search_specialists(
    payload: models.MarketplaceSearchRequest,
    request: Request,
    db: Session = Depends(get_db),
    _current_user: dbmodels.User = Depends(get_current_user),
):
    # Each search can fire an Ola Maps ETA call — bound it so a single account
    # can't run up the provider bill by spamming coordinate-shifted searches.
    rate_limit(request, "marketplace-search", max_requests=40, window_seconds=60)

    query = payload.query.strip()
    if not query:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Search query cannot be empty",
        )

    intent = _resolve_search_intent(query)

    latitude, longitude = payload.latitude, payload.longitude
    if latitude is None or longitude is None:
        if payload.location and payload.location.strip():
            try:
                geocoded = geocode_address(payload.location.strip())
                latitude = geocoded["latitude"]
                longitude = geocoded["longitude"]
            except Exception:
                latitude = longitude = None
                logger.warning("Marketplace search: geocoding failed for %r", payload.location)

    if latitude is not None and longitude is not None:
        workers = find_nearby_workers_by_intent(db, intent, latitude, longitude)
    else:
        workers = find_available_workers_by_intent(db, intent)

    eta_map: dict[str, int] = {}
    if workers and latitude is not None and longitude is not None:
        worker_rows = {
            row.id: row
            for row in db.query(dbmodels.Worker)
            .filter(dbmodels.Worker.id.in_([w.id for w in workers]))
            .all()
        }
        coord_tuples = [
            (worker_id, row.latitude, row.longitude)
            for worker_id, row in worker_rows.items()
            if row.latitude is not None and row.longitude is not None
        ]
        if coord_tuples:
            eta_map = compute_worker_etas(latitude, longitude, coord_tuples)

    return [_to_marketplace_specialist(worker, db, eta_map.get(worker.id)) for worker in workers]
