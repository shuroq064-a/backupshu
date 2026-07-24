"""
agents/supervisor.py
─────────────────────
The multi-agent orchestrator for the customer assistant.

Flow per user message:
  1. Supervisor (a single cheap LLM call) routes the message to one of three
     agents (chat / booking / tracking) and may request tool runs first.
  2. Tools execute deterministically (search_specialists / my_bookings /
     booking_status) — this is the agent's "power": real, live data.
  3. The chosen agent streams its reply (token-by-token) or, for booking,
     returns a match event with verified specialists.

All output is yielded as SSE strings via agents.sse so the router just forwards them.
"""

from __future__ import annotations

import json
import re

from .sse import (
    ev_agent,
    ev_thought,
    ev_tool,
    ev_token,
    ev_match,
    ev_no_workers,
    ev_clarify,
    ev_error,
)
from . import prompts
from .tools import (
    TOOLS,
    tool_search_specialists,
    tool_my_bookings,
    tool_booking_status,
    tool_service_catalog,
    tool_estimate_cost,
    tool_cancel_booking,
)

# Import the LLM client + catalog helpers defensively (router may run as package or script).
try:
    from ..services.llm.model_client import stream_chat, chat, LLMUnavailable
    from ..services.llm.catalog import build_booking_context
except ImportError:  # running as a script / flat layout
    from services.llm.model_client import stream_chat, chat, LLMUnavailable
    from services.llm.catalog import build_booking_context


_PLAN_RE = re.compile(r"\{.*\}\s*$", re.DOTALL)


def _extract_json(text: str) -> dict | None:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    m = _PLAN_RE.search(text.strip())
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            return None
    return None


async def _run_tool(db, user, name: str, args: dict) -> dict:
    """Execute a named tool and return its result dict."""
    if name == "search_specialists":
        intent = (args or {}).get("intent", "")
        return await tool_search_specialists(db, intent)
    if name == "my_bookings":
        return await tool_my_bookings(db, user)
    if name == "booking_status":
        bid = (args or {}).get("booking_id") or (args or {}).get("bookingId") or ""
        return await tool_booking_status(db, bid, user)
    if name == "service_catalog":
        return await tool_service_catalog(db)
    if name == "estimate_cost":
        intent = (args or {}).get("intent", "")
        return await tool_estimate_cost(db, intent)
    if name == "cancel_booking":
        bid = (args or {}).get("booking_id") or (args or {}).get("bookingId") or ""
        return await tool_cancel_booking(db, bid, user)
    return {"ok": False, "summary": f"Unknown tool '{name}'."}


async def _supervise(db, user, message: str, history: list[dict]) -> dict:
    """Ask the LLM to route the message. Returns a plan dict with safe defaults."""
    msgs = [
        {"role": "system", "content": prompts.supervisor_prompt()},
        *history[-6:],
        {"role": "user", "content": message},
    ]
    try:
        raw = await chat(msgs)
    except LLMUnavailable:
        # Fall back to sensible defaults when the router LLM is unavailable.
        return {"agent": "chat", "thought": "Routing to chat (router unavailable).", "tools": []}
    plan = _extract_json(raw) or {}
    agent = plan.get("agent")
    if agent not in ("chat", "booking", "tracking", "clarify"):
        agent = "chat"
    tools = plan.get("tools")
    if not isinstance(tools, list):
        tools = []
    return {
        "agent": agent,
        "thought": str(plan.get("thought", ""))[:240],
        "tools": tools[:3],
    }


_AGENT_META = {
    "chat": ("chat", "Conversation Agent", "Chatting with you"),
    "booking": ("booking", "Booking Agent", "Finding a verified specialist"),
    "tracking": ("tracking", "Tracking Agent", "Checking your booking status"),
    "clarify": ("clarify", "Clarify Agent", "Understanding your need"),
}


def _tool_data_block(tool_results: list) -> str:
    """Render tool outputs into a compact text block the agents can read."""
    parts = []
    for name, res in tool_results:
        if not isinstance(res, dict) or not res.get("ok"):
            continue
        if name == "service_catalog":
            parts.append("SERVICE CATALOG: " + ", ".join(res.get("services", [])))
        elif name == "estimate_cost":
            parts.append(
                f"COST ESTIMATE for {res.get('intent')}: "
                f"~₹{res.get('estimated_price')} "
                f"(ETA ~{res.get('eta_minutes')} min)."
            )
        elif name == "search_specialists":
            w = res.get("workers", [])
            lines = []
            for x in w:
                line = f"- {x.get('name') or x.get('email')}"
                if x.get("experience_years"):
                    line += f" ({x['experience_years']}y exp)"
                if x.get("price") is not None:
                    line += f", ₹{x['price']}"
                if x.get("is_verified"):
                    line += ", verified"
                lines.append(line)
            parts.append(
                "SPECIALISTS for " + str(res.get("intent")) + ":\n" + "\n".join(lines)
                if lines else f"No specialists found for {res.get('intent')}."
            )
        elif name in ("my_bookings", "booking_status"):
            parts.append("BOOKING DATA: " + json.dumps(res, ensure_ascii=False))
    return "\n\n".join(parts)


