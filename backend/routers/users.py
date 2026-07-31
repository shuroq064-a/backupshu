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

router = APIRouter(prefix="/users", tags=["User Profile"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
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
        allowed_languages = ["english", "hindi", "telugu"]
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

    if changed:
        db.commit()
        db.refresh(current_user)

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
#  DELETE /users/me
#  Frontend: userApi.deleteAccount()
#  Used by:  Settings → Delete Account (confirmation)
# ─────────────────────────────────────────────

@router.delete("/me")
def delete_account(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Permanently delete the current user account.
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
    try:
        user_id = current_user.id
        
        # Delete the user - SQLAlchemy cascades will delete related records
        # The database foreign key constraints will also enforce cascade delete
        db.delete(current_user)
        db.commit()
        
        print(f"✓ User {user_id} account deleted successfully")
        
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
