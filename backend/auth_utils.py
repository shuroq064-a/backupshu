"""
auth_utils.py
─────────────
Shared JWT helpers used by all routers.
Keeps token logic in ONE place — no duplication.

Imports:
    from auth_utils import create_access_token, get_current_user, get_admin_user
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import jwt
import os
from pathlib import Path

from dotenv import load_dotenv

if __package__:
    from .database import get_db
    from .dbmodels import User
else:
    from database import get_db
    from dbmodels import User

# ─────────────────────────────────────────────
#  Config
# ─────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.getenv("JWT_SECRET")
if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET must be set in backend/.env or the deployment environment")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# HTTPBearer reads the Authorization: Bearer <token> header automatically
security = HTTPBearer()


# ─────────────────────────────────────────────
#  Token Creation
# ─────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """
    Issue a signed JWT.
    Payload should include: { "sub": user.id, "email": user.email, "role": user.role }
    Includes token_version from the user record so old tokens can be invalidated.
    """
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {**data, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


# ─────────────────────────────────────────────
#  Dependencies
# ─────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """
    FastAPI dependency — decodes JWT and returns the current User.
    Use on any protected route:
        current_user: User = Depends(get_current_user)
    """
    token = credentials.credentials

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired — please log in again",
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    token_version = payload.get("token_version")
    if token_version is not None and token_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been invalidated — please log in again",
        )

    return user


def get_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    FastAPI dependency — same as get_current_user but also enforces role == 'admin'.
    Use on any admin-only route:
        admin: User = Depends(get_admin_user)
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
