"""
services/llm/model_client.py
──────────────────────────────
Multi-provider async LLM client: Mistral (primary) + Gemini (fallback).

Public interface:
  * chat(...)          -> single non-streaming completion.
  * stream_chat(...)   -> async generator yielding text deltas.
  * LLMUnavailable     -> raised when ALL providers fail.
"""

from __future__ import annotations

import os
import json
import asyncio
from typing import AsyncIterator, Iterable, Optional

import httpx

# ── Mistral (primary) ────────────────────────────────────────────────────────
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
MISTRAL_BASE_URL = os.getenv("MISTRAL_BASE_URL", "https://api.mistral.ai/v1").rstrip("/")
MISTRAL_MODEL = os.getenv("MISTRAL_MODEL", "mistral-medium-3-5")

# ── Gemini (fallback) ────────────────────────────────────────────────────────
GEMINI_BASE_URL = os.getenv(
    "GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
).rstrip("/")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemma-4-31b-it")

DEFAULT_TIMEOUT = float(os.getenv("LLM_TIMEOUT", "15"))
DEFAULT_TEMPERATURE = 0.2
MAX_RETRIES = 2
RETRY_BACKOFF_S = 1.0
MAX_OUTPUT_TOKENS = 20000


class LLMUnavailable(Exception):
    """Raised when ALL LLM providers fail."""


# ── Gemini helpers ────────────────────────────────────────────────────────────
def _to_gemini_contents(messages: Iterable[dict]) -> list[dict]:
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


def _extract_gemini_text(payload: dict, *, allow_thought: bool = True) -> str:
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
    return real if real else (thought if allow_thought else "")


_SAFETY_SETTINGS = [
    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
]


def _gemini_payload(messages: Iterable[dict], *, stream: bool, temperature: float) -> dict:
    return {
        "contents": _to_gemini_contents(messages),
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": MAX_OUTPUT_TOKENS,
        },
        "safetySettings": _SAFETY_SETTINGS,
    }


def _gemini_url(method: str, *, stream: bool) -> str:
    base = f"{GEMINI_BASE_URL}/models/{GEMINI_MODEL}:{method}"
    if stream:
        return f"{base}?alt=sse&key={GEMINI_API_KEY}"
    return f"{base}?key={GEMINI_API_KEY}"


# ── Mistral (OpenAI-compatible) helpers ───────────────────────────────────────
def _mistral_headers() -> dict:
    return {
        "Authorization": f"Bearer {MISTRAL_API_KEY}",
        "Content-Type": "application/json",
    }


def _mistral_payload(messages: Iterable[dict], *, stream: bool, temperature: float) -> dict:
    return {
        "model": MISTRAL_MODEL,
        "messages": list(messages),
        "temperature": temperature,
        "max_tokens": MAX_OUTPUT_TOKENS,
        "stream": stream,
    }


def _mistral_url(*, stream: bool) -> str:
    return f"{MISTRAL_BASE_URL}/chat/completions"


def _extract_mistral_text(payload: dict) -> str:
    try:
        return payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return ""


# ═════════════════════════════════════════════════════════════════════════════
# PUBLIC API
# ═════════════════════════════════════════════════════════════════════════════

async def _mistral_chat(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    """Mistral non-streaming completion."""
    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    _mistral_url(stream=False),
                    headers=_mistral_headers(),
                    json=_mistral_payload(messages, stream=False, temperature=temperature),
                )
                if resp.status_code >= 500:
                    last_err = RuntimeError(f"Mistral {resp.status_code}")
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                        continue
                    raise LLMUnavailable(f"Mistral {resp.status_code}")
                if resp.status_code >= 400:
                    raise LLMUnavailable(f"Mistral {resp.status_code}: {resp.text[:200]}")
                return _extract_mistral_text(resp.json())
        except LLMUnavailable:
            raise
        except Exception as exc:
            last_err = exc
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                continue
            raise LLMUnavailable(f"Mistral unavailable: {last_err}")
    raise LLMUnavailable(f"Mistral unavailable: {last_err}")


