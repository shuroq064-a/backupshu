"""
routers/assistant.py
────────────────────
LLM-powered conversational assistant for the customer side.

POST /assistant/chat  (JWT)  → Server-Sent Events stream.

Multi-agent design (backend/agents):
  * A Supervisor LLM call routes each message to one of three agents — chat,
    booking, or tracking — and may request tool runs first.
  * Agents have real "powers" via deterministic tools: search_specialists
    (verified+available specialists), my_bookings, and booking_status — all
    backed by the existing worker_matching / dbmodels layer.
  * The chosen agent streams its reply token-by-token over SSE (`token` events)
    and may emit a `match` event (with specialists) or `no_workers`. New additive
    events (`agent`, `thought`, `tool`) let the UI show the AI "working".
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

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

if __package__ and "." in __package__:
    from ..database import get_db
    from .. import models, dbmodels
    from ..auth_utils import get_current_user
    from ..services.llm.model_client import LLMUnavailable
    from ..agents import run_agents
    from ..agents.sse import ev_start, ev_error, ev_done
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)
    from database import get_db
    import models, dbmodels
    from auth_utils import get_current_user
    from services.llm.model_client import LLMUnavailable
    from agents import run_agents
    from agents.sse import ev_start, ev_error, ev_done


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
            "upcoming": "NOT yet accepted — no specialist is committed; still awaiting acceptance",
            "accepted": "specialist ACCEPTED and is preparing to come (not yet on the way)",
            "started": "specialist is ON THE WAY",
            "reached": "specialist has ARRIVED at your location",
            "ongoing": "work is IN PROGRESS",
        }
        lines = []
        for b in bookings:
            assigned = False
            specialist_name = "Not yet assigned"
            if b.worker_id:
                worker = db.query(dbmodels.Worker).filter(dbmodels.Worker.id == b.worker_id).first()
                if worker:
                    su = db.query(dbmodels.User).filter(dbmodels.User.id == worker.user_id).first()
                    if su:
                        specialist_name = su.name or su.email
                        assigned = True
            if b.status == "upcoming" and assigned:
                specialist_name += " (proposed, not yet accepted)"
            status = STATUS_HUMAN.get(b.status, b.status)
            eta = f" ETA ~{b.eta_minutes} min." if b.eta_minutes else ""
            lines.append(
                f"- Booking {b.booking_number} | {b.service_type} | "
                f"assigned_specialist: {specialist_name} | "
                f"has_committed_specialist: {str(assigned and b.status != 'upcoming').lower()} | "
                f"status: {status}{eta}"
            )
        return "\n".join(lines)
    except Exception:
        return ""

router = APIRouter(prefix="/assistant", tags=["Assistant"])


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
        yield ev_start(query_id)
        try:
            # Multi-agent orchestrator: supervisor routes to chat / booking / tracking
            # agents, runs domain tools (live specialist search, booking status), and
            # streams the reply (+ agent/thought/tool events) back to the client.
            async for chunk in run_agents(db, current_user, message, history):
                yield chunk
        except LLMUnavailable:
            # Honest failure — do NOT fabricate a conversation or a classifier fallback.
            yield ev_error("I'm having trouble reaching my brain right now. Please try again in a moment.")
        except Exception as exc:
            yield ev_error("Something went wrong. Please try again.")
            print(f"[assistant] chat error: {exc}")
        finally:
            yield ev_done()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
