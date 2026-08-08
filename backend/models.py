"""
All Pydantic request/response schemas for ShuroqX.
"""

import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


# Auth request schemas
class UserRegister(BaseModel):
    """POST /users/register"""

    name: str
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        return v


class UserLogin(BaseModel):
    """POST /users/login"""

    email: EmailStr
    password: str


class OAuthLoginRequest(BaseModel):
    """POST /users/oauth-login"""

    email: EmailStr
    name: Optional[str] = None
    avatar: Optional[str] = None
    provider: str
    provider_id: str


class SwitchToSpecialistRequest(BaseModel):
    """POST /users/switch-to-specialist"""

    userId: str
    service_id: str


class WorkerServiceOut(BaseModel):
    service_id: str
    service_name: str
    price_override: Optional[float] = None
    experience_years: Optional[int] = None
    status: str


# Auth response schemas
class AuthResponse(BaseModel):
    """Returned by /register, /login, /oauth-login"""

    id: str
    email: str
    name: Optional[str] = None
    role: str
    access_token: str
    phone: Optional[str] = None


class SwitchToSpecialistResponse(BaseModel):
    """Returned by /users/switch-to-specialist"""

    workerId: str
    services: list[WorkerServiceOut] = Field(default_factory=list)
    verificationStatus: str


# User profile schemas
class UserProfileOut(BaseModel):
    """
    GET /users/me
    Full profile returned to the logged-in user.
    """

    id: str
    name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    language: str = "english"
    location: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    createdAt: Optional[str] = None

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    """PUT /users/me - all fields optional, only update what's sent"""

    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    language: Optional[str] = None
    location: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    """POST /users/change-password"""

    current_password: str
    new_password: str


