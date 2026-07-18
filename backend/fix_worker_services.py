"""
Fix existing WorkerService records to have proper status values
"""
import os
import sys

BACKEND_DIR = os.path.dirname(__file__)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import get_db, SessionLocal
from dbmodels import WorkerService, Worker

def fix_worker_services():
    db = SessionLocal()
    try:
        # Get all WorkerService records
        all_services = db.query(WorkerService).all()
        
        print(f"Found {len(all_services)} WorkerService records")
        
        updated_count = 0
        for ws in all_services:
            # If status is None or not set, determine based on worker status
            if ws.status is None or ws.status == "":
                worker = db.query(Worker).filter(Worker.id == ws.worker_id).first()
                if worker:
                    # If worker is approved, mark service as verified
                    if worker.verification_status == "approved":
                        ws.status = "verified"
                    else:
                        ws.status = "pending"
                    updated_count += 1
                    print(f"Updated {ws.worker_id} / {ws.service_id}: {ws.status}")
        
        db.commit()
        print(f"\nTotal updated: {updated_count}")
        print("✅ All WorkerService records now have proper status!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_worker_services()
