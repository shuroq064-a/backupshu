#!/usr/bin/env python
"""
Seed services to the database.
Run this from the backend directory:
    python seed_services.py
"""

import os
import sys
import uuid
from datetime import datetime

# Add backend to path
BACKEND_DIR = os.path.dirname(__file__)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import SessionLocal
from dbmodels import Service

# Services to seed
SERVICES = [
    "Electrical",
    "Plumbing",
    "Carpentry",
    "Painting",
    "AC Repair",
    "Cleaning",
    "Gardening",
]

def seed_services():
    """Seed all services to the database."""
    db = SessionLocal()
    try:
        for service_name in SERVICES:
            # Check if service already exists
            existing = db.query(Service).filter(Service.name == service_name).first()
            if existing:
                print(f"✓ {service_name} already exists (id: {existing.id})")
            else:
                # Create new service
                service = Service(
                    id=f"service_{uuid.uuid4().hex[:8]}",
                    name=service_name,
                    description=f"{service_name} services",
                    created_at=datetime.utcnow()
                )
                db.add(service)
                print(f"✓ Adding {service_name}")
        
        db.commit()
        print("\n✅ All services seeded successfully!")
        
        # Verify
        all_services = db.query(Service).order_by(Service.name.asc()).all()
        print(f"\nTotal services in database: {len(all_services)}")
        for service in all_services:
            print(f"  - {service.name}")
            
    except Exception as e:
        print(f"❌ Error seeding services: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    seed_services()
