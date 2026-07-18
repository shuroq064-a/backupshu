"""
routers/location_permission.py
──────────────────────────────────────────────
Location Permission Management Router

This router handles location permission requests and management for the ShuroqX marketplace.
It supports three permission types:
  1. allow (Allow all the time) - Permanent location access grant
  2. while_using_site (While Using This Site) - Session-based location access (cleared on app close)
  3. deny (Deny) - No location access (manual selection still allowed)

Routes:
    POST   /location-permission/request          → Request location permission
    GET    /location-permission/status           → Get current permission status
    POST   /location-permission/detect           → Detect user location
    POST   /location-permission/revoke           → Revoke location permission
    POST   /location-permission/clear-on-close   → Clear session on app/website close
    GET    /location-permission/session-info     → Get session expiry info
    GET    /location-permission/search           → Search places/locations (consolidated)
    POST   /location-permission/validate-location → Validate location (consolidated)

Business Rules:
    BR-LOC-007: Location permission must be requested before accessing device GPS
    BR-LOC-008: Users who deny location access must still be able to manually select service location
    BR-LOC-009: Location data must be used only for service discovery, specialist matching, navigation
    
Session Behavior:
    - "Allow all the time" (allow): Persists permanently in User.location_permission_granted
    - "While Using This Site" (while_using_site): Stored in LocationPermission table with expiry
    - "Deny" (deny): Persists until user explicitly changes it
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
import os, sys
from datetime import datetime, timedelta
import uuid

if __package__ and "." in __package__:
    from ..database import get_db
    from ..auth_utils import get_current_user
    from ..models import (
        LocationGeocodeResponse,
        LocationPermissionRequest,
        LocationPermissionResponse,
        LocationDetectionResponse,
        LocationPlaceOut,
        LocationSelectionRequest,
        LocationSelectionResponse,
    )
    from ..dbmodels import User, LocationPermission
    from ..services.ola_maps.eta_service import OlaMapsServiceError
    from ..services.ola_maps.geocoding_service import geocode_address
    from ..services.ola_maps.place_service import search_places
    from ..services.ola_maps.reverse_geocoding_service import reverse_geocode
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    from database import get_db
    from auth_utils import get_current_user
    from models import (
        LocationGeocodeResponse,
        LocationPermissionRequest,
        LocationPermissionResponse,
        LocationDetectionResponse,
        LocationPlaceOut,
        LocationSelectionRequest,
        LocationSelectionResponse,
    )
    from dbmodels import User, LocationPermission
    from services.ola_maps.eta_service import OlaMapsServiceError
    from services.ola_maps.geocoding_service import geocode_address
    from services.ola_maps.place_service import search_places
    from services.ola_maps.reverse_geocoding_service import reverse_geocode


router = APIRouter(prefix="/location-permission", tags=["Location Permission"])
SESSION_TIMEOUT_MINUTES = 30


# ============================================================================
# HELPER FUNCTIONS - Location Validation (Consolidated)
# ============================================================================

def _validate_location(
    address: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None
) -> dict:
    """
    Consolidated location validation logic.
    
    Handles both:
    - Coordinate-based validation (reverse geocoding)
    - Address-based validation (geocoding)
    
    Args:
        address: Address string to validate
        latitude: Latitude coordinate
        longitude: Longitude coordinate
    
    Returns:
        dict with keys: {formatted_address, latitude, longitude, valid, message}
    
    Raises:
        HTTPException on validation failure
    """
    # Validate coordinates if provided
    if latitude is not None and longitude is not None:
        if latitude < -90 or latitude > 90:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Latitude must be between -90 and 90"
            )
        if longitude < -180 or longitude > 180:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Longitude must be between -180 and 180"
            )
        
        try:
            result = reverse_geocode(latitude, longitude)
            return {
                "formatted_address": result["formatted_address"],
                "latitude": latitude,
                "longitude": longitude,
                "valid": True,
                "message": "Coordinates validated successfully"
            }
        except (OlaMapsServiceError, ValueError):
            # A user-selected pin is still a valid service location. Reverse
            # geocoding enriches it with a street address, but must not block
            # manual location selection when the maps provider is unavailable.
            fallback_address = address.strip() if address and address.strip() else (
                f"Selected location ({latitude:.5f}, {longitude:.5f})"
            )
            return {
                "formatted_address": fallback_address,
                "latitude": latitude,
                "longitude": longitude,
                "valid": True,
                "message": "Location saved from the map pin; address lookup is currently unavailable."
            }
    
    # Validate address if provided
    if address:
        try:
            result = geocode_address(address)
            return {
                "formatted_address": result["formatted_address"],
                "latitude": result["latitude"],
                "longitude": result["longitude"],
                "valid": True,
                "message": "Address validated successfully"
            }
        except (OlaMapsServiceError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Unable to find that location. Please try a more specific address."
            )
    
    # Neither address nor coordinates provided
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Either an address or coordinates must be provided."
    )


# ============================================================================
# HELPER FUNCTIONS - Permission Management (Database-backed)
# ============================================================================

def _get_active_permission(user_id: str, db: Session) -> Optional[str]:
    """
    Get the current active permission status for a user from database.
    
    Checks in order:
    1. Permanent "allow" in user.location_permission_granted
    2. Valid session-based "while_using_site" in LocationPermission table
    3. Explicit "deny" in user.location_permission_granted
    
    Returns:
        "allow", "while_using_site", "deny", or None
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None
    
    # Check for permanent "allow" permission
    if user.location_permission_granted == "allow":
        return "allow"
    
    # Check for valid session-based permission
    session_perm = db.query(LocationPermission).filter(
        LocationPermission.user_id == user_id,
        LocationPermission.permission_type == "while_using_site",
        LocationPermission.revoked_at.is_(None),
        LocationPermission.expires_at > datetime.utcnow()
    ).first()
    
    if session_perm:
        return "while_using_site"
    
    # Clean up expired session permissions
    db.query(LocationPermission).filter(
        LocationPermission.user_id == user_id,
        LocationPermission.permission_type == "while_using_site",
        LocationPermission.expires_at <= datetime.utcnow()
    ).delete()
    db.commit()
    
    # Check for explicit "deny"
    if user.location_permission_granted == "deny":
        return "deny"
    
    return None


