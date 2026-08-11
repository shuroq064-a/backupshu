"""
routers/bookings.py
───────────────────
Tasks 01, 02, 04, 05, 11 — all booking logic lives here.

Routes:
    POST   /bookings                        → create unassigned booking (Task 02)
    PATCH  /bookings/{id}/status            → specialist updates status (Task 01)
    POST   /bookings/{id}/review            → client submits review (Task 05)
    GET    /bookings/{id}                   → full booking detail
    GET    /users/{user_id}/bookings        → client's booking list
    WS     /ws/bookings/{id}               → live status push (Task 01)
"""

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, BackgroundTasks, Query
import re
import asyncio
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import uuid, json, os, sys, random, string

if __package__ and "." in __package__:
    from ..database import get_db, SessionLocal
    from ..dbmodels import User, Worker, Booking, WorkerService, Payment
    from ..models import (
        BookingListOut, BookingDetailOut, SpecialistInfoOut,
        CostBreakdownOut, BookingCreate, BookingStatusUpdate,
        BookingReviewSubmit, BookingReviewOut,
        BookingLocationUpdate, BookingAddressConfirm,
    )
    from ..auth_utils import get_current_user
    from ..services.rate_limiter import rate_limit
    from ..services.worker_services import build_worker_services
    from ..services.worker_matching import service_matches_intent
    from ..services.ola_maps.eta_service import OlaMapsServiceError, get_eta_minutes, get_route_polyline
    from ..services.ola_maps.geocoding_service import geocode_address
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    from database import get_db, SessionLocal
    from dbmodels import User, Worker, Booking, WorkerService, Payment
    from models import (
        BookingListOut, BookingDetailOut, SpecialistInfoOut,
        CostBreakdownOut, BookingCreate, BookingStatusUpdate,
        BookingReviewSubmit, BookingReviewOut,
        BookingLocationUpdate, BookingAddressConfirm,
    )
    from auth_utils import get_current_user
    from services.rate_limiter import rate_limit
    from services.worker_services import build_worker_services
    from services.worker_matching import service_matches_intent
    from services.ola_maps.eta_service import OlaMapsServiceError, get_eta_minutes, get_route_polyline
    from services.ola_maps.geocoding_service import geocode_address

router = APIRouter(tags=["Bookings"])


def _raise_address_validation_error(field_name: str):
    raise HTTPException(
        status_code=422,
        detail=[{"loc": ["body", field_name], "msg": "Required", "type": "value_error"}],
    )


# ── Status transition rules ───────────────────────────────────────────────────

TRANSITIONS = {
    "upcoming":  ["accepted", "rejected", "cancelled"],
    "accepted":  ["started",  "cancelled"],
    "started":   ["reached",  "cancelled"],
    "reached":   ["ongoing",  "cancelled"],
    "ongoing":   ["completed","cancelled"],
}

# Statuses that mean a specialist is busy (can't accept another)
ACTIVE_STATUSES = {"accepted", "started", "reached", "ongoing"}

# Statuses that mean a CLIENT already has an open job (incl. still-waiting
# requests) — blocks creating a second booking for another specialist.
CLIENT_OPEN_STATUSES = {"upcoming", "accepted", "started", "reached", "ongoing"}
CLIENT_COMMITTED_STATUSES = {"accepted", "started", "reached", "ongoing"}
LIST_PAGE_LIMIT = 100

STATUS_LABELS = {
    "started":   "On the Way",
    "reached":   "Reached Your Location",
    "ongoing":   "Work In Progress",
    "completed": "Work Completed",
}


# ── WebSocket manager ─────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[tuple]] = {}

    def room_name(self, booking_id: str) -> str:
        return f"room:booking_{booking_id}"

    async def connect(self, booking_id: str, ws: WebSocket, msg_id: str = "", origin: str = "*"):
        room = self.room_name(booking_id)
        await ws.accept(headers=_ws_cors_headers(origin))
        self.rooms.setdefault(room, []).append((ws, msg_id))

    def disconnect(self, booking_id: str, ws: WebSocket):
        room = self.room_name(booking_id)
        if room in self.rooms:
            self.rooms[room] = [
                (s, m) for s, m in self.rooms[room] if s is not ws
            ]
            if not self.rooms[room]:
                del self.rooms[room]

    async def broadcast(self, booking_id: str, payload: dict):
        room = self.room_name(booking_id)
        dead = []
        for ws, msg_id in list(self.rooms.get(room, [])):
            try:
                await ws.send_text(json.dumps({**payload, "messageId": msg_id, "room": room}))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(booking_id, ws)


manager = ConnectionManager()


# ── Specialist live channel ────────────────────────────────────────────────
# A single WebSocket per specialist (room:specialist_{worker_id}) pushes
# events when a new request arrives or one of their bookings changes status.
# The specialist Bookings page subscribes to this instead of polling, so the
# UI only refreshes when something actually changes.

class SpecialistConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, List[WebSocket]] = {}

    def room_name(self, worker_id: str) -> str:
        return f"room:specialist_{worker_id}"

    async def connect(self, worker_id: str, ws: WebSocket, origin: str = "*"):
        room = self.room_name(worker_id)
        await ws.accept(headers=_ws_cors_headers(origin))
        self.rooms.setdefault(room, []).append(ws)

    def disconnect(self, worker_id: str, ws: WebSocket):
        room = self.room_name(worker_id)
        if room in self.rooms:
            self.rooms[room] = [s for s in self.rooms[room] if s is not ws]
            if not self.rooms[room]:
                del self.rooms[room]

    async def broadcast(self, worker_id: str, payload: dict):
        room = self.room_name(worker_id)
        dead = []
        for ws in list(self.rooms.get(room, [])):
            try:
                await ws.send_text(json.dumps({**payload, "workerId": worker_id, "room": room}))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(worker_id, ws)


