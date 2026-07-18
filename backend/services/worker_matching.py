from __future__ import annotations

import os
import re
import sys

from sqlalchemy.orm import Session, joinedload

if __package__ and "." in __package__:
    from .. import dbmodels, models
    from .worker_services import build_worker_services
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    import dbmodels
    import models
    from services.worker_services import build_worker_services


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
    )


def find_available_workers_by_intent(
    db: Session,
    intent: str,
) -> list[models.MatchedWorkerOut]:
    normalized_intent = normalize_service_text(intent)
    if not normalized_intent:
        return []

    matched_service = next(
        (
            service
            for service in db.query(dbmodels.Service).all()
            if service_matches_intent(service.name, normalized_intent)
        ),
        None,
    )

    if not matched_service:
        return []

    rows = (
        db.query(dbmodels.Worker, dbmodels.User)
        .join(dbmodels.User, dbmodels.User.id == dbmodels.Worker.user_id)
        .join(dbmodels.Worker.services)
        .options(
            joinedload(dbmodels.Worker.services).joinedload(
                dbmodels.WorkerService.service
            )
        )
        .filter(dbmodels.Worker.is_available.is_(True))
        .filter(dbmodels.WorkerService.service_id == matched_service.id)
        .filter(dbmodels.WorkerService.status == "verified")
        .all()
    )

    return [build_worker_payload(worker, user) for worker, user in rows]