def _set_permission(user_id: str, permission_type: str, db: Session) -> None:
    """
    Store a new permission in the database.
    
    Args:
        user_id: User's ID
        permission_type: "allow", "while_using_site", or "deny"
        db: Database session
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Revoke any existing session permissions
    db.query(LocationPermission).filter(
        LocationPermission.user_id == user_id,
        LocationPermission.revoked_at.is_(None)
    ).update({LocationPermission.revoked_at: datetime.utcnow()})
    
    if permission_type == "allow":
        # Permanent permission - store in User table
        user.location_permission_granted = "allow"
        user.location_permission_granted_at = datetime.utcnow()
    
    elif permission_type == "while_using_site":
        # Session-based permission - store in LocationPermission table
        user.location_permission_granted = "while_using_site"
        user.location_permission_granted_at = datetime.utcnow()
        
        perm = LocationPermission(
            id=str(uuid.uuid4()),
            user_id=user_id,
            permission_type="while_using_site",
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
        )
        db.add(perm)
    
    elif permission_type == "deny":
        # Explicit denial - store in User table
        user.location_permission_granted = "deny"
        user.location_permission_granted_at = datetime.utcnow()
    
    db.commit()


# ============================================================================
# ROUTE: Request Location Permission
# ============================================================================

@router.post(
    "/request",
    response_model=LocationPermissionResponse,
    summary="Request location permission",
    description="Request location permission with one of: allow, while_using_site, deny"
)
async def request_location_permission(
    req: LocationPermissionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /location-permission/request
    
    Request location permission. Returns appropriate response based on permission type.
    Stores permission in database for persistence across restarts.
    
    Business Rule BR-LOC-007: Location permission must be requested before accessing device GPS
    """
    permission_type = req.permission_type
    user_id = current_user.id
    
    # Store the permission in database
    _set_permission(user_id, permission_type, db)
    
    # Generate response based on permission type
    if permission_type == "allow":
        return LocationPermissionResponse(
            success=True,
            permission="Allow all the time",
            gps_access=True,
            allow_manual_edit=True,
            message="Location access granted permanently. You can now use GPS or manually edit your location."
        )
    
    elif permission_type == "while_using_site":
        return LocationPermissionResponse(
            success=True,
            permission="While Using This Site",
            gps_access=True,
            session_only=True,
            allow_manual_edit=True,
            message=f"Location access granted for current session only (expires in {SESSION_TIMEOUT_MINUTES} minutes). Permission will be cleared when you close the app/website."
        )
    
    elif permission_type == "deny":
        # Business Rule BR-LOC-008: Users can still manually select location
        return LocationPermissionResponse(
            success=True,
            permission="deny",
            gps_access=False,
            manual_location_allowed=True,
            booking_allowed=True,
            message="Location access denied. You can still manually choose your service location and continue with bookings."
        )
    
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Invalid permission_type: {permission_type}"
    )


# ============================================================================
# ROUTE: Get Permission Status
# ============================================================================