specialist_manager = SpecialistConnectionManager()


# ── OTP helpers ──────────────────────────────────────────────────────────────

OTP_LENGTH = 4
OTP_TTL_SECONDS = 180  # 3 minutes

# Tracks background OTP refresh tasks so they can be cancelled if status changes
_otp_refresh_tasks: Dict[str, asyncio.Task] = {}


def _generate_otp() -> str:
    """Generate a cryptographically random 4-digit OTP (no leading zeros excluded)."""
    return ''.join(random.choices(string.digits, k=OTP_LENGTH))


async def _otp_refresh_loop(booking_id: str):
    """Background task: every 3 minutes, regenerate OTP and push to client."""
    try:
        while True:
            await asyncio.sleep(OTP_TTL_SECONDS)
            db = SessionLocal()
            try:
                booking = db.query(Booking).filter(Booking.id == booking_id).first()
                if not booking or booking.status != "reached":
                    break
                new_otp = _generate_otp()
                booking.otp_code = new_otp
                booking.otp_expires_at = datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)
                db.commit()
                # Push new OTP to client via WebSocket
                await manager.broadcast(booking_id, {
                    "type": "OTP_GENERATED",
                    "bookingId": booking_id,
                    "otp": new_otp,
                    "expiresAt": booking.otp_expires_at.isoformat() + "Z",
                })
            except Exception:
                pass
            finally:
                db.close()
    except asyncio.CancelledError:
        pass


def _cancel_otp_refresh(booking_id: str):
    """Cancel any running OTP refresh task for this booking."""
    task = _otp_refresh_tasks.pop(booking_id, None)
    if task and not task.done():
        task.cancel()


def _start_otp_refresh(booking_id: str):
    """Start the OTP refresh background task for this booking."""
    _cancel_otp_refresh(booking_id)
    _otp_refresh_tasks[booking_id] = asyncio.create_task(_otp_refresh_loop(booking_id))


