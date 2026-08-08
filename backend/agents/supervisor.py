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
    tool_list_nearby_specialists,
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


async def _run_tool(db, user, name: str, args: dict, location: tuple | None = None) -> dict:
    """Execute a named tool and return its result dict."""
    if name == "search_specialists":
        intent = (args or {}).get("intent", "")
        lat, lon = location if location else (None, None)
        return await tool_search_specialists(db, intent, lat, lon)
    if name == "list_nearby_specialists":
        lat, lon = location if location else (None, None)
        return await tool_list_nearby_specialists(db, lat, lon)
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
                if x.get("distanceKm") is not None:
                    line += f" ({x['distanceKm']} km away)"
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
        elif name == "list_nearby_specialists":
            by_service = res.get("by_service") or {}
            lines = []
            for svc, items in by_service.items():
                detail = ", ".join(
                    f"{s['name']} ({s['distance_km']} km away)" for s in items
                )
                lines.append(f"- {svc}: {detail}")
            parts.append(
                "NEARBY SPECIALISTS (ALL CATEGORIES):\n" + "\n".join(lines)
                if lines else "No available specialists within 5 km of your location."
            )
        elif name in ("my_bookings", "booking_status"):
            parts.append("BOOKING DATA: " + json.dumps(res, ensure_ascii=False))
    return "\n\n".join(parts)


async def run_agents(db, user, message: str, history: list[dict], location: tuple | None = None):
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
            result = await _run_tool(db, user, name, args, location)
        except Exception as exc:  # never let a tool crash the stream
            result = {"ok": False, "summary": f"{name} failed: {exc}"}
        tool_results.append((name, result))
        yield ev_tool(name, args, result.get("summary", ""))

    tool_data = _tool_data_block(tool_results)

    # ── Dispatch to the chosen agent ───────────────────────────────────────────
    listed = any(name == "list_nearby_specialists" for name, _ in tool_results)
    if agent_name == "tracking":
        async for chunk in _tracking_agent(db, user, message, history, booking_ctx, tool_results):
            yield chunk
    elif agent_name == "booking":
        async for chunk in _booking_agent(db, user, message, history, tool_results, tool_data, location):
            yield chunk
    elif listed:
        # "Who/what specialists are near me" — the listing is built from real
        # tool data deterministically; no model tokens are involved.
        async for chunk in _nearby_listing_agent(tool_results):
            yield chunk
    else:
        # "clarify" and "chat" both handled by chat agent — it naturally asks
        # clarifying questions when the request is vague.
        async for chunk in _chat_agent(message, history, booking_ctx, tool_data, tool_results):
            yield chunk


async def _chat_agent(message: str, history: list[dict], booking_ctx: str, tool_data: str = "", tool_results: list | None = None):
    """Chat agent with a hard anti-fabrication backstop: the whole reply is
    buffered, checked against the real specialist names from tool results,
    and corrected deterministically before anything is streamed."""
    system = prompts.chat_agent_prompt(booking_ctx)
    if tool_data:
        system += "\n\nTOOL DATA for this turn (use it in your reply):\n" + tool_data
    msgs = [{"role": "system", "content": system}]
    msgs.extend(history)
    msgs.append({"role": "user", "content": message})
    parts = []
    async for delta in stream_chat(msgs):
        parts.append(delta)
    reply = "".join(parts).strip()

    violations = _validate_reply(reply, tool_results or [])
    if violations:
        corrected = _deterministic_reply(tool_results or [])
        yield ev_thought(f"Rejected an unverified answer ({', '.join(violations)}) — replaced with real data.")
        for chunk in _chunk_lines(corrected):
            yield ev_token(chunk)
        return
    for chunk in _chunk_lines(reply):
        yield ev_token(chunk)


async def _nearby_listing_agent(tool_results: list):
    """Deterministic, LLM-free listing of nearby specialists.

    Names and distances are built 100% from the list_nearby_specialists tool
    result — nothing is generated by a model, so hallucination is impossible.
    """
    result = None
    for name, res in tool_results:
        if name == "list_nearby_specialists":
            result = res
            break
    if result is None or not result.get("ok"):
        yield ev_token(result.get("summary", "I need your service location to find nearby specialists."))
        return
    by_service = result.get("by_service") or {}
    total = sum(len(v) for v in by_service.values())
    if total == 0:
        yield ev_token(
            "No specialists are available within 5 km of your location right now. "
            "You can check back later or update your service location."
        )
        return
    lines = ["Here are the specialists near you right now:"]
    for service, items in by_service.items():
        for s in items:
            lines.append(f"• {service}: {s['name']} ({s['distance_km']} km away)")
    lines.append("Tap a specialist to book, or say it — e.g. \"Book NEY for plumbing\".")
    for chunk in _chunk_lines("\n".join(lines)):
        yield ev_token(chunk)


