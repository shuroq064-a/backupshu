"""
routers/users.py
────────────────
User profile self-service endpoints.
All routes are JWT protected.

Routes (must match frontend lib/api.ts userApi exactly):
    GET  /users/me                 → get own profile
    PUT  /users/me                 → update profile (name, phone, address, language)
    POST /users/change-password    → change password
"""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext
import os
import sys
import uuid

if __package__ and "." in __package__:
    from ..database import get_db
    from ..dbmodels import User, UserAddress
    from ..models import (
        UserAddressCreate,
        UserAddressOut,
        UserAddressUpdate,
        UserProfileOut,
        UpdateProfileRequest,
        ChangePasswordRequest,
    )
    from ..auth_utils import get_current_user
    from ..services.rate_limiter import rate_limit
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db
    from dbmodels import User, UserAddress
    from models import (
        UserAddressCreate,
        UserAddressOut,
        UserAddressUpdate,
        UserProfileOut,
        UpdateProfileRequest,
        ChangePasswordRequest,
    )
    from auth_utils import get_current_user
    from services.rate_limiter import rate_limit
    from services.worker_location import sync_worker_home_from_address

router = APIRouter(prefix="/users", tags=["User Profile"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Delete-account OTP verification ──────────────────────────────────────────
# OTPs are stored in memory (hashed), so a restart invalidates them — which is
# fine for a short-lived verification step.

import hashlib
import random
import string
import threading
from datetime import datetime, timedelta

_DELETE_OTP_LENGTH = 6
_DELETE_OTP_TTL = timedelta(minutes=5)
_DELETE_OTP_MAX_ATTEMPTS = 5
_delete_otp_lock = threading.Lock()
_delete_otp_store: dict[str, dict] = {}


def _mask_email(email: str) -> str:
    """Mask an email for display, e.g. a***@gmail.com."""
    local, _, domain = email.partition("@")
    if len(local) <= 1:
        return "***@" + domain
    return local[0] + "***@" + domain


def _store_delete_otp(user_id: str, otp: str) -> None:
    digest = hashlib.sha256(otp.encode()).hexdigest()
    with _delete_otp_lock:
        _delete_otp_store[user_id] = {
            "hash": digest,
            "expires_at": datetime.utcnow() + _DELETE_OTP_TTL,
            "attempts": 0,
        }


def _verify_delete_otp(user_id: str, otp: str) -> bool:
    with _delete_otp_lock:
        entry = _delete_otp_store.get(user_id)
        if not entry:
            return False
        if datetime.utcnow() > entry["expires_at"]:
            _delete_otp_store.pop(user_id, None)
            return False
        entry["attempts"] += 1
        if entry["attempts"] > _DELETE_OTP_MAX_ATTEMPTS:
            _delete_otp_store.pop(user_id, None)
            return False
        if not hashlib.sha256(otp.encode()).hexdigest() == entry["hash"]:
            return False
        _delete_otp_store.pop(user_id, None)
        return True


def _send_delete_otp_email(user: User, otp: str) -> bool:
    from services.email_service import is_email_configured, send_email

    if not is_email_configured():
        return False
    subject = "ShuroqX — confirm account deletion"
    body = (
        "<div style='font-family:Arial,sans-serif;max-width:480px;margin:auto;'>"
        "<h2 style='color:#222;'>Confirm account deletion</h2>"
        "<p style='color:#444;'>You requested to permanently delete your ShuroqX account. "
        "Use this one-time code to confirm:</p>"
        f"<p style='font-size:28px;font-weight:bold;letter-spacing:6px;color:#e11d48;'>{otp}</p>"
        "<p style='color:#888;font-size:12px;'>This code expires in 5 minutes. "
        "If you didn't request this, you can safely ignore this email.</p>"
        "</div>"
    )
    return send_email(user.email, subject, body)


def _address_out(address: UserAddress) -> UserAddressOut:
    return UserAddressOut(
        id=address.id,
        address=address.address,
        latitude=address.latitude,
        longitude=address.longitude,
        receiverName=address.receiver_name,
        contactNumber=address.contact_number,
        houseFlat=address.house_flat,
        blockArea=address.block_area,
        landmark=address.landmark,
        addressLabel=address.address_label,
        customAddressLabel=address.custom_address_label,
        isDefault=bool(address.is_default),
        createdAt=address.created_at,
        updatedAt=address.updated_at,
    )


def _clear_default_addresses(db: Session, user_id: str) -> None:
    db.query(UserAddress).filter(
        UserAddress.user_id == user_id,
        UserAddress.is_default.is_(True),
    ).update({"is_default": False}, synchronize_session=False)


def _apply_address_payload(address: UserAddress, payload: UserAddressCreate | UserAddressUpdate) -> None:
    address.address = payload.address.strip()
    address.latitude = payload.latitude
    address.longitude = payload.longitude
    address.receiver_name = payload.receiver_name.strip()
    address.contact_number = payload.contact_number.strip()
    address.house_flat = payload.house_flat.strip()
    address.block_area = payload.block_area.strip()
    address.landmark = payload.landmark
    address.address_label = payload.address_label or "Home"
    address.custom_address_label = payload.custom_address_label


def _is_onboarded(user: "User") -> bool:
    """Onboarding counts as complete only when every field the onboarding
    flow collects is actually present on the record."""
    return bool(
        user.name
        and user.phone
        and user.address
        and user.gender
        and user.age is not None
        and user.profession
        and user.language
    )


# ─────────────────────────────────────────────
#  GET /users/me
#  Frontend: userApi.getProfile()
#  Used by:  profile page on load
# ─────────────────────────────────────────────

@router.get("/me", response_model=UserProfileOut)
def get_my_profile(
    current_user: User = Depends(get_current_user),
):
    """Return the full profile of the currently logged-in user."""
    return UserProfileOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        address=current_user.address,
        location=current_user.location, 
        language=current_user.language or "english",
        avatar=current_user.avatar,
        role=current_user.role,
        age=current_user.age,
        gender=current_user.gender,
        profession=current_user.profession,
        onboardingCompleted=current_user.onboarding_completed,
        createdAt=current_user.created_at.isoformat() if current_user.created_at else None,
    )


# ─────────────────────────────────────────────
#  PUT /users/me
#  Frontend: userApi.updateProfile()
#  Used by:  profile page edit & save
# ─────────────────────────────────────────────

@router.put("/me", response_model=UserProfileOut)
def update_my_profile(
    payload: UpdateProfileRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate_limit(request, "update-profile", max_requests=20, window_seconds=60)
    """
    Update profile fields.
    Only updates fields that are explicitly sent (partial update).
    Email and role are never changed here.
    """
    changed = False

    if payload.name is not None:
        current_user.name = payload.name
        changed = True

    if payload.phone is not None:
        current_user.phone = payload.phone
        changed = True

    if payload.address is not None:
        current_user.address = payload.address
        changed = True

    if payload.language is not None:
        allowed_languages = ["english", "hindi", "telugu", "urdu"]
        if payload.language not in allowed_languages:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Language must be one of: {', '.join(allowed_languages)}",
            )
        current_user.language = payload.language
        changed = True

    if payload.location is not None:
        current_user.location = payload.location
        changed = True

    if payload.age is not None:
        if payload.age < 13 or payload.age > 120:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Age must be between 13 and 120.",
            )
        current_user.age = payload.age
        changed = True

    if payload.gender is not None:
        allowed_genders = ["female", "male", "non-binary", "prefer-not"]
        if payload.gender not in allowed_genders:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Gender must be one of: {', '.join(allowed_genders)}",
            )
        current_user.gender = payload.gender
        changed = True

    if payload.profession is not None:
        current_user.profession = payload.profession
        changed = True

    # onboarding_completed is DERIVED from required profile fields, never
    # client-supplied — otherwise any user could mark onboarding done without
    # actually completing it.
    derived = _is_onboarded(current_user)
    if current_user.onboarding_completed != derived:
        current_user.onboarding_completed = derived
        changed = True

    if changed:
        db.commit()
        db.refresh(current_user)
        # The specialist's home base is derived from the profile address, so a
        # moved address must re-geocode the Worker row — otherwise the 5 km
        # nearby matcher would keep using the stale coordinates.
        sync_worker_home_from_address(db, current_user)

    return UserProfileOut(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        address=current_user.address,
        language=current_user.language or "english",
        location=current_user.location,
        avatar=current_user.avatar,
        role=current_user.role,
        age=current_user.age,
        gender=current_user.gender,
        profession=current_user.profession,
        onboardingCompleted=current_user.onboarding_completed,
        createdAt=current_user.created_at.isoformat() if current_user.created_at else None,
    )


