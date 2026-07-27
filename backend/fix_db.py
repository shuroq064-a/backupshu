import sys, os
sys.path.insert(0, r'C:\Users\Akshay\Desktop\shuroqx-Redesign\backend')
os.chdir(r'C:\Users\Akshay\Desktop\shuroqx-Redesign\backend')
from dotenv import load_dotenv
load_dotenv()
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE bookings ADD COLUMN is_paid BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.commit()
        print("Added is_paid column to bookings")
    except Exception as e:
        print(f"Already exists or error: {e}")
    
    # Verify
    result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name='is_paid'"))
    row = result.fetchone()
    print("is_paid exists:", row is not None)
