"""
routers/assistant.py
────────────────────
LLM-powered conversational assistant for the customer side.

POST /assistant/chat  (JWT)  → Server-Sent Events stream.

Design (per product requirement: "the AI should just talk to the user"):
  * The assistant is a real conversational agent. It streams its natural reply
    token-by-token over SSE (`token` events). No hard-coded replies, no forced
    catalog dumps, no JSON-only contract.
  * After the reply streams, a single cheap non-streaming call asks the SAME model
    to decide, in JSON, whether the user clearly requested a bookable home service
    (e.g. "book a plumber"). If so we emit a `match` event (with available+verified
    specialists) or `no_workers`. Pure chit-chat just ends after the stream.
  * If the LLM is genuinely unreachable, we surface a single honest `error` event —
    we do NOT fabricate a conversation or fall back to a dumb classifier.

Specialist eligibility ("availability toggle ON" + verified skill) is enforced by the
existing find_available_workers_by_intent (worker_matching.py) — reused, never rewritten.
"""

from __future__ import annotations

import os
import sys
import json
import uuid
import re

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

if __package__ and "." in __package__:
    from ..database import get_db
    from .. import models, dbmodels
    from ..auth_utils import get_current_user
    from ..services.llm.frenix_client import stream_chat, chat, LLMUnavailable
    from ..services.llm.catalog import (
        build_system_prompt,
        build_intent_prompt,
        resolve_intent,
        get_catalog_names,
    )
    from ..services.worker_matching import find_available_workers_by_intent
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    from database import get_db
    import models, dbmodels
    from auth_utils import get_current_user
    from services.llm.frenix_client import stream_chat, chat, LLMUnavailable
    from services.llm.catalog import (
        build_system_prompt,
        build_intent_prompt,
        resolve_intent,
        get_catalog_names,
    )
    from services.worker_matching import find_available_workers_by_intent


def build_booking_context(db: Session, user: dbmodels.User) -> str:
    """Summarize the user's active/upcoming bookings for the assistant.

    Built here (not in catalog.py) because this module imports the same `dbmodels`
    instance the DB session uses — avoiding the duplicate-module class-identity bug
    that makes cross-module SQLAlchemy queries return nothing.
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
                    su = db.query(dbmodels.User).filter(dbmodels.User.id == worker.user_id).first()
                    if su:
                        specialist_name = su.name or su.email
            status = STATUS_HUMAN.get(b.status, b.status)
            eta = f" ETA ~{b.eta_minutes} min." if b.eta_minutes else ""
            lines.append(
                f"- Booking {b.booking_number} | {b.service_type} | "
                f"specialist: {specialist_name} | status: {status}{eta}"
            )
        return "\n".join(lines)
    except Exception:
        return ""

router = APIRouter(prefix="/assistant", tags=["Assistant"])


class _SSE:
    """Minimal SSE helper."""

    @staticmethod
    def event(event_type: str, data: dict) -> str:
        payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
        return f"event: {event_type}\ndata: {payload}\n\n"


_INTENT_RE = re.compile(r"\{.*\}\s*$", re.DOTALL)


def _extract_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = _INTENT_RE.search(text.strip())
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    return None


def _match_workers(db: Session, canonical_intent: str):
    return find_available_workers_by_intent(db, canonical_intent)


def _build_history(payload: models.AssistantChatRequest) -> list[dict]:
    """Parse prior turns sent by the client (serialized chat history).

    The frontend sends `context` as a JSON string of [{role, content}] so the AI
    remembers the conversation and the booking it already arranged. Kept simple and
    defensive — malformed history is ignored rather than breaking the stream.
    """
    history: list[dict] = []
    raw = payload.context
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                for turn in parsed[-20:]:  # cap memory to last 20 turns
                    role = turn.get("role")
                    content = turn.get("content")
                    if role in ("user", "assistant") and isinstance(content, str) and content:
                        history.append({"role": role, "content": content})
        except (json.JSONDecodeError, TypeError):
            pass
    return history


async def _stream_conversation(db: Session, user: dbmodels.User, message: str, history: list[dict]):
    """Stream the assistant's natural reply token-by-token.

    The model is a booking-aware conversational agent: it gets the live booking
    context and the recent chat history so it can answer "where is my specialist?"
    from real data and remember what was discussed. Booking matching is handled
    separately afterwards so the conversation is never sacrificed.
    """
    booking_ctx = build_booking_context(db, user)
    convo_messages: list[dict] = [
        {"role": "system", "content": build_system_prompt(booking_ctx)},
    ]
    convo_messages.extend(history)
    convo_messages.append({"role": "user", "content": message})

    async for delta in stream_chat(convo_messages):
        yield _SSE.event("token", {"text": delta})


async def _resolve_booking(db: Session, user: dbmodels.User, message: str, history: list[dict]):
    """Ask the model (cheap, non-streaming) whether a bookable service was requested.

    Returns a `match` / `no_workers` SSE event when appropriate, else nothing.
    Any failure is swallowed — a chit-chat turn simply stays a chit-chat turn.
    """
    try:
        intent_messages: list[dict] = [
            {"role": "system", "content": build_intent_prompt(db)},
        ]
        intent_messages.extend(history[-6:])
        intent_messages.append({"role": "user", "content": message})
        raw = await chat(intent_messages)
    except LLMUnavailable:
        return

    data = _extract_json(raw) or {}
    intent = data.get("intent")
    booking = bool(data.get("booking", False))
    if not booking or not isinstance(intent, str):
        return

    canonical = resolve_intent(db, intent)
    if not canonical:
        return

    workers = _match_workers(db, canonical)
    if workers:
        yield _SSE.event(
            "match",
            {
                "reply": "",
                "intent": canonical,
                "workers": [w.model_dump() for w in workers],
            },
        )
    else:
        yield _SSE.event(
            "no_workers",
            {"reply": "", "intent": canonical},
        )


@router.post("/chat")
async def assistant_chat(
    payload: models.AssistantChatRequest,
    db: Session = Depends(get_db),
    current_user: dbmodels.User = Depends(get_current_user),
):
    message = (payload.message or "").strip()
    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Message cannot be empty",
        )

    # Persist the query for history / debugging.
    new_query = dbmodels.UserQuery(
        id=str(uuid.uuid4()),
        input_message=message,
        intent=None,
        status="processing",
        user_id=current_user.id,
    )
    try:
        db.add(new_query)
        db.commit()
        db.refresh(new_query)
    except Exception:
        db.rollback()

    query_id = new_query.id

    history = _build_history(payload)

    async def event_generator():
        yield _SSE.event("start", {"queryId": query_id})
        try:
            # 1) Real conversational stream (booking-aware + remembers history).
            async for chunk in _stream_conversation(db, current_user, message, history):
                yield chunk
            # 2) Soft booking detection (only emits an event when a service was requested).
            async for chunk in _resolve_booking(db, current_user, message, history):
                yield chunk
        except LLMUnavailable:
            # Honest failure — do NOT fabricate a conversation or a classifier fallback.
            yield _SSE.event(
                "error",
                {"reply": "I'm having trouble reaching my brain right now. Please try again in a moment."},
            )
        except Exception as exc:
            yield _SSE.event(
                "error",
                {"reply": "Something went wrong. Please try again."},
            )
            print(f"[assistant] chat error: {exc}")
        finally:
            yield _SSE.event("done", {})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
