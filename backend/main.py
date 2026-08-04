import os
import logging
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from sqlalchemy import text

load_dotenv(Path(__file__).resolve().parent / ".env")

import dbmodels
from database import engine

logger = logging.getLogger(__name__)

dbmodels.Base.metadata.create_all(bind=engine)

# Ensure token_version column exists (added after initial table creation)
try:
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0"
        ))
        conn.commit()
except Exception:
    logger.warning("Could not add token_version column — it may already exist")


if __package__:
    from .routers import unified_auth, admin, workers, users, bookings, userinput, intent, marketplace, services, location_permission, assistant, messages, ai_chat, payments
else:
    from routers import unified_auth, admin, workers, users, bookings, userinput, intent, marketplace, services, location_permission, assistant, messages, ai_chat, payments

app = FastAPI(title="ShuroqX API", version="1.0.0")


def get_cors_origins() -> list[str]:
    raw_origins = os.getenv("CORS_ORIGINS", "")
    if not raw_origins.strip():
        logger.warning("CORS_ORIGINS is empty — all cross-origin requests will be rejected")
        return []
    return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]


def is_origin_allowed(origin: str, allowed: list[str]) -> bool:
    """Check if origin matches the allowlist. Supports wildcard subdomains like *.example.com."""
    if not origin or not allowed:
        return False
    try:
        parsed = urlparse(origin)
        origin_host = parsed.hostname or ""
    except Exception:
        return False

    for allowed_origin in allowed:
        if allowed_origin == "*":
            return True
        try:
            allowed_parsed = urlparse(allowed_origin)
            allowed_host = allowed_parsed.hostname or ""
        except Exception:
            continue
        # Exact match
        if origin_host == allowed_host:
            return True
        # Wildcard subdomain: *.example.com matches foo.example.com
        if allowed_host.startswith("*.") and origin_host.endswith(allowed_host[1:]):
            return True
    return False


@app.middleware("http")
async def cors_middleware(request: Request, call_next):
    """CORS middleware with explicit origin allowlist.

    Never reflects arbitrary origins. Only responds with an origin that
    is in the configured allowlist. WebSocket upgrades pass through
    without CORS headers (browsers don't enforce CORS on WS).
    """
    origin = request.headers.get("origin")

    if request.scope.get("type") == "websocket":
        return await call_next(request)

    if request.method == "OPTIONS":
        response = Response(status_code=204)
    else:
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.exception("Unhandled exception in route handler")
            response = Response(status_code=500, content="Internal Server Error")

    if origin and is_origin_allowed(origin, get_cors_origins()):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"

    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
    response.headers["Vary"] = "Origin"
    return response

@app.get("/")
def greet():
    return {"message": "ShuroqX backend running successfully"}


# Register all routers
app.include_router(unified_auth.router)   # /users/register, /login, /oauth-login, /switch-to-specialist
app.include_router(users.router)          # /users/me, /users/change-password
app.include_router(workers.router)        # /workers/*
app.include_router(admin.router)          # /admin/*
app.include_router(bookings.router) 
app.include_router(userinput.router)      # /users/{id}/bookings, /bookings/{id}
app.include_router(intent.router)
app.include_router(marketplace.router)
app.include_router(services.router)
app.include_router(location_permission.router)  # /location-permission/*
app.include_router(assistant.router)            # /assistant/chat (LLM chat brain)
app.include_router(messages.router)             # /messages (specialist <-> client chat)
app.include_router(ai_chat.router)              # /ai-chat (AI chat session history)
app.include_router(payments.router)            # /payments (Razorpay integration)


# ── Startup: restart OTP refresh loops for active reached bookings ───────────
@app.on_event("startup")
async def _restart_otp_refresh_loops():
    """On server restart, find all bookings still in 'reached' status and
    restart their OTP refresh background tasks so the client keeps getting
    fresh OTPs every 3 minutes."""
    from routers.bookings import _start_otp_refresh, OTP_TTL_SECONDS
    from dbmodels import Booking
    from database import SessionLocal
    from datetime import datetime, timedelta
    import random, string

    db = SessionLocal()
    try:
        bookings = db.query(Booking).filter(Booking.status == "reached").all()
        for b in bookings:
            # Refresh OTP if expired
            if not b.otp_code or (b.otp_expires_at and b.otp_expires_at < datetime.utcnow()):
                b.otp_code = ''.join(random.choices(string.digits, k=4))
                b.otp_expires_at = datetime.utcnow() + timedelta(seconds=OTP_TTL_SECONDS)
            db.commit()
            _start_otp_refresh(b.id)
    except Exception:
        pass
    finally:
        db.close()
