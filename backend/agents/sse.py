"""
agents/sse.py
─────────────
Shared SSE event builder for the multi-agent assistant.

These events are emitted on top of the existing protocol (start / token / match /
no_workers / error / done). New event types (agent / thought / tool) are additive —
the frontend treats them as optional UI enhancements and degrades gracefully.
"""

from __future__ import annotations

import json


def sse(event_type: str, data: dict) -> str:
    payload = json.dumps({"type": event_type, **data}, ensure_ascii=False)
    return f"event: {event_type}\ndata: {payload}\n\n"


def ev_start(query_id: str) -> str:
    return sse("start", {"queryId": query_id})


def ev_agent(name: str, label: str, job: str) -> str:
    """Announce which agent is now handling the request."""
    return sse("agent", {"name": name, "label": label, "job": job})


def ev_thought(text: str) -> str:
    """Stream the supervisor/agent reasoning as it plans (visible "AI working")."""
    return sse("thought", {"text": text})


def ev_tool(name: str, args: dict, result_summary: str) -> str:
    """Announce a tool the active agent invoked and its (short) outcome."""
    return sse("tool", {"name": name, "args": args, "summary": result_summary})


def ev_token(text: str) -> str:
    return sse("token", {"text": text})


def ev_match(reply: str, intent: str, workers: list) -> str:
    return sse("match", {"reply": reply, "intent": intent, "workers": workers})


def ev_no_workers(reply: str, intent: str) -> str:
    return sse("no_workers", {"reply": reply, "intent": intent})


def ev_clarify(reply: str, options: list) -> str:
    return sse("clarify", {"reply": reply, "options": options})


def ev_error(reply: str) -> str:
    return sse("error", {"reply": reply})


def ev_done() -> str:
    return sse("done", {})