@router.get(
    "/status",
    response_model=Optional[str],
    summary="Get current location permission status",
    description="Get the current location permission status for the logged-in user from database"
)
async def get_permission_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /location-permission/status
    
    Get the current location permission status for the user from database.
    Returns: "allow", "while_using_site", "deny", or None (not requested)
    """
    return _get_active_permission(current_user.id, db)


# ============================================================================
# ROUTE: Detect User Location
# ============================================================================

@router.post(
    "/detect",
    response_model=LocationDetectionResponse,
    summary="Detect user location",
    description="Attempt to detect user location if permission is granted"
)
async def detect_location(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /location-permission/detect
    
    Detect user's current location if permission is granted.
    Checks database for current permission status.
    
    Returns:
    - latitude, longitude if permission is "Allow all the time" or valid "While Using This Site"
    - None coordinates if permission is "deny"
    - Error if permission not requested yet
    
    Business Rule BR-LOC-007: Must have requested permission before accessing GPS
    """
    user_id = current_user.id
    perm_status = _get_active_permission(user_id, db)
    
    if perm_status is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Location permission not requested. Please request permission first."
        )
    
    if perm_status == "deny":
        # User explicitly denied - no GPS access
        return LocationDetectionResponse(
            success=True,
            permission="deny",
            latitude=None,
            longitude=None,
            allow_manual_edit=True,
            message="Location access denied. Please manually select your location."
        )
    
    # For "Allow all the time" and "While Using This Site", GPS is ready
    return LocationDetectionResponse(
        success=True,
        permission=perm_status,
        latitude=None,  # Frontend will provide actual GPS coordinates
        longitude=None,
        allow_manual_edit=True,
        message=f"Location detection ready. Permission type: {perm_status}. Waiting for GPS coordinates from device."
    )


# ============================================================================
# ROUTE: Validate Location (CONSOLIDATED)
# ============================================================================

@router.post(
    "/validate-location",
    response_model=LocationSelectionResponse,
    summary="Validate selected location",
    description="Validate a manually selected or searched service location before booking. Consolidated endpoint for both address and coordinate validation."
)
async def validate_location_selection(
    payload: LocationSelectionRequest,
    db: Session = Depends(get_db),
):
    """
    POST /location-permission/validate-location
    
    CONSOLIDATED ENDPOINT: Replaces /geocode, /reverse-geocode, and /validate
    
    Validate a selected service location using either:
    - Coordinates (latitude + longitude) → reverse geocoding
    - Address string → geocoding
    
    All validation logic is centralized in _validate_location() helper.
    """
    result = _validate_location(
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude
    )
    
    return LocationSelectionResponse(
        formatted_address=result["formatted_address"],
        latitude=result["latitude"],
        longitude=result["longitude"],
        valid=result["valid"],
        message=result["message"]
    )


# ============================================================================
# ROUTE: Search Places (CONSOLIDATED)
# ============================================================================

@router.get(
    "/search",
    response_model=list[LocationPlaceOut],
    summary="Search places",
    description="Search map places so users can manually select a service location"
)
async def search_location_places(
    query: str,
    db: Session = Depends(get_db)
):
    """
    GET /location-permission/search

    Return place suggestions for manual service-location selection.
    Useful for autocomplete/suggestions while user types a location.

    Text search is POI/address oriented and returns nothing for administrative
    regions (e.g. a state or city name). When it yields no results we fall back
    to geocoding the raw query so the user still gets a selectable point to drop
    the pin on.
    """
    try:
        places = search_places(query)
    except (OlaMapsServiceError, ValueError):
        places = []

    if not places:
        try:
            geocoded = geocode_address(query)
            places = [{
                "name": query.strip(),
                "address": geocoded["formatted_address"],
                "latitude": geocoded["latitude"],
                "longitude": geocoded["longitude"],
            }]
        except (OlaMapsServiceError, ValueError):
            places = []

    return [LocationPlaceOut(**place) for place in places[:8]]


# ============================================================================
# ROUTE: Revoke Permission
# ============================================================================

