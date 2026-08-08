from __future__ import annotations

import os
import re
import sys

from sqlalchemy import exists
from sqlalchemy.orm import Session, joinedload

if __package__ and "." in __package__:
    from .. import dbmodels, models
    from .worker_services import build_worker_services
    from .geo_utils import calculate_distance
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    import dbmodels
    import models
    from services.worker_services import build_worker_services
    from services.geo_utils import calculate_distance


# Specialist is considered BUSY while a booking is in any of these statuses.
# "upcoming" counts as busy only when a worker is already assigned to it.
BUSY_BOOKING_STATUSES = ("accepted", "started", "reached", "ongoing")
ASSIGNED_BUSY_STATUSES = BUSY_BOOKING_STATUSES + ("upcoming",)

# Nearby search radius (km). Overridable via SPECIALIST_RADIUS_KM env var.
DEFAULT_RADIUS_KM = 5.0


def get_radius_km() -> float:
    """Read the configured assistant/marketplace search radius in km."""
    try:
        raw = os.getenv("SPECIALIST_RADIUS_KM", "")
        return float(raw) if raw.strip() else DEFAULT_RADIUS_KM
    except ValueError:
        return DEFAULT_RADIUS_KM


def _busy_worker_exists(worker_id: str) -> "exists":
    """SQL EXISTS for a worker assigned to a non-terminal booking."""
    return exists().where(
        dbmodels.Booking.worker_id == worker_id,
        dbmodels.Booking.status.in_(ASSIGNED_BUSY_STATUSES),
    )


SERVICE_ALIASES: dict[str, set[str]] = {
    "plumbing": {
        "plumbing",
        "plumber",
        "plumer",
        "pipe",
        "tap",
        "drain",
        "leak",
        "toilet",
        "bathroom",
        "washroom",
        "flush",
        "sink",
        "water leakage",
    },
    "electrical": {
        "electrical",
        "electrician",
        "electric",
        "switch",
        "socket",
        "wire",
        "wiring",
        "fan",
        "light",
        "bulb",
        "mcb",
        "power",
        "current",
        "voltage",
    },
    "ac_repair": {
        "ac",
        "ac repair",
        "ac service",
        "air conditioner",
        "cooling",
        "ac cooling",
        "gas refill",
        "hvac",
        "split ac",
        "window ac",
        "compressor",
    },
    "carpenter": {
        "carpenter",
        "wood",
        "woodwork",
        "furniture",
        "door",
        "window",
        "wardrobe",
        "cupboard",
        "bed",
        "table",
        "chair",
        "drawer",
    },
    "cleaning": {
        "cleaning",
        "cleaner",
        "house cleaning",
        "deep cleaning",
        "dirty",
        "dust",
        "sanitize",
        "sofa cleaning",
        "bathroom cleaning",
        "kitchen cleaning",
        "floor cleaning",
    },
    "painting": {
        "painting",
        "painter",
        "paint",
        "wall paint",
        "wall painting",
        "texture",
        "waterproof paint",
        "interior painting",
        "exterior painting",
        "wall design",
        "home decoration",
    },
    "gardener": {
        "gardener",
        "gardening",
        "garden",
        "plant",
        "tree",
        "grass",
        "lawn",
        "flowers",
        "watering",
    },
    "massage": {
        "massage",
        "spa",
        "masseuse",
        "body massage",
        "therapy",
        "relaxation massage",
    },
}


def normalize_service_text(text: str | None) -> str:
    if not text:
        return ""

    normalized = text.replace("_", " ").lower()
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _terms_for(text: str | None) -> set[str]:
    normalized = normalize_service_text(text)
    if not normalized:
        return set()

    terms = {normalized, *normalized.split()}

    for canonical, aliases in SERVICE_ALIASES.items():
        canonical_normalized = normalize_service_text(canonical)
        normalized_aliases = {
            normalize_service_text(alias)
            for alias in aliases
        }

        if (
            canonical_normalized == normalized
            or canonical_normalized in terms
            or any(alias and alias in normalized for alias in normalized_aliases)
        ):
            terms.add(canonical_normalized)
            terms.update(normalized_aliases)

    return {term for term in terms if term}


