import logging
import os
import time
import uuid
from pathlib import Path

import redis
from dotenv import load_dotenv
from redis.exceptions import RedisError


logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    raise RuntimeError("REDIS_URL must be set in backend/.env or the deployment environment")
LOCATION_RATE_LIMIT_WINDOW_SECONDS = 10
LOCATION_RATE_LIMIT_MAX_REQUESTS = 15

_redis_client = None

_SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_seconds = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local member = ARGV[4]
local ttl_seconds = tonumber(ARGV[5])

redis.call("ZREMRANGEBYSCORE", key, "-inf", now - window_seconds)

local current_count = redis.call("ZCARD", key)
if current_count >= max_requests then
    return 0
end

redis.call("ZADD", key, now, member)
redis.call("EXPIRE", key, ttl_seconds)
return 1
"""


def _get_redis_client():
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
    return _redis_client


def is_location_update_allowed(specialist_id: str, booking_id: str) -> bool:
    key = f"location_rate_limit:{specialist_id}:{booking_id}"
    now = time.time()
    member = f"{now}:{uuid.uuid4().hex}"

    try:
        allowed = _get_redis_client().eval(
            _SLIDING_WINDOW_SCRIPT,
            1,
            key,
            now,
            LOCATION_RATE_LIMIT_WINDOW_SECONDS,
            LOCATION_RATE_LIMIT_MAX_REQUESTS,
            member,
            LOCATION_RATE_LIMIT_WINDOW_SECONDS,
        )
        return bool(allowed)
    except RedisError:
        logger.exception("Redis location rate limiter unavailable; allowing request")
        return True
