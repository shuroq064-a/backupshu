"""
services/worker_location.py
────────────────────────────
Single source of truth for a specialist's home-base coordinates.

The user's profile address (User.address / User.location) is the canonical
home base. Whenever that address changes we geocode it and mirror the result
onto the Worker row (`latitude` / `longitude` / `location_updated_at`) so the
5 km nearby matcher always reflects the specialist's CURRENT address — never
stale coordinates.

Used by:
    - routers/users.py        (PUT /users/me  → address/location change)
    - routers/workers.py      (PATCH /workers/{id}/location → manual GPS/home pin)
    - scripts/backfill_worker_locations.py (one-off repair tool)
"""
from __future__ import annotations

import os
import sys
from datetime import datetime

if __package__ and "." in __package__:
    from ..dbmodels import User, Worker
    from ..services.ola_maps.geocoding_service import geocode_address
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from dbmodels import User, Worker
    from services.ola_maps.geocoding_service import geocode_address


def worker_home_address(user: User) -> str:
    """Canonical home-base text for a specialist (address, then location)."""
    return (user.address or "").strip() or (user.location or "").strip()


def sync_worker_home_from_address(
    db,
    user: User,
    *,
    commit: bool = True,
) -> bool:
    """Geocode the user's profile address and mirror it onto their Worker row.

    Returns True when coordinates were updated, False when there is no worker
    profile, no address, or geocoding failed (stale coordinates are kept so a
    transient OLA failure never silently drops a specialist from search).
    """
    worker = db.query(Worker).filter(Worker.user_id == user.id).first()
    if not worker:
        return False

    address = worker_home_address(user)
    if not address:
        return False

    try:
        result = geocode_address(address)
    except Exception:
        return False

    worker.latitude = float(result["latitude"])
    worker.longitude = float(result["longitude"])
    worker.location_updated_at = datetime.utcnow()
    if commit:
        db.commit()
    return True


def set_worker_home_coordinates(
    db,
    worker: Worker,
    latitude: float,
    longitude: float,
    *,
    commit: bool = True,
) -> None:
    """Directly set a specialist's home-base coordinates (manual pin / GPS)."""
    worker.latitude = latitude
    worker.longitude = longitude
    worker.location_updated_at = datetime.utcnow()
    if commit:
        db.commit()
