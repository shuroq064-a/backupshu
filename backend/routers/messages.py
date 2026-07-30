"""
routers/messages.py
───────────────────
Person-to-person chat between a specialist (worker) and a client, scoped to a booking.

Routes:
    POST /messages                                  → send a message (auth)
    GET  /messages/booking/{booking_id}             → list a booking's messages (auth)
    GET  /messages/conversations                    → conversations for current user (auth)
"""

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import Optional, List
import os
import sys
import uuid
import json
import jwt

from pydantic import BaseModel, Field

if __package__ and "." in __package__:
    from ..database import get_db, SessionLocal
    from ..dbmodels import Booking, Message, User, Worker
    from ..auth_utils import get_current_user, SECRET_KEY, ALGORITHM
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db, SessionLocal
    from dbmodels import Booking, Message, User, Worker
    from auth_utils import get_current_user, SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/messages", tags=["Messages"])


# ── WebSocket manager (live message push) ────────────────────────────────────
class MessageConnectionManager:
    def __init__(self):
        # booking_id -> list of live sockets subscribed to that booking thread.
        self.rooms: dict = {}

    def room_name(self, booking_id: str) -> str:
        return f"msg:booking_{booking_id}"

    async def connect(self, booking_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(booking_id, []).append(ws)

    def disconnect(self, booking_id: str, ws: WebSocket):
        if booking_id in self.rooms:
            self.rooms[booking_id] = [
                s for s in self.rooms[booking_id] if s is not ws
            ]
            if not self.rooms[booking_id]:
                del self.rooms[booking_id]

    async def broadcast(self, booking_id: str, payload: dict):
        dead = []
        for ws in list(self.rooms.get(booking_id, [])):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(booking_id, ws)


message_manager = MessageConnectionManager()


def _ws_token(websocket: WebSocket, token: Optional[str]) -> Optional[str]:
    if token:
        return token

    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()

    protocol = websocket.headers.get("sec-websocket-protocol")
    if protocol:
        for p in [p.strip() for p in protocol.split(",")]:
            if p.lower().startswith("bearer "):
                return p.split(" ", 1)[1].strip()

    return websocket.query_params.get("token")


def _ws_user_id(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    return user_id if isinstance(user_id, str) and user_id else None


@router.websocket("/ws/{booking_id}")
async def message_ws(booking_id: str, websocket: WebSocket, token: Optional[str] = None):
    """Live message channel for a booking thread.

    Both the client and the specialist subscribe to the same booking room and
    receive every message instantly as it is persisted (no polling delay).
    Auth: caller must be a participant of the booking.
    """
    raw = _ws_token(websocket, token)
    if not raw:
        await websocket.close(code=1008, reason="Missing authentication token")
        return
    user_id = _ws_user_id(raw)
    if not user_id:
        await websocket.close(code=1008, reason="Invalid authentication token")
        return

    db = SessionLocal()
    try:
        booking = db.query(Booking).filter(Booking.id == booking_id).first()
        if not booking:
            await websocket.close(code=1008, reason="Booking not found")
            return
        is_client = booking.client_id == user_id
        worker = db.query(Worker).filter(Worker.user_id == user_id).first()
        is_worker = bool(worker) and booking.worker_id == worker.id
        if not (is_client or is_worker):
            await websocket.close(code=1008, reason="Not a participant of this booking")
            return
    finally:
        db.close()

    await message_manager.connect(booking_id, websocket)
    try:
        while True:
            # We only push; ignore inbound frames but keep the socket alive.
            await websocket.receive_text()
    except WebSocketDisconnect:
        message_manager.disconnect(booking_id, websocket)


# ── Schemas ────────────────────────────────────────────────────────────────
class SendMessageRequest(BaseModel):
    booking_id: str
    text: str = Field(min_length=1, max_length=4000)
    # recipient_type / recipient_id are accepted for backward compatibility but are
    # IGNORED: the recipient is always derived server-side from the booking so a
    # participant cannot misroute a message to an arbitrary user.
    recipient_type: Optional[str] = None
    recipient_id: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    bookingId: str
    senderType: str
    senderId: str
    recipientType: str
    recipientId: str
    text: str
    read: bool
    createdAt: str

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    bookingId: str
    bookingNumber: Optional[str]
    serviceType: Optional[str]
    otherName: str
    otherId: str
    otherType: str
    callerRole: str
    lastMessage: str
    lastMessageAt: str
    unread: int


def _to_out(m: Message) -> MessageOut:
    return MessageOut(
        id=m.id,
        bookingId=m.booking_id,
        senderType=m.sender_type,
        senderId=m.sender_id,
        recipientType=m.recipient_type,
        recipientId=m.recipient_id,
        text=m.text,
        read=m.read,
        createdAt=m.created_at.isoformat() if m.created_at else "",
    )


def _user_worker_id(current_user: User, db: Session) -> Optional[str]:
    """Return the caller's worker id (if they have a specialist profile)."""
    worker = db.query(Worker).filter(Worker.user_id == current_user.id).first()
    return worker.id if worker else None


def _caller_role_for_booking(
    current_user: User, booking: "Booking", worker_id: Optional[str]
) -> tuple:
    """Resolve the caller's role for a SPECIFIC booking.

    A single account may be a client on some bookings and a specialist on
    others, so the role is derived per-booking rather than globally from the
    Worker table. Returns (role, id) where role is 'client' or 'worker', or
    (None, None) if the caller is not a participant of the booking.
    """
    if booking.client_id == current_user.id:
        return ("client", current_user.id)
    if worker_id and booking.worker_id == worker_id:
        return ("worker", worker_id)
    return (None, None)


@router.post("", response_model=MessageOut, status_code=201)
async def send_message(
    payload: SendMessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter(Booking.id == payload.booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    worker_id = _user_worker_id(current_user, db)
    sender_type, sender_id = _caller_role_for_booking(current_user, booking, worker_id)
    if sender_type is None:
        raise HTTPException(status_code=403, detail="Not a participant of this booking")

    if not payload.text or not payload.text.strip():
        raise HTTPException(status_code=400, detail="Message text cannot be empty")

    # Recipient is ALWAYS derived from the booking counterpart, never trusted from
    # the client. This prevents recipient spoofing / message misrouting (IDOR).
    if sender_type == "worker":
        recipient_type, recipient_id = "client", booking.client_id
    else:
        recipient_type, recipient_id = "worker", booking.worker_id

    if not recipient_id:
        raise HTTPException(
            status_code=400,
            detail="No counterpart is assigned to this booking yet",
        )

    msg = Message(
        id=str(uuid.uuid4()),
        booking_id=booking.id,
        sender_type=sender_type,
        sender_id=sender_id,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        text=payload.text.strip(),
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    # Push to every live subscriber of this booking thread (both participants).
    # Fire-and-forget: delivery to the WebSocket is best-effort and must not
    # block the HTTP response or roll back the persisted message.
    try:
        await message_manager.broadcast(booking.id, _to_out(msg).model_dump(mode="json"))
    except Exception:
        pass

    return _to_out(msg)


@router.get("/booking/{booking_id}", response_model=List[MessageOut])
def list_booking_messages(
    booking_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    worker_id = _user_worker_id(current_user, db)
    sender_type, sender_id = _caller_role_for_booking(current_user, booking, worker_id)
    if sender_type is None:
        raise HTTPException(status_code=403, detail="Not a participant of this booking")

    # Mark messages sent TO the caller as read.
    unread = (
        db.query(Message)
        .filter(
            Message.booking_id == booking.id,
            Message.recipient_type == sender_type,
            Message.recipient_id == sender_id,
            Message.read.is_(False),
        )
        .all()
    )
    for m in unread:
        m.read = True
    if unread:
        db.commit()

    rows = (
        db.query(Message)
        .filter(Message.booking_id == booking.id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [_to_out(m) for m in rows]


@router.get("/conversations", response_model=List[ConversationOut])
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    worker_id = _user_worker_id(current_user, db)

    # A dual-role account (both a client and a specialist) participates in
    # bookings on either side, so fetch both and label each per-booking.
    if worker_id:
        bookings = (
            db.query(Booking)
            .filter(
                (Booking.client_id == current_user.id)
                | (Booking.worker_id == worker_id)
            )
            .order_by(desc(Booking.updated_at))
            .all()
        )
    else:
        bookings = (
            db.query(Booking)
            .filter(Booking.client_id == current_user.id)
            .order_by(desc(Booking.updated_at))
            .all()
        )

    conversations: List[ConversationOut] = []
    if not bookings:
        return conversations

    booking_ids = [b.id for b in bookings]

    # ── Resolve the caller's role for each booking (client vs specialist) ──
    caller_info: dict = {}
    for b in bookings:
        role, cid = _caller_role_for_booking(current_user, b, worker_id)
        caller_info[b.id] = (role or "client", cid or current_user.id)

    # ── Bulk-load the latest message per booking (avoids N+1) ──
    latest_at_rows = (
        db.query(Message.booking_id, func.max(Message.created_at).label("max_created"))
        .filter(Message.booking_id.in_(booking_ids))
        .group_by(Message.booking_id)
        .all()
    )
    latest_at = {row.booking_id: row.max_created for row in latest_at_rows}
    last_by_booking: dict = {}
    if latest_at:
        latest_msgs = (
            db.query(Message)
            .filter(Message.booking_id.in_(list(latest_at.keys())))
            .all()
        )
        for m in latest_msgs:
            if m.created_at == latest_at.get(m.booking_id):
                last_by_booking[m.booking_id] = m

    # ── Per-booking unread counts for the caller (role is per-booking) ──
    unread_msgs = (
        db.query(Message)
        .filter(Message.booking_id.in_(booking_ids), Message.read.is_(False))
        .all()
    )
    unread_by_booking: dict = {}
    for m in unread_msgs:
        info = caller_info.get(m.booking_id)
        if not info:
            continue
        role, cid = info
        if m.recipient_type == role and m.recipient_id == cid:
            unread_by_booking[m.booking_id] = unread_by_booking.get(m.booking_id, 0) + 1

    # ── Resolve the counterpart ("other") name per booking ──
    # Caller-as-client bookings → counterpart is the worker (specialist).
    # Caller-as-worker bookings → counterpart is the client (user).
    worker_ids_needed = [
        b.worker_id for b in bookings
        if caller_info[b.id][0] == "client" and b.worker_id
    ]
    workers = (
        db.query(Worker).filter(Worker.id.in_(worker_ids_needed)).all()
        if worker_ids_needed else []
    )
    worker_by_id = {w.id: w for w in workers}
    user_ids_needed = [w.user_id for w in workers if w.user_id]
    users_for_workers = (
        db.query(User).filter(User.id.in_(user_ids_needed)).all()
        if user_ids_needed else []
    )
    user_by_id = {u.id: u for u in users_for_workers}

    client_ids_needed = [
        b.client_id for b in bookings
        if caller_info[b.id][0] == "worker" and b.client_id
    ]
    clients = (
        db.query(User).filter(User.id.in_(client_ids_needed)).all()
        if client_ids_needed else []
    )
    client_by_id = {u.id: u for u in clients}

    other_name_by_booking: dict = {}
    other_id_by_booking: dict = {}
    other_type_by_booking: dict = {}
    for b in bookings:
        role, _ = caller_info[b.id]
        if role == "worker":
            other_id_by_booking[b.id] = b.client_id or ""
            u = client_by_id.get(b.client_id)
            other_name_by_booking[b.id] = u.name if u and u.name else "Client"
            other_type_by_booking[b.id] = "client"
        else:
            other_id_by_booking[b.id] = b.worker_id or ""
            w = worker_by_id.get(b.worker_id) if b.worker_id else None
            u = user_by_id.get(w.user_id) if w else None
            other_name_by_booking[b.id] = u.name if u and u.name else "Specialist"
            other_type_by_booking[b.id] = "worker"

    for b in bookings:
        role, _ = caller_info[b.id]
        last = last_by_booking.get(b.id)
        conversations.append(
            ConversationOut(
                bookingId=b.id,
                bookingNumber=b.booking_number,
                serviceType=b.service_type,
                otherName=other_name_by_booking.get(b.id, ""),
                otherId=other_id_by_booking.get(b.id, ""),
                otherType=other_type_by_booking.get(b.id, "worker"),
                callerRole=role,
                lastMessage=last.text if last else "No messages yet",
                lastMessageAt=last.created_at.isoformat() if last and last.created_at else "",
                unread=unread_by_booking.get(b.id, 0),
            )
        )

    return conversations
