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

# ── Token signing strategy ────────────────────────────────────────────────────
# Preferred: asymmetric RS256 (JWT_PRIVATE_KEY / JWT_PUBLIC_KEY as PEM strings).
#   * The public key is safe to leak — a leaked public key CANNOT forge tokens,
#     which eliminates the "HMAC key confusion" class of attacks outright.
#   * Tokens are signed with the private key only, which never leaves the server.
# Fallback (legacy deployments): HS256 with a STRONG secret (>= 32 chars).
#   HS256 is symmetric: the same secret signs AND verifies, so if it leaks,
#   tokens can be forged. A weak/short secret is rejected at startup.

ALGORITHM = "HS256"
_SIGNING_KEY = None
_VERIFYING_KEY = None
TOKEN_ISSUER = "shuroqx-api"
_MIN_SECRET_LENGTH = 32
_WEAK_SECRETS = {"secret", "changeme", "password", "12345678", "jwt_secret"}

try:
    import cryptography  # noqa: F401  (required for RS256 in PyJWT)
    _CRYPTO_AVAILABLE = True
except ImportError:
    _CRYPTO_AVAILABLE = False


def _pem_from_env(var: str) -> str | None:
    raw = os.getenv(var, "").strip()
    if not raw:
        return None
    # Allow "\n" escapes inside a single-line .env value.
    return raw.replace("\\n", "\n") if "\\n" in raw else raw


def _init_keys() -> None:
    global ALGORITHM, _SIGNING_KEY, _VERIFYING_KEY

    private_pem = _pem_from_env("JWT_PRIVATE_KEY")
    public_pem = _pem_from_env("JWT_PUBLIC_KEY")

    if private_pem and public_pem:
        if not _CRYPTO_AVAILABLE:
            raise RuntimeError(
                "JWT_PRIVATE_KEY/JWT_PUBLIC_KEY are set (RS256) but the 'cryptography' "
                "package is not installed. Run: pip install cryptography"
            )
        ALGORITHM = "RS256"
        _SIGNING_KEY = private_pem
        _VERIFYING_KEY = public_pem
        return

    if private_pem or public_pem:
        raise RuntimeError(
            "Both JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set together (as PEM strings)."
        )

    secret = os.getenv("JWT_SECRET", "").strip()
    if not secret:
        raise RuntimeError("JWT_SECRET must be set in backend/.env or the deployment environment")

    secret_lower = secret.lower()
    if len(secret) < _MIN_SECRET_LENGTH or secret_lower in _WEAK_SECRETS:
        raise RuntimeError(
            f"JWT_SECRET is too weak (min {_MIN_SECRET_LENGTH} chars, no common defaults). "
            "Generate a strong one, e.g.: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
        )

    ALGORITHM = "HS256"
    _SIGNING_KEY = secret
    _VERIFYING_KEY = secret


_init_keys()

ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# HTTPBearer reads the Authorization: Bearer <token> header automatically
security = HTTPBearer()


# ─────────────────────────────────────────────
#  Token Creation
# ─────────────────────────────────────────────

def create_access_token(data: dict) -> str:
    """
    Issue a signed JWT (RS256 when keys are configured, else strong HS256).
    Payload should include: { "sub": user.id, "email": user.email, "role": user.role }
    Includes token_version from the user record so old tokens can be invalidated.
    """
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        **data,
        "exp": expire,
        "iat": datetime.utcnow(),
        "iss": TOKEN_ISSUER,
    }
    return jwt.encode(payload, _SIGNING_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode + verify a token. The algorithm list is PINNED to the configured
    algorithm — PyJWT will reject tokens that use any other algorithm (including
    'none' and algorithm-confusion attempts like signing with the public key).

    Raises jwt.PyJWTError subclasses on any verification failure.
    """
    payload = jwt.decode(
        token,
        _VERIFYING_KEY,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "sub"]},
        issuer=TOKEN_ISSUER,
    )
    return payload


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
        payload = decode_access_token(token)
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