_NAME_STOPWORDS = {
    "I", "We", "You", "Your", "Yours", "My", "Me", "He", "She", "It", "They", "Them",
    "Their", "The", "A", "An", "And", "But", "Or", "So", "If", "Because", "When",
    "Where", "While", "Then", "Now", "Here", "There", "This", "That", "These", "Those",
    "Yes", "No", "Hi", "Hey", "Hello", "Thanks", "Thank", "Great", "Sure", "Also",
    "Please", "Book", "Booking", "Need", "Want", "Tell", "Show", "Find", "Search",
    "Looks", "Available", "Verified", "Nearby", "Specialist", "Specialists", "Service",
    "Services", "Plumber", "Plumbers", "Electrician", "Electricians", "Technician",
    "Technicians", "Professional", "Professionals", "Let", "Us", "Get", "Got", "Going",
    "Go", "Come", "Welcome", "Our", "Out", "About", "Into", "From", "For", "With",
    "Will", "Would", "Could", "Should", "Can", "May", "Might", "Must", "Do", "Does",
    "Did", "Have", "Has", "Had", "Am", "Are", "Is", "Was", "Were", "Be", "Been",
    "Being", "Not", "At", "On", "In", "Of", "To", "By", "Up", "Down", "Off", "Over",
    "Under", "Right", "First", "One", "Two", "Three", "Home", "House", "Update",
    "Reviews", "Rating", "Booked", "Booking", "Confirm", "Confirming", "Complete",
    "Completed", "Ready", "Almost", "Few", "Couple", "Minutes", "Hour", "Hours",
    "Today", "Tomorrow", "Day", "Week", "Weekend", "Price", "Prices", "Cost", "Costs",
    "Inr", "Rs", "Km", "Min", "Mins", "Eta", "Just", "Gst", "Ok", "Okay", "Alright",
    "Thank", "Appreciate", "Welcome", "Back", "Anything", "Everything", "Someone",
    "Anybody", "Anywhere", "Everyone", "Anyone", "Customer", "Customers",
}

_STOPWORDS_UPPER = {w.upper() for w in _NAME_STOPWORDS}


_STATUS_WORDS = (
    "accepted", "completed", "upcoming", "started", "reached",
    "cancelled", "rejected", "pending", "awaiting", "in_progress",
)


