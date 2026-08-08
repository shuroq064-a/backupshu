"""
agents/tools.py
────────────────
Tool registry that gives the agents real "powers" over the ShuroqX domain.

Each tool is a plain async function the agents (and the supervisor) can call.
Tools are intentionally side-effect light and read-mostly; the only writes go
through the existing, well-tested booking path invoked by the frontend. Keeping
tools here (instead of letting the LLM call them) makes the system robust: the
model decides *what* to do, the code executes it deterministically and safely.
"""

from __future__ import annotations

import sys
import os
from typing import Any

if __package__ and "." in __package__:
    from ..database import get_db
    from .. import dbmodels
    from ..services.llm.catalog import resolve_intent, build_booking_context
    from ..services.worker_matching import (
        find_available_workers_by_intent,
        find_nearby_workers_by_intent,
    )
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    from database import get_db
    import dbmodels
    from services.llm.catalog import resolve_intent, build_booking_context
    from services.worker_matching import (
        find_available_workers_by_intent,
        find_nearby_workers_by_intent,
    )


ACTIVE_STATUSES = {"upcoming", "accepted", "started", "reached", "ongoing"}

STATUS_HUMAN = {
    "upcoming": "waiting for a specialist to accept",
    "accepted": "specialist accepted and is preparing to come",
    "started": "specialist is on the way",
    "reached": "specialist has arrived at your location",
    "ongoing": "work is in progress",
    "completed": "completed",
    "cancelled": "cancelled",
    "rejected": "rejected",
}


# Baseline visit charge used when no specialist pricing is available.
DEFAULT_VISIT_CHARGE = 100

# Per-service typical starting price (INR) used for rough estimates when no
# specialist has set a price_override. Keeps the agent honest but useful.
SERVICE_BASE_PRICE = {
    "plumbing": 300,
    "electrical": 350,
    "ac_repair": 499,
    "carpenter": 400,
    "cleaning": 299,
    "painting": 2500,
    "gardener": 350,
    "massage": 999,
}

# Rough ETA ranges (minutes) by service — the agent uses the average as a guide.
SERVICE_ETA_MINUTES = {
    "plumbing": (30, 75),
    "electrical": (30, 60),
    "ac_repair": (45, 90),
    "carpenter": (45, 120),
    "cleaning": (60, 150),
    "painting": (120, 300),
    "gardener": (45, 120),
    "massage": (30, 90),
}


def _catalog_avg_price(db, canonical: str) -> float | None:
    """Average real price_override across verified specialists for a service."""
    price_overrides = [
        ws.price_override
        for ws in db.query(dbmodels.WorkerService)
        .join(dbmodels.Service, dbmodels.Service.id == dbmodels.WorkerService.service_id)
        .filter(dbmodels.Service.name == canonical)
        .filter(dbmodels.WorkerService.status == "verified")
        .all()
        if ws.price_override is not None
    ]
    if not price_overrides:
        return None
    return round(sum(price_overrides) / len(price_overrides), 2)


async def tool_service_catalog(db) -> dict:
    """List every service category ShuroqX offers (authoritative, live)."""
    names = [r.name for r in db.query(dbmodels.Service).all()]
    return {
        "ok": True,
        "services": names,
        "summary": (
            "ShuroqX offers: " + ", ".join(names) + "."
            if names else "Service catalog is empty right now."
        ),
    }


async def tool_estimate_cost(db, intent: str) -> dict:
    """Estimate a price + ETA range for a service using real specialist pricing."""
    canonical = resolve_intent(db, intent)
    if not canonical:
        return {
            "ok": False,
            "intent": None,
            "summary": f"Couldn't match '{intent}' to a service category.",
        }
    avg = _catalog_avg_price(db, canonical)
    base = SERVICE_BASE_PRICE.get(canonical, 500)
    low, high = SERVICE_ETA_MINUTES.get(canonical, (45, 120))
    eta_avg = (low + high) // 2
    price_text = (
        f"around ₹{int(avg)}" if avg is not None else f"starting from ₹{base}"
    )
    return {
        "ok": True,
        "intent": canonical,
        "estimated_price": avg if avg is not None else base,
        "price_low": base,
        "price_high": int(base * 2.5),
        "eta_minutes": eta_avg,
        "eta_low": low,
        "eta_high": high,
        "summary": (
            f"For {canonical}: ~{price_text}, specialist usually arrives in "
            f"{eta_avg} min (about {low}-{high} min)."
        ),
    }


