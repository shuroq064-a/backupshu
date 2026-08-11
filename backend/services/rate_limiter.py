"""
In-memory sliding-window rate limiter for FastAPI.

Usage (inside function body):
    from services.rate_limiter import rate_limit

    @router.post("/users/login")
    def login(request: Request, ...):
        rate_limit(request, "login", max_requests=5, window_seconds=60)
        rate_limit(request, "login-account", key_extra=email, max_requests=10,
                   window_seconds=900)
        ...

No external dependencies — uses a dict + deque with automatic cleanup.

Security notes (please keep this way):
  * Forwarded headers (X-Forwarded-For / X-Real-IP) are ONLY trusted when the
    direct peer is one of the configured TRUSTED_PROXY_IPS. Otherwise an
    attacker could rotate a spoofed X-Forwarded-For header and bypass the limiter.
  * key_extra lets you scope a bucket per account (email/user id) — pair it with
    the IP bucket so brute-force tools are slowed both per-source and per-target.
"""

import os
import time
from collections import defaultdict, deque
from fastapi import Request, HTTPException, status

# {key: deque of timestamps}
_buckets: dict[str, deque[float]] = defaultdict(deque)

# Cleanup interval: purge buckets older than this many seconds
_MAX_AGE = 600  # 10 minutes

# Proxies we trust to supply X-Forwarded-For (comma-separated IPs). Empty = no
# proxy trust: the socket peer address is used and never spoofable.
_TRUSTED_PROXY_IPS = {
    ip.strip()
    for ip in os.getenv("TRUSTED_PROXY_IPS", "").split(",")
    if ip.strip()
}


def _cleanup():
    """Remove stale entries to prevent memory leaks."""
    now = time.monotonic()
    stale_keys = [
        k for k, v in _buckets.items()
        if not v or v[-1] < now - _MAX_AGE
    ]
    for k in stale_keys:
        del _buckets[k]


def _get_client_ip(request: Request) -> str:
    """Client IP, resistant to spoofed forwarding headers.

    X-Forwarded-For / X-Real-IP are honoured only when the DIRECT peer (the
    socket address or the last hop we connected to) is a trusted proxy.
    """
    direct_peer = request.client.host if request.client else "unknown"

    if _TRUSTED_PROXY_IPS and (direct_peer in _TRUSTED_PROXY_IPS or direct_peer == "unknown"):
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip.strip()

    return direct_peer


def rate_limit(
    request: Request,
    scope: str,
    max_requests: int = 5,
    window_seconds: int = 60,
    key_extra: str = "",
):
    """Enforce a sliding-window rate limit.

    Args:
        request: The incoming FastAPI request (used to extract client IP).
        scope: A string label for this rate-limit bucket (e.g. "login", "register").
        max_requests: Maximum number of requests allowed within the window.
        window_seconds: The sliding window duration in seconds.
        key_extra: An optional per-account discriminator (email, user id, ...) so
            the limit also applies per target, not just per IP. Normalised lower.

    Raises:
        HTTPException 429 if the limit is exceeded.
    """
    client_ip = _get_client_ip(request)
    key = f"{scope}:{client_ip}"
    if key_extra:
        key = f"{key}:{key_extra.strip().lower()}"

    now = time.monotonic()
    bucket = _buckets[key]

    # Evict timestamps outside the window
    while bucket and bucket[0] < now - window_seconds:
        bucket.popleft()

    if len(bucket) >= max_requests:
        retry_after = int(window_seconds - (now - bucket[0]))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many requests. Try again in {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )

    bucket.append(now)

    # Periodic cleanup (amortized)
    if len(_buckets) > 1000:
        _cleanup()
