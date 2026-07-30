from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship



Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)
    role = Column(String, default="user")
    avatar = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    language = Column(String, default="english")
    location = Column(String, nullable=True)
    auth_provider = Column(String, nullable=True)
    provider_id = Column(String, nullable=True)
    location_permission_granted = Column(String, nullable=True)  # "allow", "deny", "while_using_site", or None
    location_permission_granted_at = Column(DateTime, nullable=True)
    token_version = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    specialist_profile = relationship("Worker", back_populates="user", cascade="all, delete-orphan")
    bookings = relationship("Booking", back_populates="client", cascade="all, delete-orphan")
    user_queries = relationship("UserQuery", back_populates="user", cascade="all, delete-orphan")
    location_permissions = relationship("LocationPermission", back_populates="user", cascade="all, delete-orphan")
    addresses = relationship("UserAddress", back_populates="user", cascade="all, delete-orphan")
    ai_chat_sessions = relationship("AiChatSession", back_populates="user", cascade="all, delete-orphan")


class Worker(Base):
    __tablename__ = "workers"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"))
    email = Column(String, nullable=False)
    verification_status = Column(String, default="pending")
    is_available = Column(Boolean, default=False)
    is_verified = Column(Boolean, default=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)
    

    user = relationship("User", back_populates="specialist_profile")
    bookings = relationship("Booking", back_populates="specialist", cascade="all, delete-orphan")
    services = relationship("WorkerService", back_populates="worker", cascade="all, delete-orphan")


class Service(Base):
    __tablename__ = "services"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    worker_services = relationship("WorkerService", back_populates="service")


class WorkerService(Base):
    __tablename__ = "worker_services"

    worker_id = Column(String, ForeignKey("workers.id", ondelete="CASCADE"), primary_key=True)
    service_id = Column(String, ForeignKey("services.id", ondelete="CASCADE"), primary_key=True)
    price_override = Column(Float, nullable=True)
    experience_years = Column(Integer, nullable=True)
    status = Column(String, default="pending", nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow)
    reviewed_at = Column(DateTime, nullable=True)
    reviewed_by = Column(String, nullable=True)

    worker = relationship("Worker", back_populates="services")
    service = relationship("Service", back_populates="worker_services")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
      Index("ix_bookings_current_location", "current_latitude", "current_longitude"),
      Index("ix_bookings_customer_location", "customer_latitude", "customer_longitude"),
      Index("ix_bookings_last_location_updated_at", "last_location_updated_at"),
    )

    id = Column(String, primary_key=True, index=True)
    booking_number = Column(String, unique=True, index=True)

    client_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    worker_id = Column(String, ForeignKey("workers.id", ondelete="CASCADE"), nullable=True)

    service_type = Column(String, nullable=False)
    address = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    receiver_name = Column(String, nullable=False)
    contact_number = Column(String, nullable=False)
    house_flat = Column(String, nullable=False)
    block_area = Column(String, nullable=False)
    landmark = Column(String, nullable=True)
    address_label = Column(String, nullable=False, default="Home")
    custom_address_label = Column(String, nullable=True)

    scheduled_date = Column(String, nullable=False)
    scheduled_time = Column(String, nullable=False)

    status = Column(String, default="upcoming")

    visit_charge = Column(Float, default=100)
    repair_amount = Column(Float, nullable=True)
    tip = Column(Float, nullable=True)
    total_amount = Column(Float, default=100)
    payment_method = Column(String, nullable=True)
    is_paid = Column(Boolean, default=False, nullable=False)

    eta_minutes = Column(Integer, nullable=True)
    customer_latitude = Column(Float, nullable=True)
    customer_longitude = Column(Float, nullable=True)
    customer_location_updated_at = Column(DateTime, nullable=True)
    current_latitude = Column(Float, nullable=True)
    current_longitude = Column(Float, nullable=True)
    last_location_updated_at = Column(DateTime, nullable=True)
    last_eta_latitude = Column(Float, nullable=True)
    last_eta_longitude = Column(Float, nullable=True)
    last_eta_calculated_at = Column(DateTime, nullable=True)

    customer_feedback = Column(Text, nullable=True)
    customer_rating = Column(Integer, nullable=True)

    cancellation_reason = Column(Text, nullable=True)
    cancelled_by = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    client = relationship("User", back_populates="bookings")
    specialist = relationship("Worker", back_populates="bookings")
    