class UserAddressBase(BaseModel):
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    receiver_name: Optional[str] = None
    contact_number: Optional[str] = None
    house_flat: Optional[str] = None
    block_area: Optional[str] = None
    landmark: Optional[str] = None
    address_label: Optional[str] = "Home"
    custom_address_label: Optional[str] = None
    is_default: bool = False

    @field_validator("latitude")
    @classmethod
    def address_latitude_must_be_valid(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < -90 or value > 90:
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def address_longitude_must_be_valid(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < -180 or value > 180:
            raise ValueError("longitude must be between -180 and 180")
        return value

    @field_validator("address", "receiver_name", "contact_number", "house_flat", "block_area")
    @classmethod
    def address_required_strings_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value

    @field_validator("contact_number")
    @classmethod
    def address_contact_number_must_be_valid(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        value = value.strip()
        if not re.fullmatch(r"\+?[0-9]{7,15}", value):
            raise ValueError("Required")
        return value

    @field_validator("address_label")
    @classmethod
    def address_label_must_be_valid(cls, value: Optional[str]) -> Optional[str]:
        label = (value or "Home").strip()
        if label not in {"Home", "Work", "Other"}:
            raise ValueError("Required")
        return label

    @model_validator(mode="after")
    def validate_address_custom_label(self):
        self.landmark = self.landmark.strip() if self.landmark else None
        self.custom_address_label = self.custom_address_label.strip() if self.custom_address_label else None
        if self.address_label == "Other" and not self.custom_address_label:
            raise ValueError("Required")
        if self.address_label != "Other":
            self.custom_address_label = None
        return self


class UserAddressCreate(UserAddressBase):
    pass


class UserAddressUpdate(UserAddressBase):
    pass


class UserAddressOut(BaseModel):
    id: str
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    receiverName: str
    contactNumber: str
    houseFlat: str
    blockArea: str
    landmark: Optional[str] = None
    addressLabel: str
    customAddressLabel: Optional[str] = None
    isDefault: bool
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None


# ── Location Permission Schemas ──────────────────────────────────────────────

class LocationPermissionRequest(BaseModel):
    """POST /location-permission/request
    
    Request location permission with one of the display labels:
    "Allow all the time", "While Using This Site", or "Deny".
    """
    permission_type: str  # "Allow all the time", "While Using This Site", "Deny"

    @field_validator("permission_type")
    @classmethod
    def validate_permission_type(cls, value: str) -> str:
        mapping = {
            "Allow all the time": "allow",
            "While Using This Site": "while_using_site",
            "Deny": "deny",
        }

        if not isinstance(value, str):
            raise ValueError("permission_type must be a string")

        normalized = mapping.get(value)
        if not normalized:
            valid = list(mapping.keys())
            raise ValueError(f"permission_type must be one of {valid}")

        return normalized


class LocationPermissionResponse(BaseModel):
    """Response from location permission endpoints"""
    success: bool
    permission: str
    gps_access: bool
    session_only: Optional[bool] = None
    allow_manual_edit: Optional[bool] = None
    manual_location_allowed: Optional[bool] = None
    booking_allowed: Optional[bool] = None
    message: str


class LocationDetectionResponse(BaseModel):
    """Response from location detection endpoint"""
    success: bool
    permission: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    allow_manual_edit: bool = True
    message: str


class LocationGeocodeResponse(BaseModel):
    """Normalized address and coordinates returned by map lookup endpoints"""
    formatted_address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class LocationSelectionRequest(BaseModel):
    """POST /location-permission/validate

    Validate a selected service location using either a typed address or
    manually chosen coordinates, or both."""
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    @field_validator("latitude")
    @classmethod
    def latitude_must_be_valid(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < -90 or value > 90:
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def longitude_must_be_valid(cls, value: Optional[float]) -> Optional[float]:
        if value is None:
            return value
        if value < -180 or value > 180:
            raise ValueError("longitude must be between -180 and 180")
        return value

    @model_validator(mode="after")
    def require_a_complete_location(self):
        self.address = self.address.strip() if self.address else None
        has_coordinates = self.latitude is not None or self.longitude is not None
        if has_coordinates and (self.latitude is None or self.longitude is None):
            raise ValueError("Both latitude and longitude must be provided together.")
        if not self.address and not has_coordinates:
            raise ValueError("Either address or coordinates must be provided.")
        return self


class LocationSelectionResponse(BaseModel):
    formatted_address: str
    latitude: float
    longitude: float
    valid: bool = True
    message: Optional[str] = None


class LocationPlaceOut(BaseModel):
    """Single searchable place result"""
    name: str
    address: str
    latitude: float
    longitude: float



# Worker / specialist schemas
class ServiceOut(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class WorkerServiceCreate(BaseModel):
    service_id: str
    price_override: Optional[float] = None
    experience_years: Optional[int] = None


class WorkerCreate(BaseModel):
    userId: str
    service_id: str


class SpecialistProfileOut(BaseModel):
    """GET /workers/by-user/{user_id}"""

    id: str
    userId: str
    services: list[WorkerServiceOut] = Field(default_factory=list)
    hasPendingSkill: bool = False
    isVerified: bool
    verificationStatus: str
    isAvailable: bool
    rejectionReason: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class WorkerLocationUpdateRequest(BaseModel):
    """PATCH /workers/{worker_id}/location — home base coordinates."""

    latitude: float
    longitude: float


class WorkerOut(SpecialistProfileOut):
    """GET /workers and GET /workers/{id}"""


class UpdateAvailabilityRequest(BaseModel):
    """PATCH /workers/{worker_id}/availability"""

    is_available: bool


# Admin schemas
class SpecialistReviewOut(BaseModel):
    """GET /admin/specialists and GET /admin/specialists/{id}"""

    id: str
    userId: str
    name: Optional[str] = None
    email: str
    phone: Optional[str] = None
    address: Optional[str] = None
    services: list[WorkerServiceOut] = Field(default_factory=list)
    submittedAt: str
    reviewedAt: Optional[str] = None
    reviewedBy: Optional[str] = None
    verificationStatus: str
    rejectionReason: Optional[str] = None
    avatar: Optional[str] = None


class PendingSkillSubmissionOut(BaseModel):
    """GET /admin/pending-skills - Individual skill submissions pending approval"""

    workerId: str
    workerName: Optional[str] = None
    workerEmail: str
    workerAvatar: Optional[str] = None
    serviceId: str
    serviceName: str
    requestedAt: str
    status: str = "pending"


class RejectPayload(BaseModel):
    """PATCH /admin/specialists/{id}/reject"""

    reason: str


class AdminStatsOut(BaseModel):
    """GET /admin/stats"""

    totalPending: int
    totalApproved: int
    totalRejected: int
    totalUsers: int


class AdminUserOut(BaseModel):
    """GET /admin/users"""

    id: str
    email: str
    name: Optional[str] = None
    role: str
    createdAt: str
    hasSpecialistProfile: bool


# Booking schemas
class SpecialistInfoOut(BaseModel):
    """Specialist info embedded in booking detail"""

    name: str
    avatar: Optional[str] = None
    services: list[WorkerServiceOut] = Field(default_factory=list)
    rating: float
    reviewCount: int
    phone: Optional[str] = None


class CostBreakdownOut(BaseModel):
    visitCharge: float
    repairWork: Optional[float] = None
    tip: Optional[float] = None
    total: float
    paymentMethod: Optional[str] = None


class BookingListOut(BaseModel):
    """Used in the bookings list page"""

    id: str
    bookingNumber: str
    clientName: str
    address: str
    serviceType: str
    scheduledDate: str
    scheduledTime: str
    amount: float
    status: str
    customerLocationPermission: Optional[str] = None
    customerLatitude: Optional[float] = None
    customerLongitude: Optional[float] = None
    customerLocationUpdatedAt: Optional[datetime] = None
    specialistLocationPermission: Optional[str] = None
    currentLatitude: Optional[float] = None
    currentLongitude: Optional[float] = None
    lastLocationUpdatedAt: Optional[datetime] = None
    createdAt: Optional[datetime] = None
    updatedAt: Optional[datetime] = None
    # Structured service-location fields
    receiverName: Optional[str] = None
    contactNumber: Optional[str] = None
    houseFlat: Optional[str] = None
    blockArea: Optional[str] = None
    landmark: Optional[str] = None
    addressLabel: Optional[str] = "Home"
    customAddressLabel: Optional[str] = None


class BookingDetailOut(BookingListOut):
    """Full detail used in modal"""

    specialist: Optional["SpecialistInfoOut"] = None
    etaMinutes: Optional[int] = None
    notes: Optional[str] = None
    costBreakdown: Optional[CostBreakdownOut] = None
    customerFeedback: Optional[str] = None
    customerRating: Optional[int] = None
    cancellationReason: Optional[str] = None
    cancelledBy: Optional[str] = None
    clientPhone: Optional[str] = None
    clientAddress: Optional[str] = None
    visitCharge: Optional[float] = 100.0
    isPaid: bool = False
    paymentStatus: Optional[str] = None  # "created"|"attempted"|"captured"|"failed"|"none"
    workerId: Optional[str] = None
    otp: Optional[str] = None
    otpExpiresAt: Optional[datetime] = None


# User query and intent schemas
class UserQueryCreateRequest(BaseModel):
    input_message: str


class AssistantChatRequest(BaseModel):
    """POST /assistant/chat — chat message to the LLM assistant."""
    message: str
    session_id: Optional[str] = None
    context: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class UserQueryIntentUpdateRequest(BaseModel):
    intent_message: str


class IntentUserQueryCreateRequest(BaseModel):
    input_message: str
    intent: Optional[str] = None


class UserQueryOut(BaseModel):
    id: str
    input_message: str
    intent: Optional[str] = None
    user_id: str

    class Config:
        from_attributes = True


class UserQueryResponse(BaseModel):
    message: str
    data: UserQueryOut


class UserQueryListResponse(BaseModel):
    message: str
    data: list[UserQueryOut]


class MatchedWorkerOut(BaseModel):
    id: str
    userId: str
    name: Optional[str] = None
    email: str
    avatar: Optional[str] = None
    services: list[WorkerServiceOut] = Field(default_factory=list)
    isAvailable: bool
    isVerified: bool
    verificationStatus: str
    rejectionReason: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    location: Optional[str] = None
    language: Optional[str] = None
    submittedAt: Optional[str] = None
    reviewedAt: Optional[str] = None
    distanceKm: Optional[float] = None


class UserQueryProcessResponse(BaseModel):
    status: str
    message: str
    intent: Optional[str] = None
    data: UserQueryOut
    workers: list[MatchedWorkerOut]


class IntentWorkerMatchResponse(BaseModel):
    status: str
    message: str
    intent: Optional[str] = None
    data: list[MatchedWorkerOut]


class MarketplaceSearchRequest(BaseModel):
    query: str
    location: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class MarketplaceSpecialistOut(BaseModel):
    workerId: str
    name: str
    services: list[WorkerServiceOut] = Field(default_factory=list)
    avatar: Optional[str] = None
    distanceKm: Optional[float] = None
    etaMinutes: Optional[int] = None
    visitCharge: Optional[float] = None
    rating: Optional[float] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    isAvailable: bool
    isVerified: bool


# ── Task 02: Booking creation ─────────────────────────────────────────────────

class BookingCreate(BaseModel):
    worker_id: Optional[str] = None          # nullable — unassigned broadcast
    service_type: Optional[str] = None
    address: Optional[str] = None
    receiver_name: Optional[str] = None
    contact_number: Optional[str] = None
    house_flat: Optional[str] = None
    block_area: Optional[str] = None
    landmark: Optional[str] = None
    address_label: Optional[str] = None      # Home|Work|Other
    custom_address_label: Optional[str] = None
    scheduled_date: Optional[str] = None     # "YYYY-MM-DD"
    scheduled_time: Optional[str] = None     # "10:30 AM"
    notes: Optional[str] = None
    visit_charge: Optional[float] = 100.0    # default 100 Rs
    current_latitude: Optional[float] = None
    current_longitude: Optional[float] = None
    customer_latitude: Optional[float] = None
    customer_longitude: Optional[float] = None
    last_location_updated_at: Optional[datetime] = None

    @field_validator("service_type", "address", "receiver_name", "contact_number", "house_flat", "block_area", "scheduled_date", "scheduled_time")
    @classmethod
    def required_string_fields_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value

    @field_validator("contact_number")
    @classmethod
    def validate_contact_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        value = value.strip()
        if not value:
            raise ValueError("Required")
        if not re.fullmatch(r"\+?[0-9]{7,15}", value):
            raise ValueError("Required")
        return value

    @field_validator("address_label")
    @classmethod
    def validate_address_label(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        label = value.strip()
        if not label:
            raise ValueError("Required")
        if label not in {"Home", "Work", "Other"}:
            raise ValueError("Required")
        return label

    @model_validator(mode="after")
    def validate_custom_address_label(self):
        self.landmark = self.landmark.strip() if self.landmark else None
        self.custom_address_label = self.custom_address_label.strip() if self.custom_address_label else None
        if self.address_label == "Other" and not self.custom_address_label:
            raise ValueError("Required")
        return self


class BookingAddressConfirm(BaseModel):
    address: Optional[str] = None
    receiver_name: Optional[str] = None
    contact_number: Optional[str] = None
    house_flat: Optional[str] = None
    block_area: Optional[str] = None
    landmark: Optional[str] = None
    address_label: Optional[str] = None
    custom_address_label: Optional[str] = None
    customer_latitude: Optional[float] = None
    customer_longitude: Optional[float] = None

    @field_validator("address", "receiver_name", "contact_number", "house_flat", "block_area")
    @classmethod
    def required_address_fields_must_not_be_blank(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        value = value.strip()
        if not value:
            raise ValueError("Required")
        return value

    @field_validator("contact_number")
    @classmethod
    def validate_contact_number(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        value = value.strip()
        if not value:
            raise ValueError("Required")
        if not re.fullmatch(r"\+?[0-9]{7,15}", value):
            raise ValueError("Required")
        return value

    @field_validator("address_label")
    @classmethod
    def validate_address_label(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            raise ValueError("Required")
        label = value.strip()
        if not label:
            raise ValueError("Required")
        if label not in {"Home", "Work", "Other"}:
            raise ValueError("Required")
        return label

    @model_validator(mode="after")
    def validate_custom_address_label(self):
        self.landmark = self.landmark.strip() if self.landmark else None
        self.custom_address_label = self.custom_address_label.strip() if self.custom_address_label else None
        if self.address_label == "Other" and not self.custom_address_label:
            raise ValueError("Required")
        return self


# ── Task 01: Status update ────────────────────────────────────────────────────

class BookingStatusUpdate(BaseModel):
    status: str   # accepted|rejected|started|reached|ongoing|completed|cancelled
    reason: Optional[str] = None
    otp: Optional[str] = None


# ── Task 05: Review submission ────────────────────────────────────────────────

class BookingReviewSubmit(BaseModel):
    rating: int         # 1–5
    feedback: str


# ── Task 04: Earnings output ──────────────────────────────────────────────────

class EarningsOut(BaseModel):
    today: float
    week: float
    total: float
    todayCount: int = 0
    weekCount: int = 0
    totalCount: int = 0


# ── Task 11: Review list item ─────────────────────────────────────────────────

class BookingReviewOut(BaseModel):
    bookingId: str
    bookingNumber: str
    clientName: str
    rating: int
    feedback: Optional[str] = None
    serviceType: str
    date: str
  
class BookingLocationUpdate(BaseModel):
    """POST /bookings/{id}/location"""
    latitude: float
    longitude: float

    @field_validator("latitude")
    @classmethod
    def latitude_must_be_valid(cls, value: float) -> float:
        if value < -90 or value > 90:
            raise ValueError("latitude must be between -90 and 90")
        return value

    @field_validator("longitude")
    @classmethod
    def longitude_must_be_valid(cls, value: float) -> float:
        if value < -180 or value > 180:
            raise ValueError("longitude must be between -180 and 180")
        return value


# ── AI Chat Schemas ──────────────────────────────────────────────────────────

class AiChatSessionCreate(BaseModel):
    """POST /ai-chat/sessions"""
    title: Optional[str] = None


class AiChatSessionOut(BaseModel):
    id: str
    title: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime

    class Config:
        from_attributes = True


class AiChatMessageCreate(BaseModel):
    """POST /ai-chat/sessions/{session_id}/messages"""
    role: str  # "user" | "assistant"
    content: str


class AiChatMessageOut(BaseModel):
    id: str
    sessionId: str
    role: str
    content: str
    createdAt: datetime

    class Config:
        from_attributes = True


class AiChatSessionWithMessagesOut(BaseModel):
    id: str
    title: Optional[str] = None
    createdAt: datetime
    updatedAt: datetime
    messages: list[AiChatMessageOut] = Field(default_factory=list)

    class Config:
        from_attributes = True  


# ── Payment schemas ─────────────────────────────────────────────────────────

class PaymentOrderIn(BaseModel):
    """Sent by frontend to create a Razorpay order."""

    booking_id: str


class PaymentOrderOut(BaseModel):
    """Returned to frontend after creating a Razorpay order."""

    orderId: str
    amount: int          # in paise
    currency: str
    keyId: str           # frontend needs the public key
    bookingId: str


class PaymentVerifyIn(BaseModel):
    """Sent by frontend after Razorpay checkout completes."""

    bookingId: str
    orderId: str
    paymentId: str
    razorpaySignature: str


class PaymentOut(BaseModel):
    id: str
    bookingId: str
    razorpayOrderId: str
    razorpayPaymentId: Optional[str] = None
    amount: float
    currency: str
    status: str
    createdAt: datetime

    class Config:
        from_attributes = True