@router.post(
    "/revoke",
    response_model=LocationPermissionResponse,
    summary="Revoke location permission",
    description="Revoke previously granted location permission"
)
async def revoke_permission(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /location-permission/revoke
    
    Revoke previously granted location permission from database.
    User will be prompted to request permission again for GPS access.
    Manual location selection will still be available.
    """
    user_id = current_user.id
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Mark all permissions as revoked in database
    db.query(LocationPermission).filter(
        LocationPermission.user_id == user_id,
        LocationPermission.revoked_at.is_(None)
    ).update({LocationPermission.revoked_at: datetime.utcnow()})
    
    # Clear permission from user profile
    user.location_permission_granted = None
    user.location_permission_granted_at = None
    db.commit()
    
    return LocationPermissionResponse(
        success=True,
        permission="none",
        gps_access=False,
        manual_location_allowed=True,
        booking_allowed=True,
        message="Location permission revoked. You can still manually select your service location."
    )


# ============================================================================
# ROUTE: Clear Session on App Close
# ============================================================================

@router.post(
    "/clear-on-close",
    response_model=dict,
    summary="Clear session on app/website close",
    description="Called by frontend when app/website closes to clear session-based permissions"
)
async def clear_session_on_close(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    POST /location-permission/clear-on-close
    
    Called by frontend when app/website closes.
    
    When app/website is opened again, user must reselect permission from scratch.
    
    Business Rule: "While Using This Site" permission is session-based only.
    Once session ends, permission must be requested again.
    
    Behaviors:
    - "While Using This Site": Revoke immediately
    - "Allow all the time": No action (persists)
    - "Deny": No action (persists until user changes)
    """
    user_id = current_user.id
    
    # Get current permission
    perm_status = _get_active_permission(user_id, db)
    
    if perm_status == "while_using_site":
        # Revoke session permission
        db.query(LocationPermission).filter(
            LocationPermission.user_id == user_id,
            LocationPermission.permission_type == "while_using_site",
            LocationPermission.revoked_at.is_(None)
        ).update({LocationPermission.revoked_at: datetime.utcnow()})
        
        user = db.query(User).filter(User.id == user_id).first()
        user.location_permission_granted = None
        db.commit()
        
        return {
            "success": True,
            "message": "Session-based location permission cleared. You will be asked again when you open the app/website next time.",
            "cleared": True,
            "permission_type": "while_using_site"
        }
    
    elif perm_status == "allow":
        return {
            "success": True,
            "message": "Permanent location permission persists. No action taken.",
            "cleared": False,
            "permission_type": "allow"
        }
    
    elif perm_status == "deny":
        return {
            "success": True,
            "message": "Deny permission persists. Manual location selection will be required.",
            "cleared": False,
            "permission_type": "deny"
        }
    
    return {
        "success": True,
        "message": "No active permission to clear.",
        "cleared": False,
        "permission_type": None
    }


# ============================================================================
# ROUTE: Get Session Info
# ============================================================================

@router.get(
    "/session-info",
    summary="Get session permission info",
    description="Get information about active session-based permissions from database"
)
async def get_session_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    GET /location-permission/session-info
    
    Get information about the current session-based permission from database.
    Useful for frontend to show remaining session time and prompt user before session expires.
    """
    user_id = current_user.id
    
    session_perm = db.query(LocationPermission).filter(
        LocationPermission.user_id == user_id,
        LocationPermission.permission_type == "while_using_site",
        LocationPermission.revoked_at.is_(None),
        LocationPermission.expires_at > datetime.utcnow()
    ).first()
    
    if not session_perm:
        return {
            "active": False,
            "permission": None,
            "expires_at": None,
            "remaining_minutes": None
        }
    
    remaining_time = session_perm.expires_at - datetime.utcnow()
    remaining_minutes = int(remaining_time.total_seconds() / 60)
    
    return {
        "active": True,
        "permission": "While Using This Site",
        "expires_at": session_perm.expires_at.isoformat(),
        "remaining_minutes": remaining_minutes,
        "message": f"Permission active for current session. Expires in {remaining_minutes} minutes."
    }


# ============================================================================
# IP-BASED GEOLOCATION PROXY
# Called by the frontend when GPS is unavailable/denied.
# We do the external lookup server-side so there are no browser CORS issues.
# ============================================================================

@router.get("/ip-location")
async def get_ip_location():
    """
    Returns approximate location (city/region/country/lat/lng) based on the
    server's view of the caller's IP. Uses ip-api.com — a server-friendly
    service with no API key needed for non-commercial use.
    """
    import httpx
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # ip-api.com returns JSON with lat/lon based on the incoming IP.
            # We use fields= to get only what we need.
            resp = await client.get(
                "http://ip-api.com/json/?fields=status,city,regionName,country,lat,lon,message"
            )
            data = resp.json()
            if data.get("status") == "success":
                return {
                    "success": True,
                    "latitude": data.get("lat"),
                    "longitude": data.get("lon"),
                    "city": data.get("city", ""),
                    "region": data.get("regionName", ""),
                    "country": data.get("country", ""),
                }
    except Exception:
        pass
    return {"success": False, "latitude": None, "longitude": None, "city": "", "region": "", "country": ""}