def _validate_reply(reply: str, tool_results: list) -> list[str]:
    """Global fact-checker. Every ShuroqX fact an LLM puts in a reply must be
    backed by this turn's real tool data. Returns a list of violations; if
    non-empty the reply must NOT be shown — a deterministic one replaces it.

    Checks (category-scoped to tools that actually ran):
      - names            → search/list/bookings specialist names
      - prices (₹/Rs)    → estimate_cost values
      - ETAs ("X min")   → estimate_cost values
      - distances (km)   → search/list distances
      - status words     → my_bookings/booking_status statuses
      - booking numbers  → my_bookings/booking_status booking numbers
    """
    violations = []
    known_names = set(_names_from_tool_results(tool_results))
    for tok in re.findall(r"(?<![A-Z0-9])(?:[A-Z][a-z]{1,19}|[A-Z]{2,6})(?![0-9])", reply):
        if tok.upper() in _STOPWORDS_UPPER or tok in known_names:
            continue
        violations.append(f"name '{tok}'")

    grounded = any(
        name in ("search_specialists", "list_nearby_specialists", "estimate_cost",
                 "my_bookings", "booking_status")
        for name, _ in tool_results
    )
    if not grounded:
        # No real data this turn: any price or distance claim is fabricated by
        # definition — flag it so the honest fallback replaces the reply.
        for m in re.findall(r"(?:₹|Rs\.?|INR|rupees?)\s?([\d,]+)", reply, re.IGNORECASE):
            violations.append(f"unverified price ₹{m}")
        for m in re.findall(r"(\d+(?:\.\d+)?)\s?km\b", reply, re.IGNORECASE):
            violations.append(f"unverified distance {m} km")
        return violations

    for name, res in tool_results:
        if not res.get("ok"):
            continue
        if name == "estimate_cost":
            allowed_prices = {
                res.get("estimated_price"),
                res.get("price_low"),
                res.get("price_high"),
            }
            allowed_prices.discard(None)
            for pat in (
                r"(?:₹|Rs\.?|INR)\s?([\d,]+)",
                r"([\d,]+)\s?(?:rupees|rs\.?|inr)\b",
            ):
                for m in re.findall(pat, reply, re.IGNORECASE):
                    if int(m.replace(",", "")) not in allowed_prices:
                        violations.append(f"price ₹{m}")
            allowed_eta = {
                res.get("eta_minutes"),
                res.get("eta_low"),
                res.get("eta_high"),
            }
            allowed_eta.discard(None)
            for m in re.findall(r"(\d+)\s?(?:min|minutes|mins)\b", reply, re.IGNORECASE):
                if int(m) not in allowed_eta:
                    violations.append(f"ETA {m} min")
        elif name in ("search_specialists", "list_nearby_specialists"):
            dists = set()
            for w in res.get("workers", []) or []:
                if w.get("distanceKm") is not None:
                    dists.add(round(float(w["distanceKm"]), 1))
            for items in (res.get("by_service") or {}).values():
                for s in items:
                    if s.get("distance_km") is not None:
                        dists.add(round(float(s["distance_km"]), 1))
            if dists:
                for m in re.findall(r"(\d+(?:\.\d+)?)\s?km\b", reply, re.IGNORECASE):
                    if round(float(m), 1) not in dists:
                        violations.append(f"distance {m} km")
        elif name in ("my_bookings", "booking_status"):
            statuses = set()
            numbers = set()
            for b in res.get("bookings", []) or []:
                if b.get("status"):
                    statuses.add(str(b["status"]).lower())
                if b.get("booking_number"):
                    numbers.add(str(b["booking_number"]).lstrip("#").upper())
            if res.get("status"):
                statuses.add(str(res["status"]).lower())
            if res.get("booking_number"):
                numbers.add(str(res["booking_number"]).lstrip("#").upper())
            if statuses:
                for m in re.findall(
                    r"\b" + r"|".join(_STATUS_WORDS) + r"\b", reply, re.IGNORECASE
                ):
                    if m.lower() not in statuses:
                        violations.append(f"status '{m}'")
            if numbers:
                for m in re.findall(r"#([A-Z0-9]{3,12})\b", reply, re.IGNORECASE):
                    if m.upper() not in numbers:
                        violations.append(f"booking #{m}")
    return violations


def _deterministic_reply(tool_results: list) -> str:
    """A correct, code-built reply for when the LLM's answer can't be trusted.
    Uses ONLY values the tools returned this turn."""
    parts = []
    for name, res in tool_results:
        if not res.get("ok"):
            continue
        if name in ("search_specialists", "list_nearby_specialists"):
            lines = []
            for w in res.get("workers", []) or []:
                n = w.get("name") or (w.get("email") or "").split("@")[0]
                km = w.get("distanceKm")
                lines.append(f"• {n}{f' ({km} km away)' if km is not None else ''}")
            for service, items in (res.get("by_service") or {}).items():
                for s in items:
                    lines.append(f"• {service}: {s['name']} ({s['distance_km']} km away)")
            if lines:
                parts.append("Here are the verified specialists available:\n" + "\n".join(lines))
        elif name == "estimate_cost":
            parts.append(
                f"The price for {res['intent']} is around ₹{res['estimated_price']}, "
                f"with a specialist usually arriving in about {res['eta_minutes']} min."
            )
        elif name in ("my_bookings", "booking_status"):
            for b in res.get("bookings", []) or []:
                parts.append(
                    f"Booking {b['booking_number']} ({b['service_type']}) is "
                    f"{b['status_human']} — specialist: {b['specialist']}."
                )
            if res.get("booking_number"):
                parts.append(
                    f"Booking {res['booking_number']} ({res['service_type']}) is "
                    f"{res['status_human']} — specialist: {res['specialist']}."
                )
    if not parts:
        return (
            "I want to give you exact information rather than guess — I can tell you real "
            "prices and ETAs, specialists near you, or your booking status. What would you like?"
        )
    return "\n".join(parts)