async def _mistral_stream(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> AsyncIterator[str]:
    """Mistral streaming completion (OpenAI SSE format)."""
    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        opened = False
        yielded = False
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    _mistral_url(stream=True),
                    headers=_mistral_headers(),
                    json=_mistral_payload(messages, stream=True, temperature=temperature),
                ) as resp:
                    if resp.status_code >= 400:
                        if resp.status_code >= 500 and attempt < MAX_RETRIES:
                            last_err = RuntimeError(f"Mistral {resp.status_code}")
                            await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                            continue
                        raise LLMUnavailable(f"Mistral {resp.status_code}: {await resp.aread()}")
                    opened = True
                    async for line in resp.aiter_lines():
                        line = (line or "").strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if data_str == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        text = delta.get("content", "")
                        if text:
                            yielded = True
                            yield text
            if opened and not yielded and attempt < MAX_RETRIES:
                last_err = RuntimeError("Mistral stream closed with no tokens")
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                continue
            return
        except LLMUnavailable:
            raise
        except Exception as exc:
            if not opened:
                last_err = exc
                if attempt < MAX_RETRIES:
                    await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                    continue
                raise LLMUnavailable(f"Mistral stream failed: {exc}")
            if not yielded and attempt < MAX_RETRIES:
                last_err = exc
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                continue
            return


async def _gemini_chat(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    """Gemini non-streaming completion (fallback)."""
    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    _gemini_url("generateContent", stream=False),
                    headers={"Content-Type": "application/json"},
                    json=_gemini_payload(messages, stream=False, temperature=temperature),
                )
                if resp.status_code >= 500:
                    last_err = RuntimeError(f"Gemini {resp.status_code}")
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                        continue
                    raise LLMUnavailable(f"Gemini {resp.status_code}")
                if resp.status_code >= 400:
                    raise LLMUnavailable(f"Gemini {resp.status_code}: {resp.text[:200]}")
                return _extract_gemini_text(resp.json(), allow_thought=True)
        except LLMUnavailable:
            raise
        except Exception as exc:
            last_err = exc
            if attempt < MAX_RETRIES:
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                continue
            raise LLMUnavailable(f"Gemini unavailable: {last_err}")
    raise LLMUnavailable(f"Gemini unavailable: {last_err}")


async def _gemini_stream(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> AsyncIterator[str]:
    """Gemini streaming completion (fallback)."""
    last_err: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        opened = False
        yielded = False
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                async with client.stream(
                    "POST",
                    _gemini_url("streamGenerateContent", stream=True),
                    headers={"Content-Type": "application/json"},
                    json=_gemini_payload(messages, stream=True, temperature=temperature),
                ) as resp:
                    if resp.status_code >= 400:
                        if resp.status_code >= 500 and attempt < MAX_RETRIES:
                            last_err = RuntimeError(f"Gemini {resp.status_code}")
                            await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                            continue
                        raise LLMUnavailable(f"Gemini {resp.status_code}: {await resp.aread()}")
                    opened = True
                    async for line in resp.aiter_lines():
                        line = (line or "").strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[len("data:"):].strip()
                        if data_str == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        text = _extract_gemini_text(chunk, allow_thought=False)
                        if text:
                            yielded = True
                            yield text
            if opened and not yielded and attempt < MAX_RETRIES:
                last_err = RuntimeError("Gemini stream closed with no tokens")
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                continue
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
            if not yielded and attempt < MAX_RETRIES:
                last_err = exc
                await asyncio.sleep(RETRY_BACKOFF_S * (attempt + 1))
                continue
            return


# ═════════════════════════════════════════════════════════════════════════════
# PUBLIC INTERFACE — Mistral primary, Gemini fallback
# ═════════════════════════════════════════════════════════════════════════════

async def chat(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> str:
    """Non-streaming completion. Tries Mistral first, falls back to Gemini."""
    try:
        return await _mistral_chat(messages, temperature=temperature, timeout=timeout)
    except LLMUnavailable:
        pass
    return await _gemini_chat(messages, temperature=temperature, timeout=timeout)


async def stream_chat(
    messages: Iterable[dict],
    *,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout: float = DEFAULT_TIMEOUT,
) -> AsyncIterator[str]:
    """Streaming completion. Tries Mistral first, falls back to Gemini."""
    try:
        async for chunk in _mistral_stream(messages, temperature=temperature, timeout=timeout):
            yield chunk
        return
    except LLMUnavailable:
        pass
    async for chunk in _gemini_stream(messages, temperature=temperature, timeout=timeout):
        yield chunk