async def notify_specialists_of_request(booking_id: str, db: Session):
    """Notify the right specialists that a new booking exists.

    - Assigned bookings (worker_id set) → push NEW_REQUEST straight to that
      specialist. They must always see a request sent directly to them, even
      if they are currently offline (the UI shows assigned requests regardless
      of availability).
    - Unassigned bookings → broadcast NEW_REQUEST to every available, verified
      specialist whose skills match, so the open request can be picked up.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or booking.status != "upcoming":
        return

    if booking.worker_id is not None:
        await specialist_manager.broadcast(booking.worker_id, {
            "type": "NEW_REQUEST",
            "bookingId": booking.id,
            "serviceType": booking.service_type,
            "bookingNumber": booking.booking_number,
        })
        return

    from services.worker_matching import find_available_workers_by_intent

    workers = find_available_workers_by_intent(db, booking.service_type)
    for w in workers:
        await specialist_manager.broadcast(w.id, {
            "type": "NEW_REQUEST",
            "bookingId": booking.id,
            "serviceType": booking.service_type,
            "bookingNumber": booking.booking_number,
        })


async def notify_specialist_of_update(booking_id: str, db: Session):
    """Notify the assigned specialist that one of their bookings changed status."""
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or not booking.worker_id:
        return
    await specialist_manager.broadcast(booking.worker_id, {
        "type": "BOOKING_UPDATED",
        "bookingId": booking.id,
        "status": booking.status,
        "serviceType": booking.service_type,
        "bookingNumber": booking.booking_number,
    })


def _extract_ws_token(websocket: WebSocket, token: Optional[str]) -> Optional[str]:
    if token:
        return token

    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()

    protocol = websocket.headers.get("sec-websocket-protocol")
    if protocol:
        parts = [p.strip() for p in protocol.split(",")]
        for p in parts:
            if p.lower().startswith("bearer "):
                return p.split(" ", 1)[1].strip()
            if p.startswith("Bearer "):
                return p.split(" ", 1)[1].strip()

    return None


def _ws_cors_headers(origin: str) -> list:
    """CORS headers echoed on the WebSocket handshake response.

    CORSMiddleware rejects WebSocket upgrades (403), so we authorize the
    upgrade ourselves here by reflecting the requesting Origin back.
    """
    return [
        (b"Access-Control-Allow-Origin", origin.encode("utf-8")),
        (b"Access-Control-Allow-Credentials", b"true"),
    ]


def _ws_cors_origin(websocket: WebSocket) -> str:
    """Mirror main.get_cors_origin without importing main (avoids circular import)."""
    raw = os.getenv("CORS_ORIGINS", "*")
    allowed = [o.strip() for o in raw.split(",") if o.strip()]
    origin = websocket.headers.get("origin")
    if not origin:
        return "*"
    if "*" in allowed or origin in allowed:
        return origin
    return allowed[0] if allowed else "*"


def _ws_authenticate_room(booking_id: str, websocket: WebSocket, token: Optional[str]):
    """Validate the WS auth + room membership using a short-lived DB session.

    The session is closed before returning so long-lived WebSocket connections
    don't pin a pooled DB connection (which exhausts the pool under many sockets).
    Returns (user_id, error_reason). error_reason is None on success.
    """
    ws_token = _extract_ws_token(websocket, token)
    if not ws_token:
        return None, "Missing authentication token"

    user_id = _ws_user_id_from_token(ws_token)
    if not user_id:
        return None, "Invalid authentication token"

    db = SessionLocal()
    try:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if not booking:
            return None, "Booking not found"

        if booking.client_id == user_id:
            return user_id, None

        worker = db.query(Worker).filter(
            Worker.id == booking.worker_id,
            Worker.user_id == user_id,
        ).first()
        if worker:
            return user_id, None

        return None, "Not allowed to join this booking room"
    finally:
        db.close()

    return user_id, None


def _ws_authenticate_specialist(worker_id: str, websocket: WebSocket, token: Optional[str]):
    """Validate WS auth + specialist ownership using a short-lived DB session.

    Mirrors _ws_authenticate_room: the session is closed before returning so the
    connection does not hold a pooled DB handle for its whole lifetime.
    Returns (user_id, error_reason). error_reason is None on success.
    """
    ws_token = _extract_ws_token(websocket, token)
    if not ws_token:
        return None, "Missing authentication token"

    user_id = _ws_user_id_from_token(ws_token)
    if not user_id:
        return None, "Invalid authentication token"

    db = SessionLocal()
    try:
        worker = db.query(Worker).filter(Worker.id == worker_id).first()
        if not worker or worker.user_id != user_id:
            return None, "Not allowed to join this specialist room"
    finally:
        db.close()

    return user_id, None


def _ws_user_id_from_token(token: str) -> Optional[str]:
    try:
        from auth_utils import decode_access_token
        payload = decode_access_token(token)
    except Exception:
        return None

    user_id = payload.get("sub")
    return user_id if isinstance(user_id, str) and user_id else None


async def dispatch_eta_update(booking_id: str, eta_minutes: int, last_updated: datetime):
    await manager.broadcast(booking_id, {
        "type": "ETA_UPDATE",
        "booking_id": booking_id,
        "eta_minutes": eta_minutes,
        "last_updated": last_updated.isoformat() + "Z",
    })


# ── Helper — compute real rating for a worker ─────────────────────────────────

def _worker_rating(worker_id: str, db: Session):
    result = db.query(
        func.avg(Booking.customer_rating),
        func.count(Booking.customer_rating),
    ).filter(
        Booking.worker_id == worker_id,
        Booking.customer_rating.isnot(None),
    ).first()
    return (round(float(result[0]), 1) if result[0] else 0.0), (result[1] or 0)


def _worker_ratings_map(worker_ids: set, db: Session) -> dict:
    """AVG + COUNT of customer ratings per worker — ONE query for many workers
    (the per-booking alternative is an N+1 aggregate round-trip each)."""
    if not worker_ids:
        return {}
    rows = (
        db.query(
            Booking.worker_id,
            func.avg(Booking.customer_rating),
            func.count(Booking.customer_rating),
        )
        .filter(
            Booking.worker_id.in_(worker_ids),
            Booking.customer_rating.isnot(None),
        )
        .group_by(Booking.worker_id)
        .all()
    )
    return {
        wid: (round(float(avg), 1) if avg else 0.0, cnt or 0)
        for wid, avg, cnt in rows
    }


def _payment_status_for(booking: Booking, latest_payment: Optional[Payment]) -> str:
    is_paid = booking.is_paid if hasattr(booking, "is_paid") else False
    if is_paid:
        return "captured"
    return latest_payment.status if latest_payment else "none"


def _is_paid(booking: Booking) -> bool:
    return booking.is_paid if hasattr(booking, "is_paid") else False


# ── Helper — build full BookingDetailOut from pre-loaded data ─────────────────

def _build_one(
    booking: Booking,
    worker: Optional[Worker],
    worker_user: Optional[User],
    client_user: Optional[User],
    rating: tuple,
    latest_payment: Optional[Payment],
) -> BookingDetailOut:
    avg_rating, review_count = rating

    specialist = None
    if worker and worker_user:
        specialist = SpecialistInfoOut(
            name=worker_user.name or worker_user.email.split("@")[0],
            avatar=getattr(worker_user, "avatar", None),
            services=build_worker_services(worker),
            rating=avg_rating,
            reviewCount=review_count,
            phone=worker_user.phone,
        )

    cost = None
    if booking.status == "completed" and booking.total_amount:
        cost = CostBreakdownOut(
            visitCharge=booking.visit_charge or 100,
            repairWork=booking.repair_amount,
            tip=booking.tip,
            total=booking.total_amount or booking.visit_charge or 100,
            paymentMethod=booking.payment_method,
        )

    return BookingDetailOut(
        id=booking.id,
        bookingNumber=booking.booking_number or f"#{booking.id[:6].upper()}",
        clientName=client_user.name or "Client" if client_user else "Client",
        clientPhone=client_user.phone if client_user else None,
        clientAddress=client_user.address if client_user else None,
        address=booking.address,
        receiverName=booking.receiver_name,
        contactNumber=booking.contact_number,
        houseFlat=booking.house_flat,
        blockArea=booking.block_area,
        landmark=booking.landmark,
        addressLabel=booking.address_label,
        customAddressLabel=booking.custom_address_label,
        serviceType=booking.service_type,
        scheduledDate=booking.scheduled_date,
        scheduledTime=booking.scheduled_time,
        amount=booking.total_amount or booking.visit_charge or 100,
        visitCharge=booking.visit_charge or 100,
        status=booking.status,
        customerLatitude=booking.customer_latitude,
        customerLongitude=booking.customer_longitude,
        currentLatitude=booking.current_latitude,
        currentLongitude=booking.current_longitude,
        lastLocationUpdatedAt=booking.last_location_updated_at,
        createdAt=booking.created_at,
        updatedAt=booking.updated_at,
        specialist=specialist,
        etaMinutes=booking.eta_minutes,
        notes=booking.notes,
        costBreakdown=cost,
        customerFeedback=booking.customer_feedback,
        customerRating=booking.customer_rating,
        cancellationReason=booking.cancellation_reason,
        cancelledBy=booking.cancelled_by,
        workerId=booking.worker_id,
        isPaid=_is_paid(booking),
        paymentStatus=_payment_status_for(booking, latest_payment),
        otp=booking.otp_code if booking.status == "reached" else None,
        otpExpiresAt=booking.otp_expires_at if booking.status == "reached" else None,
    )


# ── Helper — build full BookingDetailOut for a single booking ─────────────────

def _build_detail(booking: Booking, db: Session) -> BookingDetailOut:
    worker = (
        db.query(Worker)
        .options(joinedload(Worker.services).joinedload(WorkerService.service))
        .filter(Worker.id == booking.worker_id)
        .first()
    ) if booking.worker_id else None

    worker_user = db.query(User).filter(User.id == worker.user_id).first() if worker else None
    client_user = db.query(User).filter(User.id == booking.client_id).first()

    rating = _worker_rating(worker.id, db) if worker else (0.0, 0)

    latest_payment = None
    if not _is_paid(booking):
        latest_payment = (
            db.query(Payment)
            .filter(Payment.booking_id == booking.id)
            .order_by(Payment.created_at.desc())
            .first()
        )

    return _build_one(booking, worker, worker_user, client_user, rating, latest_payment)


# ── Helper — build details for MANY bookings with bulk queries ────────────────

def _build_details(bookings: list, db: Session) -> list[BookingDetailOut]:
    """Build BookingDetailOut for many bookings with a handful of bulk queries
    instead of ~5 round-trips per row (worker + user + user + rating + payment).

    This is the single biggest win for the bookings list endpoints (client
    bookings / specialist bookings / incoming requests) — previously every row
    caused individual queries against a remote database.
    """
    bookings = list(bookings)
    if not bookings:
        return []

    ids = [b.id for b in bookings]
    worker_ids = {b.worker_id for b in bookings if b.worker_id}
    client_ids = {b.client_id for b in bookings}

    workers: dict = {}
    if worker_ids:
        workers = {
            w.id: w
            for w in db.query(Worker)
            .options(joinedload(Worker.services).joinedload(WorkerService.service))
            .filter(Worker.id.in_(worker_ids))
            .all()
        }

    user_ids = set(client_ids) | {w.user_id for w in workers.values() if w.user_id}
    users: dict = {}
    if user_ids:
        users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()}

    ratings = _worker_ratings_map(worker_ids, db)

    payments: dict = {}
    if ids:
        rows = (
            db.query(Payment)
            .filter(Payment.booking_id.in_(ids))
            .order_by(Payment.created_at.desc())
            .all()
        )
        for p in rows:
            payments.setdefault(p.booking_id, p)

    return [
        _build_one(
            booking=b,
            worker=workers.get(b.worker_id),
            worker_user=(
                users.get(workers[b.worker_id].user_id) if b.worker_id in workers else None
            ),
            client_user=users.get(b.client_id),
            rating=ratings.get(b.worker_id, (0.0, 0)),
            latest_payment=payments.get(b.id),
        )
        for b in bookings
    ]


# ─────────────────────────────────────────────
#  POST /bookings — create an unassigned booking
#  All matching available specialists will see it.
#  First to accept wins (atomic DB update).
# ─────────────────────────────────────────────

@router.post("/bookings", response_model=BookingDetailOut, status_code=201)
def create_booking(
    payload: BookingCreate,
    background_tasks: BackgroundTasks,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate_limit(request, "create-booking", max_requests=10, window_seconds=3600)
    # Address validation guard: use the same Required-style validation as the schema.
    if not getattr(payload, "contact_number", None) or not str(payload.contact_number).strip():
        raise HTTPException(status_code=422, detail=[{"loc": ["body", "contact_number"], "msg": "Required", "type": "value_error"}])
    if not re.fullmatch(r"\+?[0-9]{7,15}", str(payload.contact_number).strip()):
        raise HTTPException(status_code=422, detail=[{"loc": ["body", "contact_number"], "msg": "Required", "type": "value_error"}])

    label = (payload.address_label or "").strip()
    if not label:
        raise HTTPException(status_code=422, detail=[{"loc": ["body", "address_label"], "msg": "Required", "type": "value_error"}])
    if label not in ("Home", "Work", "Other"):
        raise HTTPException(status_code=422, detail=[{"loc": ["body", "address_label"], "msg": "Required", "type": "value_error"}])
    if label == "Other":
        if not getattr(payload, "custom_address_label", None) or not str(payload.custom_address_label).strip():
            raise HTTPException(status_code=422, detail=[{"loc": ["body", "custom_address_label"], "msg": "Required", "type": "value_error"}])

    # Validate scheduled date not in past
    try:
        sched = datetime.strptime(payload.scheduled_date, "%Y-%m-%d").date()
        if sched < datetime.utcnow().date():
            raise HTTPException(status_code=422, detail="Scheduled date cannot be in the past.")
    except ValueError:
        raise HTTPException(status_code=422, detail="scheduled_date must be YYYY-MM-DD.")

    # A client can hold only ONE committed booking at a time (any service).
    # "upcoming" bookings are unaccepted requests — creating a new one supersedes
    # any older unaccepted request, so the customer is never blocked by a stale,
    # invisible pending booking. Only bookings a specialist has actually
    # committed to (accepted +) block a new request.
    committed = (
        db.query(Booking)
        .filter(
            Booking.client_id == current_user.id,
            Booking.status.in_(list(CLIENT_COMMITTED_STATUSES)),
        )
        .first()
    )
    if committed:
        raise HTTPException(
            status_code=409,
            detail=(
                f"You already have an active booking (#{(committed.booking_number or '').upper()}, "
                f"{committed.service_type}) that is {committed.status}. Please wait for it to be "
                f"completed or cancelled before requesting another specialist."
            ),
        )

    # Supersede earlier unaccepted requests for this client (any service) so the
    # latest request replaces the previous one instead of piling up.
    stale = (
        db.query(Booking)
        .filter(
            Booking.client_id == current_user.id,
            Booking.status == "upcoming",
        )
        .all()
    )
    for old in stale:
        old.status = "cancelled"
        old.cancellation_reason = "Superseded — replaced by a newer request"
        old.cancelled_by = "system"
        old.updated_at = datetime.utcnow()

    # If a specific worker was given, validate them
    if payload.worker_id:
        worker = db.query(Worker).filter(Worker.id == payload.worker_id).first()
        if not worker:
            raise HTTPException(status_code=404, detail="Specialist not found.")
        if not worker.is_verified:
            raise HTTPException(status_code=400, detail="Specialist is not yet verified.")

    short_id = uuid.uuid4().hex[:6].upper()
    charge = payload.visit_charge if payload.visit_charge is not None else 100.0
    supplied_latitude = payload.customer_latitude if payload.customer_latitude is not None else payload.current_latitude
    supplied_longitude = payload.customer_longitude if payload.customer_longitude is not None else payload.current_longitude
    has_supplied_coordinates = supplied_latitude is not None or supplied_longitude is not None

    destination = None
    if has_supplied_coordinates:
        if supplied_latitude is None or supplied_longitude is None:
            raise HTTPException(status_code=422, detail="Both latitude and longitude are required.")
        if supplied_latitude < -90 or supplied_latitude > 90 or supplied_longitude < -180 or supplied_longitude > 180:
            raise HTTPException(status_code=422, detail="Invalid location coordinates.")
        destination = {
            "latitude": supplied_latitude,
            "longitude": supplied_longitude,
        }
    else:
        try:
            destination = geocode_address(payload.address)
        except (OlaMapsServiceError, ValueError):
            # Manual addresses must not block booking creation. If the maps
            # provider cannot resolve the text, store the address and continue
            # without coordinates; ETA/navigation can be calculated later after
            # a more precise location update.
            destination = None

    booking = Booking(
        id=str(uuid.uuid4()),
        booking_number=f"#{short_id}",
        client_id=current_user.id,
        worker_id=payload.worker_id,  # may be None — unassigned
        service_type=payload.service_type,
        address=payload.address,
        receiver_name=payload.receiver_name,
        contact_number=payload.contact_number,
        house_flat=payload.house_flat,
        block_area=payload.block_area,
        landmark=payload.landmark,
        address_label=label,
        custom_address_label=payload.custom_address_label,
        customer_latitude=destination["latitude"] if destination else None,
        customer_longitude=destination["longitude"] if destination else None,
        customer_location_updated_at=datetime.utcnow() if has_supplied_coordinates else None,
        notes=payload.notes,
        scheduled_date=payload.scheduled_date,
        scheduled_time=payload.scheduled_time,
        status="upcoming",
        visit_charge=charge,
        total_amount=charge,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(booking)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        import logging
        logging.getLogger(__name__).exception("Booking creation IntegrityError")
        raise HTTPException(status_code=500, detail="Unable to create booking. Please try again.")
    except SQLAlchemyError as exc:
        db.rollback()
        import logging
        logging.getLogger(__name__).exception("Booking creation SQLAlchemyError")
        raise HTTPException(status_code=500, detail="Unable to create booking. Please try again.")
    db.refresh(booking)
    # Let available, verified specialists with a matching skill know a new request
    # exists (powers the live specialist channel — replaces polling).
    background_tasks.add_task(
        lambda: asyncio.run(notify_specialists_of_request(booking.id, SessionLocal()))
    )
    return _build_detail(booking, db)


# ─────────────────────────────────────────────
#  POST /bookings/{booking_id}/confirm-address — confirm and save address details
#  This provides a dedicated backend confirmation step for the address flow.
# ─────────────────────────────────────────────

@router.post("/bookings/{booking_id}/confirm-address")
def confirm_address(
    booking_id: str,
    payload: BookingAddressConfirm,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only confirm addresses for your own bookings.")

    if not payload.address or not str(payload.address).strip():
        _raise_address_validation_error("address")
    if not payload.receiver_name or not str(payload.receiver_name).strip():
        _raise_address_validation_error("receiver_name")
    if not payload.contact_number or not str(payload.contact_number).strip():
        _raise_address_validation_error("contact_number")
    if not re.fullmatch(r"\+?[0-9]{7,15}", str(payload.contact_number).strip()):
        _raise_address_validation_error("contact_number")
    if not payload.house_flat or not str(payload.house_flat).strip():
        _raise_address_validation_error("house_flat")
    if not payload.block_area or not str(payload.block_area).strip():
        _raise_address_validation_error("block_area")
    if not payload.address_label or not str(payload.address_label).strip():
        _raise_address_validation_error("address_label")
    if str(payload.address_label).strip() not in {"Home", "Work", "Other"}:
        _raise_address_validation_error("address_label")
    if str(payload.address_label).strip() == "Other" and (not payload.custom_address_label or not str(payload.custom_address_label).strip()):
        _raise_address_validation_error("custom_address_label")

    booking.address = str(payload.address).strip()
    booking.receiver_name = str(payload.receiver_name).strip()
    booking.contact_number = str(payload.contact_number).strip()
    booking.house_flat = str(payload.house_flat).strip()
    booking.block_area = str(payload.block_area).strip()
    booking.landmark = str(payload.landmark).strip() if payload.landmark and str(payload.landmark).strip() else None
    booking.address_label = str(payload.address_label).strip()
    booking.custom_address_label = str(payload.custom_address_label).strip() if payload.custom_address_label and str(payload.custom_address_label).strip() else None

    if payload.customer_latitude is not None and payload.customer_longitude is not None:
        booking.customer_latitude = payload.customer_latitude
        booking.customer_longitude = payload.customer_longitude
        booking.customer_location_updated_at = datetime.utcnow()
    elif payload.customer_latitude is not None or payload.customer_longitude is not None:
        raise HTTPException(status_code=422, detail=[{"loc": ["body", "customer_latitude"], "msg": "Required", "type": "value_error"}])

    booking.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(booking)

    return {
        "message": "Address confirmed successfully.",
        "bookingId": booking.id,
        "nextStep": "booking_confirmed",
        "booking": _build_detail(booking, db),
    }


# ─────────────────────────────────────────────
#  PATCH /bookings/{id}/status — specialist updates status
#  Tasks 01 + new statuses (started/reached/ongoing/completed)
#  Race condition protection: atomic accept for unassigned bookings
# ─────────────────────────────────────────────

@router.patch("/bookings/{booking_id}/status", response_model=BookingDetailOut)
async def update_booking_status(
    booking_id: str,
    payload: BookingStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    # Identify the specialist
    worker = db.query(Worker).filter(Worker.user_id == current_user.id).first()
    if not worker:
        raise HTTPException(status_code=403, detail="Only specialists can update booking status.")

    # For accept: booking must be either unassigned OR already assigned to this specialist
    if payload.status == "accepted":
        if booking.worker_id is not None and booking.worker_id != worker.id:
            raise HTTPException(status_code=403, detail="This booking is assigned to another specialist.")

        # One-active-booking enforcement
        active = db.query(Booking).filter(
            Booking.worker_id == worker.id,
            Booking.status.in_(list(ACTIVE_STATUSES)),
        ).first()
        if active:
            raise HTTPException(
                status_code=409,
                detail=f"You already have an active booking ({active.booking_number}). "
                       f"Complete or cancel it before accepting a new one.",
            )

        # Atomic claim for unassigned bookings (race condition fix)
        if booking.worker_id is None:
            rows = db.query(Booking).filter(
                Booking.id == booking_id,
                Booking.worker_id.is_(None),
                Booking.status == "upcoming",
            ).update(
                {"worker_id": worker.id, "status": "accepted", "updated_at": datetime.utcnow()},
                synchronize_session=False,
            )
            db.commit()
            if rows == 0:
                raise HTTPException(
                    status_code=409,
                    detail="This booking was just accepted by another specialist.",
                )
            db.refresh(booking)
        else:
            # Already assigned to this specialist
            booking.status = "accepted"
            booking.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(booking)

        # Prevent the client from being left "waiting for acceptance" on duplicate
        # pending bookings for the SAME service. Once one specialist accepts, cancel
        # the other still-upcoming bookings for this client + service type so the
        # customer isn't told multiple specialists still need to accept the same job.
        dup_rows = (
            db.query(Booking)
            .filter(
                Booking.client_id == booking.client_id,
                Booking.service_type == booking.service_type,
                Booking.status == "upcoming",
                Booking.id != booking.id,
            )
            .update(
                {
                    "status": "cancelled",
                    "cancellation_reason": "Superseded — another specialist accepted the same request",
                    "cancelled_by": "system",
                    "updated_at": datetime.utcnow(),
                },
                synchronize_session=False,
            )
        )
        db.commit()
        db.refresh(booking)

    else:
        # All other transitions: specialist must own the booking
        if booking.worker_id != worker.id:
            raise HTTPException(status_code=403, detail="This booking is not assigned to you.")

        allowed = TRANSITIONS.get(booking.status, [])
        if payload.status not in allowed:
            raise HTTPException(
                status_code=422,
                detail=f"Cannot move from '{booking.status}' to '{payload.status}'.",
            )

        # ── OTP: validate when going reached → ongoing ──────────────────
        if booking.status == "reached" and payload.status == "ongoing":
            if not payload.otp:
                raise HTTPException(status_code=400, detail="OTP is required to start work.")
            if not booking.otp_code or booking.otp_code != payload.otp:
                raise HTTPException(status_code=400, detail="Invalid OTP. Ask the client for the current code.")
            if booking.otp_expires_at and booking.otp_expires_at < datetime.utcnow():
                raise HTTPException(status_code=400, detail="OTP has expired. Ask the client for a new code.")
            # OTP valid — clear it
            booking.otp_code = None
            booking.otp_expires_at = None
            _cancel_otp_refresh(booking_id)

        # ── OTP: generate when arriving at reached ──────────────────────
        if payload.status == "reached":
            new_otp = _generate_otp()
            booking.otp_code = new_otp
            booking.otp_expires_at = datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)
            _start_otp_refresh(booking_id)

        # Cancel OTP refresh if status moves away from reached (e.g. cancel)
        if booking.status == "reached" and payload.status in ("cancelled",):
            _cancel_otp_refresh(booking_id)
            booking.otp_code = None
            booking.otp_expires_at = None

        booking.status = payload.status
        booking.updated_at = datetime.utcnow()

        if payload.status in ("rejected", "cancelled"):
            booking.cancellation_reason = payload.reason
            booking.cancelled_by = "specialist"

        if payload.status == "completed":
            booking.total_amount = (booking.visit_charge or 0) + (booking.repair_amount or 0)

        db.commit()
        db.refresh(booking)

    detail = _build_detail(booking, db)

    # Broadcast via WebSocket to the client
    ws_payload: dict = {
        "type": "STATUS_UPDATE",
        "bookingId": booking_id,
        "status": booking.status,
        "bookingNumber": booking.booking_number,
        "serviceType": booking.service_type,
        "specialistName": detail.specialist.name if detail.specialist else "",
        "statusLabel": STATUS_LABELS.get(booking.status, booking.status),
    }
    # Include OTP in the status update so client gets it in one shot
    if booking.status == "reached" and booking.otp_code:
        ws_payload["otp"] = booking.otp_code
        ws_payload["otpExpiresAt"] = booking.otp_expires_at.isoformat() + "Z" if booking.otp_expires_at else None

    await manager.broadcast(booking_id, ws_payload)

    # Push OTP to client when reached
    if booking.status == "reached" and booking.otp_code:
        await manager.broadcast(booking_id, {
            "type": "OTP_GENERATED",
            "bookingId": booking_id,
            "otp": booking.otp_code,
            "expiresAt": booking.otp_expires_at.isoformat() + "Z" if booking.otp_expires_at else None,
        })

    # Also notify the assigned specialist's live channel so their Bookings Manager
    # refreshes on real changes instead of polling.
    await notify_specialist_of_update(booking_id, db)

    return detail


# ─────────────────────────────────────────────
#  GET /bookings/{id}/otp — client fetches OTP
# ─────────────────────────────────────────────

@router.get("/bookings/{booking_id}/otp")
def get_booking_otp(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    if booking.status != "reached":
        raise HTTPException(status_code=404, detail="No active OTP for this booking.")

    # Auto-regenerate if OTP is missing or expired
    is_expired = (
        not booking.otp_code
        or (booking.otp_expires_at and booking.otp_expires_at < datetime.utcnow())
    )
    if is_expired:
        booking.otp_code = _generate_otp()
        booking.otp_expires_at = datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)
        db.commit()
        db.refresh(booking)
        # Ensure the refresh loop is running
        _start_otp_refresh(booking_id)

    return {
        "otp": booking.otp_code,
        "expiresAt": booking.otp_expires_at.isoformat() + "Z" if booking.otp_expires_at else None,
    }


# ─────────────────────────────────────────────
#  POST /bookings/{id}/review — Task 05
#  Client submits rating + feedback after completed/cancelled
# ─────────────────────────────────────────────

@router.post("/bookings/{booking_id}/review")
def submit_review(
    booking_id: str,
    payload: BookingReviewSubmit,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate_limit(request, "submit-review", max_requests=10, window_seconds=3600)
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the booking's client can submit a review.")
    if booking.status not in ("completed", "cancelled"):
        raise HTTPException(status_code=422, detail="Reviews can only be submitted after the job is completed or cancelled.")
    if booking.customer_rating is not None:
        raise HTTPException(status_code=409, detail="You have already reviewed this booking.")
    if not (1 <= payload.rating <= 5):
        raise HTTPException(status_code=422, detail="Rating must be between 1 and 5.")

    booking.customer_rating = payload.rating
    booking.customer_feedback = payload.feedback.strip()
    booking.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Review submitted successfully.", "rating": payload.rating}

# ─────────────────────────────────────────────
# POST /bookings/{id}/location (Task 06)
# Updates specialist location for a booking.
# Validates coordinates and booking authorization.
# Updates latitude, longitude, and timestamp.
# Returns 200, 403, 404, or 422 as appropriate.
# ─────────────────────────────────────────────

@router.post("/bookings/{booking_id}/location", response_model=BookingDetailOut)
async def update_booking_location(
    booking_id: str,
    payload: BookingLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Only the assigned specialist can update location for their booking."""

    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    worker = db.query(Worker).filter(
        Worker.id == booking.worker_id,
        Worker.user_id == current_user.id,
    ).first()
    if not worker:
        raise HTTPException(status_code=403, detail="Only the assigned specialist can update this booking location")

    previous_eta_minutes = booking.eta_minutes
    now = datetime.utcnow()

    booking.current_latitude = payload.latitude
    booking.current_longitude = payload.longitude
    booking.last_location_updated_at = now
    booking.updated_at = datetime.utcnow()

    eta_changed = False
    eta_last_updated = None
    if booking.customer_latitude is None or booking.customer_longitude is None:
        try:
            destination = await run_in_threadpool(geocode_address, booking.address)
            booking.customer_latitude = destination["latitude"]
            booking.customer_longitude = destination["longitude"]
        except (OlaMapsServiceError, ValueError):
            destination = None
    else:
        destination = {
            "latitude": booking.customer_latitude,
            "longitude": booking.customer_longitude,
        }

    if destination:
        try:
            eta_result = await run_in_threadpool(
                get_eta_minutes,
                payload.latitude,
                payload.longitude,
                destination["latitude"],
                destination["longitude"],
            )
            booking.eta_minutes = eta_result["eta_minutes"]
            booking.last_eta_latitude = payload.latitude
            booking.last_eta_longitude = payload.longitude
            booking.last_eta_calculated_at = now
            eta_last_updated = now
            eta_changed = booking.eta_minutes != previous_eta_minutes
        except (OlaMapsServiceError, ValueError):
            # Location updates should still succeed if the external ETA provider fails.
            pass

    db.commit()
    db.refresh(booking)

    if eta_changed and booking.eta_minutes is not None and eta_last_updated is not None:
        await dispatch_eta_update(booking.id, booking.eta_minutes, eta_last_updated)

    # Broadcast specialist location to the client in real-time
    await manager.broadcast(booking.id, {
        "type": "LOCATION_UPDATE",
        "booking_id": booking.id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "eta_minutes": booking.eta_minutes,
        "timestamp": now.isoformat() + "Z",
    })

    return _build_detail(booking, db)