@router.get("/me/addresses", response_model=list[UserAddressOut])
def list_my_addresses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    addresses = (
        db.query(UserAddress)
        .filter(UserAddress.user_id == current_user.id)
        .order_by(UserAddress.is_default.desc(), UserAddress.updated_at.desc())
        .all()
    )
    return [_address_out(address) for address in addresses]


@router.post("/me/addresses", response_model=UserAddressOut, status_code=status.HTTP_201_CREATED)
def create_my_address(
    payload: UserAddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    has_existing = db.query(UserAddress.id).filter(UserAddress.user_id == current_user.id).first() is not None
    should_be_default = payload.is_default or not has_existing
    if should_be_default:
        _clear_default_addresses(db, current_user.id)

    address = UserAddress(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        is_default=should_be_default,
    )
    _apply_address_payload(address, payload)
    db.add(address)
    db.commit()
    db.refresh(address)
    return _address_out(address)


@router.put("/me/addresses/{address_id}", response_model=UserAddressOut)
def update_my_address(
    address_id: str,
    payload: UserAddressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    address = (
        db.query(UserAddress)
        .filter(UserAddress.id == address_id, UserAddress.user_id == current_user.id)
        .first()
    )
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found.")

    if payload.is_default:
        _clear_default_addresses(db, current_user.id)

    _apply_address_payload(address, payload)
    address.is_default = payload.is_default

    default_exists = db.query(UserAddress.id).filter(
        UserAddress.user_id == current_user.id,
        UserAddress.is_default.is_(True),
        UserAddress.id != address.id,
    ).first()
    if not default_exists and not address.is_default:
        address.is_default = True

    db.commit()
    db.refresh(address)
    return _address_out(address)


@router.delete("/me/addresses/{address_id}")
def delete_my_address(
    address_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    address = (
        db.query(UserAddress)
        .filter(UserAddress.id == address_id, UserAddress.user_id == current_user.id)
        .first()
    )
    if not address:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found.")

    was_default = bool(address.is_default)
    db.delete(address)
    db.flush()

    if was_default:
        next_address = (
            db.query(UserAddress)
            .filter(UserAddress.user_id == current_user.id)
            .order_by(UserAddress.updated_at.desc())
            .first()
        )
        if next_address:
            next_address.is_default = True

    db.commit()
    return {"message": "Address deleted successfully."}


# ─────────────────────────────────────────────
#  POST /users/change-password
#  Frontend: userApi.changePassword()
#  Used by:  Privacy & Security → Change Password
# ─────────────────────────────────────────────

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Change password.
    - Requires current password to verify identity.
    - OAuth-only accounts (no password) cannot use this.
    """
    rate_limit(request, "change-password", max_requests=10, window_seconds=3600)
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account uses social login and does not have a password",
        )

    if not pwd_context.verify(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )

    if len(payload.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters",
        )

    current_user.hashed_password = pwd_context.hash(payload.new_password)
    current_user.token_version = (current_user.token_version or 0) + 1
    db.commit()

    return {"message": "Password changed successfully"}


# ─────────────────────────────────────────────
#  POST /users/me/delete-verification
#  Frontend: userApi.requestDeleteVerification()
#  Used by:  Settings → Delete Account (step 1: send OTP)
# ─────────────────────────────────────────────

@router.post("/me/delete-verification")
def request_delete_verification(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Send a one-time OTP to the account's registered email to authorize deletion.

    - Rate limited (5 per hour).
    - OTP expires after 5 minutes / 5 failed attempts.
    - If SMTP is not configured: in non-production environments the OTP is
      returned for testing; in production this is an explicit 503.
    """
    rate_limit(request, "delete-verification", max_requests=5, window_seconds=3600)

    otp = "".join(random.choices(string.digits, k=_DELETE_OTP_LENGTH))
    _store_delete_otp(current_user.id, otp)

    from services.email_service import is_email_configured

    is_prod = os.getenv("APP_ENV", "development") == "production"
    sent = _send_delete_otp_email(current_user, otp)

    if sent:
        return {
            "ok": True,
            "via": "email",
            "contact": _mask_email(current_user.email),
            "expiresInSeconds": int(_DELETE_OTP_TTL.total_seconds()),
        }
    if not is_email_configured() and not is_prod:
        # Local/dev convenience: return the code so flows can be tested.
        return {
            "ok": True,
            "via": "email",
            "contact": _mask_email(current_user.email),
            "expiresInSeconds": int(_DELETE_OTP_TTL.total_seconds()),
            "dev_otp": otp,
            "dev_hint": "SMTP not configured — dev mode only",
        }
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="We couldn't send the verification code right now. Please try again later.",
    )


# ─────────────────────────────────────────────
#  DELETE /users/me
#  Frontend: userApi.deleteAccount(otp)
#  Used by:  Settings → Delete Account (confirmation)
# ─────────────────────────────────────────────

@router.delete("/me")
def delete_account(
    request: Request,
    otp: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently delete the current user account.
    Requires the OTP from POST /users/me/delete-verification.
    This cascades to delete:
    - UserQuery records
    - Worker profile (if specialist)
    - WorkerService entries
    - Bookings
    - All related data
    
    Cascade deletes are handled by:
    1. Database-level ON DELETE CASCADE constraints
    2. SQLAlchemy cascade="all, delete-orphan" relationships
    """
    if not otp or not _verify_delete_otp(current_user.id, otp):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired verification code. Please request a new code and try again.",
        )
    try:
        user_id = current_user.id
        
        # Delete the user - SQLAlchemy cascades will delete related records
        # The database foreign key constraints will also enforce cascade delete
        db.delete(current_user)
        db.commit()

        import logging
        logging.getLogger(__name__).info(f"User {user_id} account deleted successfully")

        return {
            "message": "Account deleted successfully",
            "status": "deleted"
        }
    except Exception as e:
        db.rollback()
        import logging
        logging.getLogger(__name__).exception("Error deleting account")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete account. Please try again later.",
        )
