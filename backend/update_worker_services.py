"""
Update WorkerService records to have correct status based on worker and service history
"""
import os
import sys
from datetime import datetime

BACKEND_DIR = os.path.dirname(__file__)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import SessionLocal
from dbmodels import WorkerService, Worker, Service
from sqlalchemy import update

def fix_all_services():
    db = SessionLocal()
    try:
        # Get all WorkerService records that don't have a status or have NULL status
        services = db.query(WorkerService).all()
        
        print(f"Total WorkerService records: {len(services)}\n")
        
        for idx, ws in enumerate(services, 1):
            worker = db.query(Worker).filter(Worker.id == ws.worker_id).first()
            service = db.query(Service).filter(Service.id == ws.service_id).first()
            
            old_status = ws.status
            
            # Determine status based on worker and service relationship
            if worker.verification_status == "approved":
                # If worker is approved, all their services should be verified
                new_status = "verified"
            else:
                # Otherwise, services are pending
                new_status = "pending"
            
            # Update if status is None or empty
            if not ws.status or ws.status == "":
                ws.status = new_status
                db.commit()
                print(f"{idx}. {worker.user_id} - {service.name}: {old_status} → {new_status}")
            else:
                print(f"{idx}. {worker.user_id} - {service.name}: {old_status} (unchanged)")
        
        print("\n✅ WorkerService records status updated!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_all_services()