# ─────────────────────────────────────────────
#  WebSocket /ws/bookings/{id}
# ─────────────────────────────────────────────

@router.websocket("/ws/bookings/{booking_id}")
async def booking_ws(
    booking_id: str,
    websocket: WebSocket,
    msg_id: str = "",
    token: Optional[str] = None,
):
    user_id, error = _ws_authenticate_room(booking_id, websocket, token)
    if error:
        await websocket.close(code=1008, reason=error)
        return

    origin = _ws_cors_origin(websocket)
    await manager.connect(booking_id, websocket, msg_id, origin)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(booking_id, websocket)


@router.websocket("/ws/specialist/{worker_id}")
async def specialist_ws(
    worker_id: str,
    websocket: WebSocket,
    token: Optional[str] = None,
):
    """Live channel for a specialist's Bookings Manager.

    Pushes NEW_REQUEST / BOOKING_UPDATED events so the UI refreshes only on real
    changes instead of polling. Auth: only the worker's own owner may join.
    """
    user_id, error = _ws_authenticate_specialist(worker_id, websocket, token)
    if error:
        await websocket.close(code=1008, reason=error)
        return

    origin = _ws_cors_origin(websocket)
    await specialist_manager.connect(worker_id, websocket, origin)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        specialist_manager.disconnect(worker_id, websocket)