class UserQuery(Base):
    __tablename__ = "userQuery"

    id = Column(String, primary_key=True, index=True)
    input_message = Column(Text, nullable=False)
    intent = Column(String, nullable=True)
    status = Column(String, default="processing")
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="user_queries")


class LocationPermission(Base):
    """
    Stores location permission history and session-based permissions.
    
    Permission types:
    - "allow": Persistent permission (Allow all the time)
    - "while_using_site": Session-based permission (valid until expires_at)
    - "deny": Explicit denial (user can still manually select location)
    """
    __tablename__ = "location_permissions"
    __table_args__ = (
        Index("ix_location_permissions_expires_at", "expires_at"),
    )

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_type = Column(String, nullable=False)  # "allow", "while_using_site", "deny"
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)  # Only set for "while_using_site"
    revoked_at = Column(DateTime, nullable=True)  # When permission was revoked

    user = relationship("User", back_populates="location_permissions")


class UserAddress(Base):
    __tablename__ = "user_addresses"
    __table_args__ = (
        Index("ix_user_addresses_user_id", "user_id"),
    )

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    address = Column(String, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    receiver_name = Column(String, nullable=False)
    contact_number = Column(String, nullable=False)
    house_flat = Column(String, nullable=False)
    block_area = Column(String, nullable=False)
    landmark = Column(String, nullable=True)
    address_label = Column(String, nullable=False, default="Home")
    custom_address_label = Column(String, nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="addresses")


class Message(Base):
    """Person-to-person chat messages between a specialist (worker) and a client,
    scoped to a booking. Replaces the previously mocked specialist communication hub."""

    __tablename__ = "messages"
    __table_args__ = (
        Index("ix_messages_booking_id", "booking_id"),
        Index("ix_messages_created_at", "created_at"),
    )

    id = Column(String, primary_key=True, index=True)
    booking_id = Column(String, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)

    # Sender / recipient are identified by role + id so either side can read/write.
    sender_type = Column(String, nullable=False)   # "worker" | "client"
    sender_id = Column(String, nullable=False)
    recipient_type = Column(String, nullable=False)  # "worker" | "client"
    recipient_id = Column(String, nullable=False)

    text = Column(Text, nullable=False)
    read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class AiChatSession(Base):
    """AI Assistant chat sessions for a user."""

    __tablename__ = "ai_chat_sessions"
    __table_args__ = (
        Index("ix_ai_chat_sessions_user_id", "user_id"),
        Index("ix_ai_chat_sessions_updated_at", "updated_at"),
    )

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=True)  # Optional: first user message as title
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", back_populates="ai_chat_sessions")
    messages = relationship("AiChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="AiChatMessage.created_at")


class AiChatMessage(Base):
    """Individual messages within an AI chat session."""

    __tablename__ = "ai_chat_messages"
    __table_args__ = (
        Index("ix_ai_chat_messages_session_id", "session_id"),
        Index("ix_ai_chat_messages_created_at", "created_at"),
    )

    id = Column(String, primary_key=True, index=True)
    session_id = Column(String, ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String, nullable=False)  # "user" | "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("AiChatSession", back_populates="messages")


class Payment(Base):
    """Tracks Razorpay payment for a booking."""

    __tablename__ = "payments"
    __table_args__ = (
        Index("ix_payments_booking_id", "booking_id"),
        Index("ix_payments_razorpay_order_id", "razorpay_order_id"),
    )

    id = Column(String, primary_key=True, index=True)
    booking_id = Column(String, ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False)
    razorpay_order_id = Column(String, nullable=False, unique=True)
    razorpay_payment_id = Column(String, nullable=True, unique=True)
    razorpay_signature = Column(String, nullable=True)
    amount = Column(Integer, nullable=False)          # in paise (Razorpay requires integer)
    currency = Column(String, default="INR", nullable=False)
    status = Column(String, default="created", nullable=False)  # created|attempted|captured|failed
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    booking = relationship("Booking", backref="payments")
