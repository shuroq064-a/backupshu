"""
In-memory sliding-window rate limiter for FastAPI.

Usage (inside function body):
    from services.rate_limiter import rate_limit

    @router.post("/users/login")
    def login(request: Request, ...):
        rate_limit(request, "login", max_requests=5, window_seconds=60)
        ...

No external dependencies — uses a dict + deque with automatic cleanup.
"""

import time
from collections import defaultdict, deque
from fastapi import Request, HTTPException, status

# {key: deque of timestamps}
_buckets: dict[str, deque[float]] = defaultdict(deque)

# Cleanup interval: purge buckets older than this many seconds
_MAX_AGE = 600  # 10 minutes


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
    """Extract client IP from request, preferring X-Forwarded-For."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


def rate_limit(
    request: Request,
    scope: str,
    max_requests: int = 5,
    window_seconds: int = 60,
):
    """Enforce a sliding-window rate limit.

    Args:
        request: The incoming FastAPI request (used to extract client IP).
        scope: A string label for this rate-limit bucket (e.g. "login", "register").
        max_requests: Maximum number of requests allowed within the window.
        window_seconds: The sliding window duration in seconds.

    Raises:
        HTTPException 429 if the limit is exceeded.
    """
    client_ip = _get_client_ip(request)
    key = f"{scope}:{client_ip}"

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
