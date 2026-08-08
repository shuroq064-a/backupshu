"""
services/email_service.py
─────────────────────────
Minimal SMTP email sender for transactional emails (OTP verification, etc.).

Configuration (env vars, all optional — see .env.example):
    SMTP_HOST      e.g. smtp.gmail.com
    SMTP_PORT      default 587
    SMTP_USER      the sender account (e.g. support@shuroqx.com)
    SMTP_PASS      app password
    SMTP_FROM      fallback = SMTP_USER
    SMTP_USE_TLS   "1" (default) or "0"

If SMTP is not configured, `is_email_configured()` returns False and callers
must decide how to behave (see routers/users.py delete-verification flow).
"""

from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def is_email_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and os.getenv("SMTP_USER") and os.getenv("SMTP_PASS"))


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email via SMTP. Returns True on success, False otherwise."""
    host = os.getenv("SMTP_HOST", "")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    sender = os.getenv("SMTP_FROM", user) or user
    use_tls = os.getenv("SMTP_USE_TLS", "1") == "1"

    if not (host and user and password):
        logger.warning("SMTP not configured — cannot send email to %s", to)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    msg.set_content("Please view this email in an HTML-capable client.")
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(host, port, timeout=15) as server:
            server.ehlo()
            if use_tls:
                server.starttls()
                server.ehlo()
            server.login(user, password)
            server.send_message(msg)
        logger.info("Email sent to %s (subject: %s)", to, subject)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False
