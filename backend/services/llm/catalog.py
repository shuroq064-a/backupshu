"""
services/llm/catalog.py
────────────────────────
Builds the ShuroqX catalog context for the LLM system prompt and validates the
intent string the model returns against the real Service catalog.

We deliberately reuse ``service_matches_intent`` from worker_matching so the LLM's
free-form intent ("plumber", "AC not cooling") maps to the same canonical service the
rest of the app uses for matching.
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import dbmodels
from services.worker_matching import service_matches_intent, normalize_service_text


def get_catalog_names(db) -> list[str]:
    """Live read of Service catalog names (authoritative)."""
    try:
        rows = db.query(dbmodels.Service).all()
        return [r.name for r in rows]
    except Exception:
        return []


def resolve_intent(db, llm_intent: str | None) -> str | None:
    """
    Map an LLM-provided intent string to a canonical catalog service name.

    Returns the canonical Service.name if a match is found, else None.
    Tries exact + alias matching via service_matches_intent against every catalog service.
    """
    if not llm_intent:
        return None

    normalized_llm = normalize_service_text(llm_intent)
    if not normalized_llm:
        return None

    for service in db.query(dbmodels.Service).all():
        if service_matches_intent(service.name, normalized_llm):
            return service.name
    return None


def build_booking_context(db, user) -> str:
    """Summarize the customer's active/upcoming bookings for the assistant.

    NOTE: this must be called from a module that imports the SAME `dbmodels`
    instance the session was created with (dbmodels class identity matters for
    SQLAlchemy queries). `assistant.py` builds the context and passes it in as a
    string to `build_system_prompt` to avoid duplicate-module import mismatches.
    Returns an empty string when the user has no open bookings.
    """
    if not user:
        return ""
    try:
        ACTIVE = {"upcoming", "accepted", "started", "reached", "ongoing"}
        bookings = (
            db.query(dbmodels.Booking)
            .filter(dbmodels.Booking.client_id == user.id, dbmodels.Booking.status.in_(ACTIVE))
            .order_by(dbmodels.Booking.created_at.desc())
            .all()
        )
        if not bookings:
            return ""

        STATUS_HUMAN = {
            "upcoming": "waiting for a specialist to accept",
            "accepted": "specialist accepted and is preparing to come",
            "started": "specialist is on the way",
            "reached": "specialist has arrived at your location",
            "ongoing": "work is in progress",
        }

        lines = []
        for b in bookings:
            specialist_name = "Not yet assigned"
            if b.worker_id:
                worker = db.query(dbmodels.Worker).filter(dbmodels.Worker.id == b.worker_id).first()
                if worker:
                    specialist_name = worker.email.split("@")[0]
                    if worker.name:
                        specialist_name = worker.name
            status = STATUS_HUMAN.get(b.status, b.status)
            eta = f" ETA ~{b.eta_minutes} min." if b.eta_minutes else ""
            loc = ""
            if b.current_latitude and b.current_longitude and b.customer_latitude and b.customer_longitude:
                loc = " (live location tracking active)"
            lines.append(
                f"- Booking {b.booking_number} | {b.service_type} | "
                f"specialist: {specialist_name} | status: {status}{eta}{loc}"
            )
        return "\n".join(lines)
    except Exception:
        return ""


def build_system_prompt(booking_context: str = "") -> str:
    """System prompt for the conversational assistant.

    The assistant is a multi-capability agent for the customer:
      * CHAT agent  — holds real, warm conversations in any language.
      * TRACKING agent — knows the customer's live bookings and answers
        "where is my specialist?" / "what's the status?" from real data.
      * BOOKING agent — when the customer wants a service, acknowledges and lets
        the system arrange a verified specialist.
    `booking_context` is a pre-built string of the user's active bookings.
    """
    booking_section = ""
    if booking_context:
        booking_section = (
            "\n\nACTIVE BOOKINGS (real, live data — use this to answer tracking questions):\n"
            f"{booking_context}\n"
            "When the customer asks 'where is my specialist', 'what's the status', or similar, "
            "answer from the ACTIVE BOOKINGS above. Never say you don't know their booking — "
            "you can see it. If a specialist is 'on the way' or 'arrived', say so confidently. "
            "If no booking is listed for what they ask, then fall back to helping them book one.\n"
        )

    return (
        "You are ShuroqX AI, a friendly, knowledgeable assistant for ShuroqX, a home-services "
        "marketplace where customers book verified local specialists (plumbers, electricians, "
        "AC repair, carpenters, cleaners, painters, masseurs, gardeners, and more).\n\n"
        "How to behave:\n"
        "- Talk like a real human. Be warm, concise (1-3 sentences), and match the customer's "
        "language and tone exactly (English, Telugu, Hindi, etc.).\n"
        "- You can chat about anything — greetings, questions, small talk. Never refuse to converse.\n"
        "- You are booking-aware. When a customer describes a home-service need or wants to "
        "book/request one, acknowledge it and let them know you can arrange a verified specialist. "
        "Do not pressure them or force a booking.\n"
        "- You are a TRACKING agent too: when asked about an existing booking or specialist, answer "
        "from the ACTIVE BOOKINGS context below using real status. Never tell the customer to 'check "
        "the website' or 'look under the Specialists section' for a booking they already have — you "
        "already know its status and can state it directly.\n"
        "- Only list the service categories if the customer asks 'what services do you offer?' or is "
        "clearly unsure what to pick.\n"
        "- Do not use markdown headings, bullet lists, or code. Just talk."
        + booking_section
    )


def build_intent_prompt(db) -> str:
    """System prompt for the cheap, structured booking-intent check.

    This is a separate, non-streaming call made after the conversation so the chat stays
    natural. It returns ONLY a JSON object.
    """
    names = get_catalog_names(db)
    catalog_list = ", ".join(names) if names else "general home services"

    return (
        "You are an intent classifier for the ShuroqX home-services marketplace. "
        f"The only valid service categories are: {catalog_list}.\n"
        "Decide whether the customer's message expresses a clear need for one of these "
        "services AND a willingness to request/book it now.\n"
        "Respond with ONLY a JSON object (no prose, no code fences):\n"
        '{"intent": "<exact category name> or null", '
        '"booking": true|false}\n'
        "Rules:\n"
        "- intent must be one of the listed categories exactly, or null.\n"
        "- booking=true only when the user clearly wants to request/book that service "
        "(e.g. 'book a plumber', 'fix my AC', 'I need an electrician'). A greeting, a "
        "question, 'tell me about plumbing', or vague small talk is booking=false and "
        "intent=null."
    )
