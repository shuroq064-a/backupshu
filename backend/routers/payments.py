"""
routers/payments.py
───────────────────
Razorpay payment integration.

Routes:
    POST /payments/create-order  → create Razorpay order for a booking
    POST /payments/verify        → verify payment signature server-side
    POST /payments/webhook       → Razorpay webhook handler (backup verification)
"""

import hashlib
import hmac
import json
import os
import sys
import uuid
from datetime import datetime

import razorpay
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text

if __package__ and "." in __package__:
    from ..database import get_db
    from ..dbmodels import Booking, Payment
    from ..models import PaymentOrderOut, PaymentOrderIn, PaymentVerifyIn, PaymentOut
    from ..auth_utils import get_current_user, User
    from ..services.rate_limiter import rate_limit
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    from database import get_db
    from dbmodels import Booking, Payment
    from models import PaymentOrderOut, PaymentOrderIn, PaymentVerifyIn, PaymentOut
    from auth_utils import get_current_user, User
    from services.rate_limiter import rate_limit

router = APIRouter(prefix="/payments", tags=["Payments"])

# ── Razorpay client ──────────────────────────────────────────────────────────
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")

client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


# ── Helpers ──────────────────────────────────────────────────────────────────

def _verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """HMAC-SHA256 verification of Razorpay payment signature."""
    if not RAZORPAY_KEY_SECRET:
        return False
    payload = f"{order_id}|{payment_id}"
    expected = hmac.new(
        RAZORPAY_KEY_SECRET.encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def _verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify Razorpay webhook signature."""
    if not RAZORPAY_WEBHOOK_SECRET:
        return False
    expected = hmac.new(
        RAZORPAY_WEBHOOK_SECRET.encode("utf-8"),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── POST /payments/create-order ──────────────────────────────────────────────

@router.post("/create-order", response_model=PaymentOrderOut)
def create_order(
    payload: PaymentOrderIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rate_limit(request, "payment-create", max_requests=10, window_seconds=3600)
    booking_id = payload.booking_id

    # SELECT FOR UPDATE — prevents race condition on concurrent creates
    booking = db.query(Booking).filter(Booking.id == booking_id).with_for_update().first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the booking owner can pay.")
    if booking.status != "completed":
        raise HTTPException(status_code=422, detail="Payment is only available after the job is completed.")
    if booking.is_paid:
        raise HTTPException(status_code=409, detail="This booking is already paid.")

    # Check for existing unpaid order — return it (idempotent)
    existing = (
        db.query(Payment)
        .filter(
            Payment.booking_id == booking_id,
            Payment.status.in_(["created", "attempted"]),
        )
        .first()
    )
    if existing:
        return PaymentOrderOut(
            orderId=existing.razorpay_order_id,
            amount=int(existing.amount),
            currency=existing.currency,
            keyId=RAZORPAY_KEY_ID,
            bookingId=booking_id,
        )

    # Amount in paise (Razorpay requires integer)
    amount = int((booking.total_amount or booking.visit_charge or 100) * 100)

    try:
        order = client.order.create({
            "amount": amount,
            "currency": "INR",
            "receipt": booking_id,
            "notes": {
                "booking_number": booking.booking_number or "",
                "service_type": booking.service_type or "",
            },
        })
    except Exception as e:
        import logging
        logging.getLogger(__name__).exception("Failed to create payment order for booking %s", booking_id)
        raise HTTPException(status_code=502, detail="Failed to create payment order. Please try again.")

    payment = Payment(
        id=str(uuid.uuid4()),
        booking_id=booking_id,
        razorpay_order_id=order["id"],
        amount=amount,
        currency="INR",
        status="created",
        created_at=datetime.utcnow(),
    )
    db.add(payment)
    db.commit()

    return PaymentOrderOut(
        orderId=order["id"],
        amount=amount,
        currency="INR",
        keyId=RAZORPAY_KEY_ID,
        bookingId=booking_id,
    )


# ── POST /payments/verify ───────────────────────────────────────────────────

@router.post("/verify", response_model=PaymentOut)
def verify_payment(
    payload: PaymentVerifyIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(Booking.id == payload.bookingId).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if booking.client_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the booking owner can verify payment.")
    if booking.is_paid:
        raise HTTPException(status_code=409, detail="This booking is already paid.")

    # Find the payment record
    payment = (
        db.query(Payment)
        .filter(
            Payment.razorpay_order_id == payload.orderId,
            Payment.booking_id == payload.bookingId,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment order not found.")

    # Security: verify HMAC signature server-side
    if not _verify_signature(payload.orderId, payload.paymentId, payload.razorpaySignature):
        payment.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")

    # Fetch payment details from Razorpay to confirm amount
    try:
        razorpay_payment = client.payment.fetch(payload.paymentId)
    except Exception as e:
        # Cannot verify amount — reject payment
        payment.status = "failed"
        db.commit()
        raise HTTPException(status_code=502, detail="Failed to verify payment with Razorpay.")

    # Verify amount matches (anti-tampering)
    if razorpay_payment.get("amount") != payment.amount:
        payment.status = "failed"
        db.commit()
        raise HTTPException(status_code=400, detail="Payment amount mismatch.")

    # Mark as captured
    payment.razorpay_payment_id = payload.paymentId
    payment.razorpay_signature = payload.razorpaySignature
    payment.status = "captured"
    payment.updated_at = datetime.utcnow()

    # Update booking
    booking.is_paid = True
    booking.payment_method = "razorpay"
    booking.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(payment)

    return PaymentOut(
        id=payment.id,
        bookingId=payment.booking_id,
        razorpayOrderId=payment.razorpay_order_id,
        razorpayPaymentId=payment.razorpay_payment_id,
        amount=payment.amount,
        currency=payment.currency,
        status=payment.status,
        createdAt=payment.created_at,
    )


# ── POST /payments/webhook ──────────────────────────────────────────────────

@router.post("/webhook")
async def payment_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None),
    db: Session = Depends(get_db),
):
    """
    Razorpay webhook handler. Verifies the webhook signature and updates
    payment + booking status accordingly. This is the reliable backup for
    cases where client-side verification fails (browser close, network drop).
    """
    body = await request.body()

    # Verify webhook signature — REJECT if invalid
    if not x_razorpay_signature or not _verify_webhook_signature(body, x_razorpay_signature):
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event_type = event.get("event", "")
    payload_data = event.get("payload", {})

    if event_type == "payment.captured":
        payment_entity = payload_data.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        payment_id = payment_entity.get("id")

        if order_id:
            payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id).first()
            if payment and payment.status != "captured":
                payment.razorpay_payment_id = payment_id
                payment.status = "captured"
                payment.updated_at = datetime.utcnow()

                booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
                if booking:
                    booking.is_paid = True
                    booking.payment_method = "razorpay"
                    booking.updated_at = datetime.utcnow()

                db.commit()

    elif event_type == "payment.failed":
        payment_entity = payload_data.get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")

        if order_id:
            payment = db.query(Payment).filter(Payment.razorpay_order_id == order_id).first()
            if payment and payment.status not in ["captured", "failed"]:
                payment.status = "failed"
                payment.updated_at = datetime.utcnow()
                db.commit()

    return {"status": "ok"}