async def run_agents(db, user, message: str, history: list[dict]):
    """Async generator yielding SSE strings for one user turn.

    Emits: agent -> (thought) -> (tool)* -> token* | match | no_workers | clarify.
    Raises LLMUnavailable so the router can surface an honest error.
    """
    plan = await _supervise(db, user, message, history)
    agent_name = plan["agent"]
    label, job = _AGENT_META.get(agent_name, _AGENT_META["chat"])[1:]
    yield ev_agent(agent_name, label, job)
    if plan.get("thought"):
        yield ev_thought(plan["thought"])

    booking_ctx = build_booking_context(db, user)

    # ── Run requested tools (the agents' "powers") ────────────────────────────
    tool_results = []
    for t in plan.get("tools", []):
        name = t.get("name")
        if name not in TOOLS:
            continue
        args = t.get("args") or {}
        try:
            result = await _run_tool(db, user, name, args)
        except Exception as exc:  # never let a tool crash the stream
            result = {"ok": False, "summary": f"{name} failed: {exc}"}
        tool_results.append((name, result))
        yield ev_tool(name, args, result.get("summary", ""))

    tool_data = _tool_data_block(tool_results)

    # ── Dispatch to the chosen agent ───────────────────────────────────────────
    if agent_name == "tracking":
        async for chunk in _tracking_agent(db, user, message, history, booking_ctx, tool_results):
            yield chunk
    elif agent_name == "booking":
        async for chunk in _booking_agent(db, user, message, history, tool_results, tool_data):
            yield chunk
    else:
        # "clarify" and "chat" both handled by chat agent — it naturally asks
        # clarifying questions when the request is vague.
        async for chunk in _chat_agent(message, history, booking_ctx, tool_data):
            yield chunk


async def _chat_agent(message: str, history: list[dict], booking_ctx: str, tool_data: str = ""):
    system = prompts.chat_agent_prompt(booking_ctx)
    if tool_data:
        system += "\n\nTOOL DATA for this turn (use it in your reply):\n" + tool_data
    msgs = [{"role": "system", "content": system}]
    msgs.extend(history)
    msgs.append({"role": "user", "content": message})
    async for delta in stream_chat(msgs):
        yield ev_token(delta)


async def _clarify_agent(message: str, history: list[dict], tool_data: str = ""):
    system = prompts.clarify_agent_prompt()
    if tool_data:
        system += "\n\nCONTEXT (use only if relevant):\n" + tool_data
    msgs = [{"role": "system", "content": system}]
    msgs.extend(history[-6:])
    msgs.append({"role": "user", "content": message})
    parts = []
    async for delta in stream_chat(msgs):
        parts.append(delta)
        yield ev_token(delta)
    reply = "".join(parts).strip()
    options = ["Plumbing", "Electrical", "AC repair", "Cleaning"]
    yield ev_clarify(reply, options)


async def _booking_agent(db, user, message: str, history: list[dict], tool_results: list, tool_data: str = ""):
    """Acknowledge the request and surface verified specialists via a match event."""
    # Prefer a tool result if the supervisor already searched; otherwise search now.
    intent = None
    workers = []
    for name, res in tool_results:
        if name == "search_specialists" and res.get("ok"):
            intent = res.get("intent")
            workers = res.get("workers", [])
    if intent is None:
        # Recover intent from the message with a quick classification.
        intent = await _classify_intent(message)
        if intent:
            res = await tool_search_specialists(db, intent)
            intent = res.get("intent")
            workers = res.get("workers", [])
            yield ev_tool("search_specialists", {"intent": message}, res.get("summary", ""))

    if not intent:
        # Couldn't map to a service — let the chat agent handle gracefully.
        async for chunk in _chat_agent(message, history, build_booking_context(db, user), tool_data):
            yield chunk
        return

    # Stream a short acknowledgement from the booking agent persona, grounded in
    # the cost estimate + specialist data the tools returned.
    system = prompts.booking_agent_prompt()
    if tool_data:
        system += "\n\nTOOL DATA (use the real numbers):\n" + tool_data
    ack_msgs = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Customer request: {message}"},
    ]
    ack_parts = []
    async for delta in stream_chat(ack_msgs):
        ack_parts.append(delta)
        yield ev_token(delta)
    ack = "".join(ack_parts).strip()

    if workers:
        yield ev_match(ack, intent, workers)
    else:
        yield ev_no_workers(ack, intent)


async def _tracking_agent(db, user, message: str, history: list[dict], booking_ctx: str, tool_results: list):
    """Answer a status question from real data; stream a natural reply."""
    # Build a data block from tool results (preferred) or the prebuilt context.
    data_block = booking_ctx
    for name, res in tool_results:
        if name in ("my_bookings", "booking_status") and res.get("ok"):
            data_block = json.dumps(res, ensure_ascii=False, indent=2)

    msgs = [
        {"role": "system", "content": prompts.tracking_agent_prompt(data_block)},
        *history[-6:],
        {"role": "user", "content": message},
    ]
    async for delta in stream_chat(msgs):
        yield ev_token(delta)


async def _classify_intent(message: str) -> str | None:
    """Quick JSON classification of the service intent (mirrors the old intent step)."""
    try:
        from ..services.llm.catalog import build_intent_prompt
        from .. import dbmodels  # noqa: F401  (ensure module loaded)
    except ImportError:
        from services.llm.catalog import build_intent_prompt
    # build_intent_prompt needs a db for catalog names; fall back to a light prompt.
    prompt = (
        "Classify the home-service intent of the message. Respond with ONLY JSON: "
        '{"intent": "<service> or null", "booking": true|false}. '
        "Valid services include plumbing, electrical, AC repair, carpenter, cleaning, "
        "painting, massage, gardening."
    )
    try:
        raw = await chat([{"role": "system", "content": prompt}, {"role": "user", "content": message}])
    except LLMUnavailable:
        return None
    data = _extract_json(raw) or {}
    intent = data.get("intent")
    if isinstance(intent, str) and intent:
        # resolve via the catalog using a throwaway session is overkill; do a light normalize.
        return intent
    return None
