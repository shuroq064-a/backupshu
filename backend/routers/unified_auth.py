"""
routers/unified_auth.py
───────────────────────
Unified authentication for ShuroqX.
One router handles ALL auth — users and specialists alike.

Routes (must match frontend lib/api.ts exactly):
    POST /users/register
    POST /users/login
    POST /users/oauth-login
    POST /users/switch-to-specialist   [JWT protected]
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
import os
import sys
import uuid

if __package__ and "." in __package__:
    from ..database import get_db
    from ..dbmodels import User
    from ..models import (
        UserRegister,
        UserLogin,
        OAuthLoginRequest,
        SwitchToSpecialistRequest,
        AuthResponse,
        SwitchToSpecialistResponse,
        WorkerCreate,
    )
    from ..auth_utils import create_access_token, get_current_user
    from .workers import create_worker_profile
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db
    from dbmodels import User
    from models import (
        UserRegister,
        UserLogin,
        OAuthLoginRequest,
        SwitchToSpecialistRequest,
        AuthResponse,
        SwitchToSpecialistResponse,
        WorkerCreate,
    )
    from auth_utils import create_access_token, get_current_user
    from routers.workers import create_worker_profile

# ─────────────────────────────────────────────
#  Setup
# ─────────────────────────────────────────────

router = APIRouter(prefix="/users", tags=["Unified Auth"])

# bcrypt password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─────────────────────────────────────────────
#  POST /users/register
#  Frontend: authApi.register() in lib/api.ts
#  Redux:    registerUser thunk in authSlice.ts
# ─────────────────────────────────────────────

@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    """
    Create a new user account.
    Everyone registers as role='user'.
    Specialist profile is created later via /switch-to-specialist.
    """
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists",
        )

    user = User(
        id=str(uuid.uuid4()),
        name=payload.name,
        email=payload.email,
        hashed_password=pwd_context.hash(payload.password),
        role="user",
        auth_provider="email",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
    })

    return AuthResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        access_token=token,
    )


# ─────────────────────────────────────────────
#  POST /users/login
#  Frontend: authApi.login() in lib/api.ts
#  Redux:    loginUser thunk in authSlice.ts
# ─────────────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    """
    Login with email + password.
    Works for both regular users AND admins.
    Frontend reads role from response:
        role === 'admin' -> /admin/specialists
        role === 'user'  -> /dashboard
    """
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    if not user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses social login. Please sign in with Google, Facebook or Apple",
        )

    if not pwd_context.verify(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
    })

    return AuthResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        access_token=token,
    )


# ─────────────────────────────────────────────
#  POST /users/oauth-login
#  Frontend: authApi.oauthLogin() in lib/api.ts
#  Called by NextAuth callback after social login
#  Redux:    oauthLogin thunk in authSlice.ts
# ─────────────────────────────────────────────

@router.post("/oauth-login", response_model=AuthResponse)
def oauth_login(payload: OAuthLoginRequest, db: Session = Depends(get_db)):
    """
    Upsert user from OAuth provider.
    New users always get role='user'. Admins are seeded manually only.
    """
    user = db.query(User).filter(User.email == payload.email).first()

    if not user:
        user = User(
            id=str(uuid.uuid4()),
            email=payload.email,
            name=payload.name,
            avatar=payload.avatar,
            role="user",
            auth_provider=payload.provider,
            provider_id=payload.provider_id,
            hashed_password=None,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        changed = False
        if payload.name and not user.name:
            user.name = payload.name
            changed = True
        if payload.avatar and not user.avatar:
            user.avatar = payload.avatar
            changed = True
        if changed:
            db.commit()

    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "role": user.role,
    })

    return AuthResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        access_token=token,
    )


# ─────────────────────────────────────────────
#  POST /users/switch-to-specialist
#  Frontend: authApi.switchToSpecialist() in lib/api.ts
#  Redux:    switchToSpecialist thunk in authSlice.ts
#  JWT protected
# ─────────────────────────────────────────────

@router.post("/switch-to-specialist", response_model=SwitchToSpecialistResponse)
def switch_to_specialist(
    payload: SwitchToSpecialistRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a Worker profile for the currently logged-in user.
    Idempotent: returns existing profile if already created.
    New profiles always start with verificationStatus='pending'.
    Admin must approve before specialist can accept requests.
    """
    if current_user.id != payload.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create a specialist profile for your own account",
        )

    profile = create_worker_profile(
        WorkerCreate(userId=payload.userId, service_id=payload.service_id),
        db,
        current_user,
    )

    return SwitchToSpecialistResponse(
        workerId=profile.id,
        services=profile.services,
        verificationStatus=profile.verificationStatus,
    )
