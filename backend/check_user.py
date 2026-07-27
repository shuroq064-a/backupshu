import sys; sys.path.insert(0, '.')
from database import engine, SessionLocal
from sqlalchemy import text

db = SessionLocal()

# columns
cols = db.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position")).fetchall()
print("User columns:", [r[0] for r in cols])

# find user
result = db.execute(text("SELECT id, email, role FROM users WHERE email = :e"), {'e': 'ney@gmail.com'}).fetchone()
if result:
    print(f"Found: id={result[0]}, email={result[1]}, role={result[2]}")
else:
    print("User 'ney@gmail.com' NOT found")

# count
count = db.execute(text("SELECT count(*) FROM users")).scalar()
print(f"Total users: {count}")
all_users = db.execute(text("SELECT id, email, role FROM users")).fetchall()
for u in all_users:
    print(f"  id={u[0]}, email={u[1]}, role={u[2]}")

db.close()