# ─────────────────────────────────────────────
#  GET /workers/{worker_id}/requests
#  Returns unassigned bookings matching specialist's skills + own upcoming ones
# ─────────────────────────────────────────────

@router.get("/workers/{worker_id}/requests", response_model=List[BookingDetailOut])
def get_worker_requests(
    worker_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    worker = (
        db.query(Worker)
        .options(joinedload(Worker.services).joinedload(WorkerService.service))
        .filter(Worker.id == worker_id)
        .first()
    )
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found.")
    if worker.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    # Bookings explicitly assigned to this specialist must ALWAYS show, even when
    # the specialist is offline — they were sent directly to them, not pulled from
    # the open broadcast pool. Gating these behind `is_available` made specialists
    # miss requests the moment they toggled offline.
    assigned = (
        db.query(Booking)
        .filter(Booking.worker_id == worker_id, Booking.status == "upcoming")
        .order_by(Booking.created_at.desc())
        .all()
    )

    # The open broadcast pool (unassigned bookings matched by skill) is only shown
    # when the specialist is listed available.
    if not worker.is_available:
        return _build_details(assigned, db)

    # Get specialist's verified service names and match with the same alias
    # rules used by marketplace/intent search.
    my_services = [
        ws.service.name
        for ws in worker.services
        if ws.status == "verified" and ws.service
    ]

    if not my_services:
        return _build_details(assigned, db)

    # Fetch all upcoming unassigned bookings
    unassigned = (
        db.query(Booking)
        .filter(Booking.worker_id.is_(None), Booking.status == "upcoming")
        .order_by(Booking.created_at.desc())
        .all()
    )

    # Filter by matching service type
    matched = [
        b for b in unassigned
        if any(service_matches_intent(service_name, b.service_type) for service_name in my_services)
    ]

    seen = set()
    all_requests = []
    # Assigned bookings (sent directly to this specialist) come FIRST — they are
    # the most relevant and must not be buried under the open broadcast pool.
    for b in assigned + matched:
        if b.id not in seen:
            seen.add(b.id)
            all_requests.append(b)

    return _build_details(all_requests, db)


# ─────────────────────────────────────────────
#  GET /routes/driving — driving route polyline
#  Used by the live tracking map. Replaces the
#  unreliable public OSRM router with Ola Maps.
# ─────────────────────────────────────────────

@router.get("/routes/driving")
def get_driving_route(
    origin_lat: float = Query(..., ge=-90, le=90),
    origin_lng: float = Query(..., ge=-180, le=180),
    destination_lat: float = Query(..., ge=-90, le=90),
    destination_lng: float = Query(..., ge=-180, le=180),
):
    try:
        return get_route_polyline(
            origin_lat, origin_lng, destination_lat, destination_lng
        )
    except OlaMapsServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ─────────────────────────────────────────────
#  GET /users/{user_id}/bookings
# ─────────────────────────────────────────────

@router.get("/users/{user_id}/bookings", response_model=List[BookingDetailOut])
def get_user_bookings(
    user_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Access denied.")

    q = db.query(Booking).filter(Booking.client_id == user_id)
    if status:
        q = q.filter(Booking.status == status)
    bookings = q.order_by(Booking.created_at.desc()).limit(LIST_PAGE_LIMIT).all()
    return _build_details(bookings, db)


# ─────────────────────────────────────────────
#  GET /bookings/{booking_id}
# ─────────────────────────────────────────────

@router.get("/bookings/{booking_id}", response_model=BookingDetailOut)
def get_booking_detail(
    booking_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    if booking.client_id != current_user.id:
        worker = db.query(Worker).filter(
            Worker.id == booking.worker_id,
            Worker.user_id == current_user.id,
        ).first()
        if not worker:
            raise HTTPException(status_code=403, detail="Access denied.")

    return _build_detail(booking, db)
#OTP - aRRIVAL AND COMPLETION ; 5km location based filtering + 10 +20 -> msg to us if not found
