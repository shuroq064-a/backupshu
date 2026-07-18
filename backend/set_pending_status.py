"""
Directly update all WorkerService records to have proper status
"""
import os
import sys

BACKEND_DIR = os.path.dirname(__file__)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import SessionLocal
from dbmodels import WorkerService, Worker
from sqlalchemy import text

def set_pending_skills():
    db = SessionLocal()
    try:
        # Use raw SQL to set status for all records
        db.execute(text("""
            UPDATE worker_services 
            SET status = 'pending'
            WHERE status IS NULL OR status = ''
        """))
        db.commit()
        
        # Now check what we have
        all_services = db.query(WorkerService).all()
        print(f"Total services in DB: {len(all_services)}")
        
        for ws in all_services:
            worker = db.query(Worker).filter(Worker.id == ws.worker_id).first()
            print(f"Worker: {worker.user_id if worker else 'N/A'}, Service ID: {ws.service_id}, Status: {ws.status}")
        
        print("\n✅ All services updated!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    set_pending_skills()
