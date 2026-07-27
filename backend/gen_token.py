import sys, os
sys.path.insert(0, r'C:\Users\Akshay\Desktop\shuroqx-Redesign\backend')
os.chdir(r'C:\Users\Akshay\Desktop\shuroqx-Redesign\backend')
from dotenv import load_dotenv
load_dotenv()

# Generate a test token
import jwt
from datetime import datetime, timedelta
SECRET = os.getenv('JWT_SECRET', '')
user_id = '5bc35cf4-6d19-4a04-b2e2-db5697e5a866'
token = jwt.encode({'sub': user_id, 'exp': datetime.utcnow() + timedelta(hours=1)}, SECRET, algorithm='HS256')
print(f"TOKEN={token}")