def service_matches_intent(
    service_name: str | None,
    intent: str | None,
) -> bool:
    normalized_service = normalize_service_text(service_name)
    normalized_intent = normalize_service_text(intent)

    if not normalized_service or not normalized_intent:
        return False

    if normalized_service == normalized_intent:
        return True

    if (
        normalized_intent in normalized_service
        or normalized_service in normalized_intent
    ):
        return True

    return bool(_terms_for(service_name) & _terms_for(intent))


def build_worker_payload(
    worker: dbmodels.Worker,
    user: dbmodels.User | None,
    distance_km: float | None = None,
) -> models.MatchedWorkerOut:
    return models.MatchedWorkerOut(
        id=worker.id,
        userId=worker.user_id,
        name=user.name if user else None,
        email=user.email if user else worker.email,
        avatar=user.avatar if user else None,
        services=build_worker_services(worker),
        isAvailable=worker.is_available,
        isVerified=worker.is_verified,
        verificationStatus=worker.verification_status,
        rejectionReason=worker.rejection_reason,
        phone=user.phone if user else None,
        address=user.address if user else None,
        location=user.location if user else None,
        language=user.language if user else None,
        submittedAt=worker.submitted_at.isoformat() if worker.submitted_at else None,
        reviewedAt=worker.reviewed_at.isoformat() if worker.reviewed_at else None,
        distanceKm=distance_km,
    )


def _available_worker_rows(
    db: Session,
    matched_service: dbmodels.Service,
) -> list[tuple[dbmodels.Worker, dbmodels.User]]:
    """(Worker, User) rows for verified, available, not-busy specialists of a service."""
    return (
        db.query(dbmodels.Worker, dbmodels.User)
        .join(dbmodels.User, dbmodels.User.id == dbmodels.Worker.user_id)
        .join(dbmodels.Worker.services)
        .options(
            joinedload(dbmodels.Worker.services).joinedload(
                dbmodels.WorkerService.service
            )
        )
        .filter(dbmodels.Worker.is_available.is_(True))
        .filter(~_busy_worker_exists(dbmodels.Worker.id))
        .filter(dbmodels.WorkerService.service_id == matched_service.id)
        .filter(dbmodels.WorkerService.status == "verified")
        .all()
    )


def _resolve_matched_service(db: Session, intent: str) -> dbmodels.Service | None:
    normalized_intent = normalize_service_text(intent)
    if not normalized_intent:
        return None
    return next(
        (
            service
            for service in db.query(dbmodels.Service).all()
            if service_matches_intent(service.name, normalized_intent)
        ),
        None,
    )


def find_available_workers_by_intent(
    db: Session,
    intent: str,
) -> list[models.MatchedWorkerOut]:
    matched_service = _resolve_matched_service(db, intent)
    if not matched_service:
        return []

    rows = _available_worker_rows(db, matched_service)
    return [build_worker_payload(worker, user) for worker, user in rows]


def find_nearby_workers_by_intent(
    db: Session,
    intent: str,
    user_lat: float | None,
    user_lon: float | None,
    radius_km: float | None = None,
) -> list[models.MatchedWorkerOut]:
    """Verified + available + NOT busy specialists within radius_km of the user.

    Returns results sorted by distance (nearest first) with `distanceKm` set on
    each payload so the assistant/marketplace can show proximity. When the user
    has no usable coordinates, returns [] (strict: we never guess distance).
    """
    if user_lat is None or user_lon is None:
        return []

    limit_km = radius_km if radius_km is not None else get_radius_km()

    matched_service = _resolve_matched_service(db, intent)
    if not matched_service:
        return []
    rows = _available_worker_rows(db, matched_service)
    if not rows:
        return []

    # Compute the haversine distance from the user to each specialist's stored
    # base location; specialists without coordinates or beyond the radius are
    # excluded (strict filtering — we never guess distance).
    nearby: list[tuple[dbmodels.Worker, dbmodels.User, float]] = []
    for worker, user in rows:
        if worker.latitude is None or worker.longitude is None:
            continue
        d = calculate_distance(user_lat, user_lon, worker.latitude, worker.longitude)
        if d <= limit_km:
            nearby.append((worker, user, round(d, 1)))

    nearby.sort(key=lambda row: row[2])
    return [
        build_worker_payload(worker, user, distance_km=distance_km)
        for worker, user, distance_km in nearby
    ]
