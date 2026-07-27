import sys, os
sys.path.insert(0, r'C:\Users\Akshay\Desktop\shuroqx-Redesign\backend')
os.chdir(r'C:\Users\Akshay\Desktop\shuroqx-Redesign\backend')
from dotenv import load_dotenv
load_dotenv()
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    result = conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"))
    tables = [r[0] for r in result.fetchall()]
    print("Tables:", tables)
    print("payments exists:", "payments" in tables)
    
    # Check is_paid column
    result2 = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='bookings' AND column_name='is_paid'"))
    row = result2.fetchone()
    print("is_paid column:", row is not None)
