"""
Backfill worker home-base coordinates by geocoding each specialist's saved
address (User.address / User.location) via OLA Maps.

Usage (from backend/):
    python scripts/backfill_worker_locations.py
    python scripts/backfill_worker_locations.py --force   # re-geocode even if coords exist
or as env workaround while package context exists:
    set PYTHONPATH=.
    python scripts/backfill_worker_locations.py

Safe to re-run: skips workers that already have coordinates (unless --force).
"""
import os
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import SessionLocal
from dbmodels import User, Worker
from services.ola_maps.geocoding_service import geocode_address
from services.ola_maps.eta_service import OlaMapsServiceError
from services.worker_location import worker_home_address


def main():
    force = "--force" in sys.argv
    db = SessionLocal()
    updated = 0
    skipped = 0
    failed = 0
    try:
        workers = db.query(Worker).all()
        print(f"Workers to inspect: {len(workers)} (force={force})")
        for worker in workers:
            if worker.latitude is not None and worker.longitude is not None and not force:
                skipped += 1
                continue
            user = db.query(User).filter(User.id == worker.user_id).first()
            address = worker_home_address(user) if user else ""
            if not address:
                print(f"  {worker.id}: no address to geocode -> skipped")
                skipped += 1
                continue
            try:
                result = geocode_address(address)
                worker.latitude = result["latitude"]
                worker.longitude = result["longitude"]
                db.commit()
                updated += 1
                print(f"  {worker.id}: {address[:50]!r} -> {worker.latitude:.5f},{worker.longitude:.5f}")
            except (OlaMapsServiceError, ValueError, Exception) as exc:
                db.rollback()
                failed += 1
                print(f"  {worker.id}: geocode failed: {exc}")
    finally:
        db.close()

    print(f"\nDone. updated={updated} skipped={skipped} failed={failed}")


if __name__ == "__main__":
    main()