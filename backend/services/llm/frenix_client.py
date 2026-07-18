"""
services/llm/frenix_client.py
──────────────────────────────
Async client for Google Gemini (Generative Language API).

This module is kept intentionally small and provider-shaped so the rest of the
assistant pipeline (catalog.py, assistant.py) is unchanged:

  * chat(...)          → single non-streaming completion (used for the structured
                         booking-intent check after the conversation).
  * stream_chat(...)   → async generator yielding text deltas (used by /assistant/chat).
  * LLMUnavailable     → raised on network/timeout/5xx so callers can fall back.

The public interface (`chat`, `stream_chat`, `LLMUnavailable`) and the
OpenAI-style ``messages: list[{role, content}]`` contract are byte-for-byte
compatible with the previous Frenix client, so swapping providers did not
require touching the assistant router or catalog.

Gemini specifics:
  * Text lives in ``candidates[].content.parts[].text``. We skip ``thought``
    parts (the model's internal reasoning) and only stream/return real text.
  * Roles map OpenAI <-> Gemini: system -> prepended to the first user turn
    (Gemini has no standalone system role in the simple generateContent API),
    user/assistant -> user/model.
"""

from __future__ import annotations

import os
import json
import asyncio
from typing import AsyncIterator, Iterable, Optional

import httpx

GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
).rstrip("/")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

DEFAULT_TIMEOUT = float(os.getenv("GEMINI_TIMEOUT", "30"))
DEFAULT_TEMPERATURE = 0.2
MAX_RETRIES = 3
RETRY_BACKOFF_S = 1.5


class LLMUnavailable(Exception):
    """Raised when the Gemini API cannot fulfil the request (network/timeout/5xx)."""


# ── message conversion (OpenAI style -> Gemini contents) ──────────────────────
def _to_gemini_contents(messages: Iterable[dict]) -> list[dict]:
    """Convert OpenAI-style [{role, content}] into Gemini `contents`.

    Gemini has no separate system role, so a leading system message is merged
    into the first user turn as an instruction block.
    """
    out: list[dict] = []
    system_text: Optional[str] = None
    for msg in messages:
        role = msg.get("role")
        content = msg.get("content") or ""
        if role == "system":
            system_text = content
            continue
        gemini_role = "model" if role == "assistant" else "user"
        out.append({"role": gemini_role, "parts": [{"text": content}]})

    if system_text and out:
        first = out[0]
        first["parts"] = [{"text": f"{system_text}\n\n---\n\n{first['parts'][0]['text']}"}] + first["parts"][1:]
    return out


def _extract_text(payload: dict, *, allow_thought: bool = True) -> str:
    """Pull concatenated text from a Gemini response payload.

    We prefer real (non-thought) text. Some models, however, mark their entire
    output as ``thought`` (e.g. gemma reasoning models emit the answer inside
    thought parts). In that case we fall back to the thought text so a
    non-streaming call still gets a reply.

    For STREAMING we pass ``allow_thought=False`` and only yield the real answer
    chunk (which arrives as a separate non-thought part), so the user never sees
    the model's internal reasoning trace.
    """
    real = ""
    thought = ""
    try:
        for part in payload["candidates"][0]["content"]["parts"]:
            if not isinstance(part, dict):
                continue
            t = part.get("text")
            if not t:
                continue
            if part.get("thought"):
                thought += t
            else:
                real += t
    except (KeyError, IndexError, TypeError):
        return ""
    if real:
        return real
    return thought if allow_thought else ""


def _headers() -> dict:
    return {"Content-Type": "application/json"}


def _url(method: str, *, stream: bool) -> str:
    base = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:{method}"
    key = GEMINI_API_KEY
    if stream:
        # SSE streaming variant.
        return f"{base}?alt=sse&key={key}"
    return f"{base}?key={key}"


def _payload(messages: Iterable[dict], *, stream: bool, temperature: float) -> dict:
    contents = _to_gemini_contents(messages)
    payload: dict = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
        },
    }
    # Streaming is controlled by the `alt=sse` query param on the
    # streamGenerateContent endpoint, not by a generationConfig field. Some
    # models (e.g. gemma) reject an unknown `streaming` field, so we never send it.
    return payload


async def chat(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    """Non-streaming completion. Returns the assistant text. Raises LLMUnavailable on failure."""
    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    _url("generateContent", stream=False),
                    headers=_headers(),
                    json=_payload(messages, stream=False, temperature=temperature),
                )
                if resp.status_code >= 500:
                    last_err = RuntimeError(f"Gemini 5xx: {resp.status_code}")
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                    continue
                if resp.status_code >= 400:
                    raise LLMUnavailable(f"Gemini {resp.status_code}: {resp.text[:200]}")
                return _extract_text(resp.json(), allow_thought=True)
        except LLMUnavailable:
            raise
        except Exception as exc:  # network errors, timeouts, JSON decode, etc.
            last_err = exc
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
    raise LLMUnavailable(f"Gemini unavailable: {last_err}")


async def stream_chat(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> AsyncIterator[str]:
    """Yield text deltas as they arrive. Raises LLMUnavailable if the stream never opens."""
    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        opened = False
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    _url("streamGenerateContent", stream=True),
                    headers=_headers(),
                    json=_payload(messages, stream=True, temperature=temperature),
                ) as resp:
                    if resp.status_code >= 400:
                        if resp.status_code >= 500 and attempt < MAX_RETRIES:
                            last_err = RuntimeError(f"Gemini 5xx: {resp.status_code}")
                            await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                            continue
                        raise LLMUnavailable(f"Gemini {resp.status_code}: {await resp.aread()}")
                    opened = True
                    async for line in resp.aiter_lines():
                        line = (line or "").strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:") :].strip()
                        if data_str == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        text = _extract_text(chunk, allow_thought=False)
                        if text:
                            yield text
            return
        except LLMUnavailable:
            raise
        except Exception as exc:
            if not opened:
                last_err = exc
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                    continue
                raise LLMUnavailable(f"Gemini stream failed: {exc}")
            # Stream already opened; surface whatever we got and stop gracefully.
            return
