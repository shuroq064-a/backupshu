"""
Migration script to fix foreign key constraints for cascade deletes
"""
import os
import sys

BACKEND_DIR = os.path.dirname(__file__)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import SessionLocal
from sqlalchemy import text

def fix_cascade_deletes():
    db = SessionLocal()
    try:
        # Check database type
        db_url = os.environ.get("DATABASE_URL", "")
        
        if "postgres" in db_url or "postgresql" in db_url:
            print("🔄 Fixing PostgreSQL foreign key constraints...")
            
            # Drop existing constraints and recreate with CASCADE
            constraints_to_fix = [
                {
                    "table": "workers",
                    "column": "user_id",
                    "constraint_name": "workers_user_id_fkey",
                    "references": "users(id)"
                },
                {
                    "table": "bookings",
                    "column": "client_id",
                    "constraint_name": "bookings_client_id_fkey",
                    "references": "users(id)"
                },
                {
                    "table": "bookings",
                    "column": "worker_id",
                    "constraint_name": "bookings_worker_id_fkey",
                    "references": "workers(id)"
                },
                {
                    "table": "\"userQuery\"",
                    "column": "user_id",
                    "constraint_name": "userQuery_user_id_fkey",
                    "references": "users(id)"
                }
            ]
            
            for constraint in constraints_to_fix:
                try:
                    # Drop the old constraint
                    drop_sql = f"ALTER TABLE {constraint['table']} DROP CONSTRAINT IF EXISTS {constraint['constraint_name']} CASCADE"
                    db.execute(text(drop_sql))
                    print(f"  ✓ Dropped constraint {constraint['constraint_name']}")
                    
                    # Add the new constraint with CASCADE
                    add_sql = f"ALTER TABLE {constraint['table']} ADD CONSTRAINT {constraint['constraint_name']} FOREIGN KEY ({constraint['column']}) REFERENCES {constraint['references']} ON DELETE CASCADE"
                    db.execute(text(add_sql))
                    print(f"  ✓ Created constraint {constraint['constraint_name']} with ON DELETE CASCADE")
                except Exception as e:
                    print(f"  ⚠️  Warning for {constraint['constraint_name']}: {e}")
            
            db.commit()
            print("\n✅ All cascade delete constraints fixed!")
        else:
            print("❌ Only PostgreSQL is supported for this migration")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_cascade_deletes()
