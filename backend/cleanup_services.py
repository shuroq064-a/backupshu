#!/usr/bin/env python
"""
Clean up duplicate/old services from the database.
Run this from the backend directory:
    python cleanup_services.py
"""

import os
import sys

# Add backend to path
BACKEND_DIR = os.path.dirname(__file__)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import SessionLocal
from dbmodels import Service, WorkerService

# Old services to remove
OLD_SERVICES = [
    "AC repairer",
    "Electrician",
    "Plumer",
    "cleaning",
    "xyz",
]

def cleanup_services():
    """Remove old/duplicate services from the database."""
    db = SessionLocal()
    try:
        for service_name in OLD_SERVICES:
            service = db.query(Service).filter(Service.name == service_name).first()
            if service:
                # First delete any worker_services references
                db.query(WorkerService).filter(WorkerService.service_id == service.id).delete()
                # Then delete the service
                db.delete(service)
                print(f"✓ Removed: {service_name}")
            else:
                print(f"- {service_name} not found")
        
        db.commit()
        print("\n✅ Cleanup complete!")
        
        # Verify final list
        all_services = db.query(Service).order_by(Service.name.asc()).all()
        print(f"\nFinal services in database: {len(all_services)}")
        for service in all_services:
            print(f"  - {service.name}")
            
    except Exception as e:
        print(f"❌ Error cleaning services: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_services()