async def tool_cancel_booking(db, booking_id: str, user) -> dict:
    """Cancel one of the customer's own upcoming bookings (real action)."""
    b = (
        db.query(dbmodels.Booking)
        .filter(
            dbmodels.Booking.id == booking_id,
            dbmodels.Booking.client_id == user.id,
        )
        .first()
    )
    if not b:
        return {"ok": False, "summary": "Booking not found or not yours."}
    if b.status in ("completed", "cancelled", "rejected"):
        return {
            "ok": False,
            "summary": f"Booking {b.booking_number} is already {b.status} — can't cancel.",
        }
    try:
        b.status = "cancelled"
        b.cancelled_by = user.id
        b.cancellation_reason = "Cancelled via AI assistant"
        db.commit()
    except Exception as exc:
        db.rollback()
        return {"ok": False, "summary": f"Couldn't cancel: {exc}"}
    return {
        "ok": True,
        "booking_id": b.id,
        "booking_number": b.booking_number,
        "summary": f"Cancelled booking {b.booking_number} ({b.service_type}).",
    }


async def tool_list_nearby_specialists(
    db,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict:
    """List verified, available, NOT busy specialists near the customer across
    EVERY service category (not one intent) — used for "who is near me?".

    Deterministic: every name/distance comes from the database. Without
    coordinates we return no workers (strict — ask for the location first).
    """
    if latitude is None or longitude is None:
        return {
            "ok": False,
            "workers": [],
            "summary": "I need your location to find nearby specialists. Please select your service location first.",
        }

    services = db.query(dbmodels.Service).all()
    by_service: dict[str, list[dict]] = {}
    seen: set[str] = set()
    for service in services:
        nearby = find_nearby_workers_by_intent(db, service.name, latitude, longitude)
        for w in nearby:
            # Same specialist may legitimately appear under several services;
            # `seen` only tracks unique workers for the summary count.
            seen.add(w.id)
            by_service.setdefault(service.name, []).append(
                {
                    "worker_id": w.id,
                    "name": w.name or w.email.split("@")[0],
                    "distance_km": w.distanceKm,
                }
            )

    total = len(seen)
    if not total:
        return {
            "ok": True,
            "workers": [],
            "by_service": {},
            "summary": "No available specialists within 5 km of your location right now.",
        }
    lines = [
        f"{svc}: " + ", ".join(f"{s['name']} ({s['distance_km']} km)" for s in items)
        for svc, items in by_service.items()
    ]
    return {
        "ok": True,
        "workers": [w for items in by_service.values() for w in items],
        "by_service": by_service,
        "summary": f"Found {total} specialist(s) near you: " + "; ".join(lines),
    }


async def tool_search_specialists(
    db,
    intent: str,
    latitude: float | None = None,
    longitude: float | None = None,
) -> dict:
    """Find verified, available, NOT busy specialists for a (free-text) service intent.

    When `latitude`/`longitude` are provided, only specialists within the
    configured radius (SPECIALIST_RADIUS_KM, default 5 km) of the customer's
    location are returned, sorted nearest-first with `distanceKm` on each
    payload. Without coordinates we return no specialists (strict — the
    assistant must ask the customer for their location first).
    """
    if latitude is None or longitude is None:
        return {
            "ok": False,
            "intent": None,
            "reply": "",
            "workers": [],
            "summary": "I need your location to find nearby specialists. Please select your service location first.",
        }
    canonical = resolve_intent(db, intent)
    if not canonical:
        return {
            "ok": False,
            "intent": None,
            "reply": "",
            "workers": [],
            "summary": f"No matching service for '{intent}'.",
        }
    workers = find_nearby_workers_by_intent(db, canonical, latitude, longitude)
    # Enrich each worker payload with price/experience/rating context the agent
    # can use to give the customer a stronger, data-backed recommendation.
    enriched = []
    for w in workers:
        payload = w.model_dump()
        ws = (
            db.query(dbmodels.WorkerService)
            .join(dbmodels.Service, dbmodels.Service.id == dbmodels.WorkerService.service_id)
            .filter(dbmodels.WorkerService.worker_id == w.id)
            .filter(dbmodels.Service.name == canonical)
            .filter(dbmodels.WorkerService.status == "verified")
            .first()
        )
        payload["price"] = ws.price_override if ws else None
        payload["experience_years"] = ws.experience_years if ws else None
        enriched.append(payload)
    summary = (
        f"Found {len(enriched)} specialist(s) for '{canonical}'."
        if enriched
        else f"No available specialists for '{canonical}' right now."
    )
    return {
        "ok": True,
        "intent": canonical,
        "reply": "",
        "workers": enriched,
        "summary": summary,
    }


async def tool_my_bookings(db, user) -> dict:
    """Return the customer's active/upcoming bookings as a concise list."""
    bookings = (
        db.query(dbmodels.Booking)
        .filter(
            dbmodels.Booking.client_id == user.id,
            dbmodels.Booking.status.in_(ACTIVE_STATUSES),
        )
        .order_by(dbmodels.Booking.created_at.desc())
        .all()
    )
    items = []
    for b in bookings:
        specialist = "Not yet assigned"
        if b.worker_id:
            worker = db.query(dbmodels.Worker).filter(dbmodels.Worker.id == b.worker_id).first()
            if worker:
                su = db.query(dbmodels.User).filter(dbmodels.User.id == worker.user_id).first()
                if su:
                    specialist = su.name or su.email
        items.append(
            {
                "booking_number": b.booking_number,
                "service_type": b.service_type,
                "status": b.status,
                "status_human": STATUS_HUMAN.get(b.status, b.status),
                "specialist": specialist,
                "eta_minutes": b.eta_minutes,
                "booking_id": b.id,
            }
        )
    return {
        "ok": True,
        "summary": f"You have {len(items)} active booking(s).",
        "bookings": items,
    }


async def tool_booking_status(db, booking_id: str, user) -> dict:
    """Return the live status of a specific booking the customer owns."""
    b = (
        db.query(dbmodels.Booking)
        .filter(dbmodels.Booking.id == booking_id, dbmodels.Booking.client_id == user.id)
        .first()
    )
    if not b:
        return {"ok": False, "summary": "Booking not found or not yours."}
    specialist = "Not yet assigned"
    if b.worker_id:
        worker = db.query(dbmodels.Worker).filter(dbmodels.Worker.id == b.worker_id).first()
        if worker:
            su = db.query(dbmodels.User).filter(dbmodels.User.id == worker.user_id).first()
            if su:
                specialist = su.name or su.email
    return {
        "ok": True,
        "booking_id": b.id,
        "booking_number": b.booking_number,
        "service_type": b.service_type,
        "status": b.status,
        "status_human": STATUS_HUMAN.get(b.status, b.status),
        "specialist": specialist,
        "eta_minutes": b.eta_minutes,
        "summary": (
            f"Booking {b.booking_number} ({b.service_type}) is "
            f"{STATUS_HUMAN.get(b.status, b.status)}."
        ),
    }


TOOLS = {
    "search_specialists": tool_search_specialists,
    "list_nearby_specialists": tool_list_nearby_specialists,
    "my_bookings": tool_my_bookings,
    "booking_status": tool_booking_status,
    "service_catalog": tool_service_catalog,
    "estimate_cost": tool_estimate_cost,
    "cancel_booking": tool_cancel_booking,
}