def _names_from_tool_results(tool_results: list) -> list[str]:
    """Every specialist name that REAL tool data vouches for this turn."""
    names = []
    for name, res in tool_results:
        if name in ("search_specialists", "list_nearby_specialists") and res.get("ok"):
            workers = res.get("workers", []) or []
            for w in workers:
                n = w.get("name") or (w.get("email") or "").split("@")[0]
                if n:
                    names.append(n)
            by_service = res.get("by_service") or {}
            for items in by_service.values():
                for s in items:
                    if s.get("name"):
                        names.append(s["name"])
        if name in ("my_bookings", "booking_status") and res.get("ok"):
            for b in res.get("bookings", []) or []:
                spec = b.get("specialist") or ""
                if isinstance(spec, dict):
                    n = spec.get("name") or (spec.get("email") or "").split("@")[0]
                else:
                    n = spec
                if n and n != "Not yet assigned":
                    names.append(n)
            if res.get("specialist"):
                spec = res["specialist"]
                if isinstance(spec, dict):
                    n = spec.get("name") or (spec.get("email") or "").split("@")[0]
                else:
                    n = spec
                if n and n != "Not yet assigned":
                    names.append(n)
    return names


def _deterministic_listing(tool_results: list) -> str:
    """A correct, code-built specialist listing (names only from tool data)."""
    lines = []
    for name, res in tool_results:
        if name == "search_specialists" and res.get("ok"):
            for w in res.get("workers", []):
                n = w.get("name") or (w.get("email") or "").split("@")[0]
                km = w.get("distanceKm")
                lines.append(f"• {n}{f' ({km} km away)' if km is not None else ''}")
        if name == "list_nearby_specialists" and res.get("ok"):
            for service, items in (res.get("by_service") or {}).items():
                for s in items:
                    lines.append(f"• {service}: {s['name']} ({s['distance_km']} km away)")
    if not lines:
        return ""
    return "Here are the verified specialists available:\n" + "\n".join(lines)


def _chunk_lines(text: str, size: int = 3) -> list[str]:
    """Split reply text into line batches so streaming still looks natural."""
    lines = [l for l in text.splitlines() if l]
    chunks = ["\n".join(lines[i:i + size]) for i in range(0, len(lines), size)] or [text]
    return chunks


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


async def _booking_agent(db, user, message: str, history: list[dict], tool_results: list, tool_data: str = "", location: tuple | None = None):
    """Acknowledge the request and surface verified specialists via a match event."""
    # Prefer a tool result if the supervisor already searched; otherwise search now.
    intent = None
    workers = []
    effective_tool_results = list(tool_results)
    for name, res in effective_tool_results:
        if name == "search_specialists" and res.get("ok"):
            intent = res.get("intent")
            workers = res.get("workers", [])
    if intent is None:
        # Recover intent from the message with a quick classification.
        intent = await _classify_intent(message)
        if intent:
            lat, lon = location if location else (None, None)
            res = await tool_search_specialists(db, intent, lat, lon)
            intent = res.get("intent")
            workers = res.get("workers", [])
            effective_tool_results.append(("search_specialists", res))
            yield ev_tool("search_specialists", {"intent": message}, res.get("summary", ""))

    if not intent:
        # Couldn't map to a service — let the chat agent handle gracefully.
        async for chunk in _chat_agent(message, history, build_booking_context(db, user), tool_data, tool_results):
            yield chunk
        return

    # Stream a short acknowledgement from the booking agent persona, grounded in
    # the cost estimate + specialist data the tools returned. Buffered and
    # validated: the match event below carries the REAL specialist cards.
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
    ack = "".join(ack_parts).strip()

    violations = _validate_reply(ack, effective_tool_results)
    if violations:
        corrected = _deterministic_reply(tool_results)
        yield ev_thought(f"Rejected an unverified answer ({', '.join(violations)}) — replaced with real data.")
        ack = corrected

    for chunk in _chunk_lines(ack):
        yield ev_token(chunk)

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
    parts = []
    async for delta in stream_chat(msgs):
        parts.append(delta)
    reply = "".join(parts).strip()

    violations = _validate_reply(reply, tool_results)
    if violations:
        yield ev_thought(f"Rejected an unverified answer ({', '.join(violations)}) — replaced with real booking data.")
        reply = _deterministic_reply(tool_results)
    for chunk in _chunk_lines(reply):
        yield ev_token(chunk)


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
