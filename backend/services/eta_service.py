from __future__ import annotations

import logging
import time

from .geo_utils import calculate_distance
from .ola_maps.distance_matrix_service import get_distance_matrix
from .ola_maps.eta_service import OlaMapsServiceError, get_eta_minutes as get_ola_eta_details


logger = logging.getLogger(__name__)


class EtaServiceError(RuntimeError):
    """Raised when ETA calculation cannot be completed."""


# Distance fallback for when the Ola Maps provider is unavailable: average city
# driving speed in km/h and a floor so we never claim a 1-minute arrival.
_CITY_AVG_SPEED_KMH = 20.0
_MIN_ETA_MINUTES = 5

# Short-lived in-memory cache so repeated searches for the same customer/worker
# pair don't fire an Ola Maps billable call every time. Bounded to prevent
# unbounded memory growth.
_ETA_CACHE_TTL_SECONDS = 300
_ETA_CACHE_MAX_ENTRIES = 512
_ETA_CACHE: dict[tuple, tuple[int, float]] = {}


def _valid_coords(lat: float, lng: float) -> bool:
    """Validate latitude/longitude ranges before hitting external services."""
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError):
        return False
    return -90 <= lat_f <= 90 and -180 <= lng_f <= 180


def _estimate_from_distance(distance_km: float) -> int:
    """Distance-based ETA fallback: travel time at average city speed."""
    return max(_MIN_ETA_MINUTES, int(round(distance_km / _CITY_AVG_SPEED_KMH * 60)))


def _trim_cache(now: float) -> None:
    """Drop expired entries; if still over budget, evict oldest-inserted first."""
    expired = [key for key, (_, expires_at) in _ETA_CACHE.items() if expires_at <= now]
    for key in expired:
        _ETA_CACHE.pop(key, None)
    while len(_ETA_CACHE) > _ETA_CACHE_MAX_ENTRIES:
        oldest_key = next(iter(_ETA_CACHE))
        _ETA_CACHE.pop(oldest_key, None)


def compute_worker_etas(
    customer_lat: float,
    customer_lng: float,
    workers: list[tuple[str, float, float]],
) -> dict[str, int]:
    """Return driving ETA (minutes) from the customer to each specialist.

    `workers` is a list of (worker_id, latitude, longitude) tuples. One Ola Maps
    distance-matrix call covers the nearest 10 specialists; anything beyond that
    (or any provider failure) falls back to a distance-based estimate, so the
    assistant and marketplace ALWAYS get a sane, per-specialist ETA. Workers
    without valid coordinates are skipped (we never guess).
    """
    if not workers or not _valid_coords(customer_lat, customer_lng):
        return {}

    valid: list[tuple[str, float, float]] = []
    for worker_id, lat, lng in workers:
        if _valid_coords(lat, lng):
            valid.append((worker_id, lat, lng))
    if not valid:
        return {}

    now = time.time()
    results: dict[str, int] = {}
    uncached: list[tuple[str, float, float]] = []

    for worker_id, lat, lng in valid:
        key = (worker_id, round(customer_lat, 3), round(customer_lng, 3))
        hit = _ETA_CACHE.get(key)
        if hit is not None and hit[1] > now:
            results[worker_id] = hit[0]
        else:
            uncached.append((worker_id, lat, lng))

    if uncached:
        # Nearest-first, capped so a single distance-matrix call stays small.
        uncached.sort(
            key=lambda w: calculate_distance(customer_lat, customer_lng, w[1], w[2])
        )
        batch = uncached[:10]
        pending = {worker_id: _estimate_from_distance(
            calculate_distance(customer_lat, customer_lng, lat, lng)
        ) for worker_id, lat, lng in batch}
        try:
            matrix = get_distance_matrix(
                [(customer_lat, customer_lng)],
                [(lat, lng) for _, lat, lng in batch],
            )
            for (worker_id, _, _), row in zip(batch, matrix):
                pending[worker_id] = row["eta_minutes"]
        except Exception as exc:
            # Best-effort ETA: NEVER let the provider failure propagate — the
            # marketplace search and the assistant tool must not fail because a
            # third-party ETA lookup hiccuped. Distance fallback covers everyone.
            logger.warning(
                "Ola Maps distance matrix unavailable; using distance-based ETA fallback",
                extra={"worker_count": len(batch), "error": type(exc).__name__},
            )
        for worker_id, lat, lng in batch:
            eta = pending[worker_id]
            results[worker_id] = eta
            _ETA_CACHE[(worker_id, round(customer_lat, 3), round(customer_lng, 3))] = (
                eta,
                now + _ETA_CACHE_TTL_SECONDS,
            )
        # Workers beyond the matrix cap still get a distance-based estimate so no
        # in-range specialist is ever returned without an ETA.
        for worker_id, lat, lng in uncached[len(batch):]:
            eta = _estimate_from_distance(
                calculate_distance(customer_lat, customer_lng, lat, lng)
            )
            results[worker_id] = eta
            _ETA_CACHE[(worker_id, round(customer_lat, 3), round(customer_lng, 3))] = (
                eta,
                now + _ETA_CACHE_TTL_SECONDS,
            )
        _trim_cache(now)

    return results


def get_eta_minutes(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
) -> int:
    """Return rounded driving ETA minutes from Ola Maps Directions API."""
    try:
        eta_details = get_ola_eta_details(
            origin_lat=origin_lat,
            origin_lng=origin_lng,
            destination_lat=destination_lat,
            destination_lng=destination_lng,
        )
        eta_minutes = eta_details["eta_minutes"]
        if not isinstance(eta_minutes, int):
            raise EtaServiceError("Ola Maps ETA response did not include integer minutes")

        logger.info(
            "ETA minutes calculated",
            extra={
                "eta_minutes": eta_minutes,
                "duration_seconds": eta_details.get("duration_seconds"),
                "distance_meters": eta_details.get("distance_meters"),
            },
        )
        return eta_minutes
    except OlaMapsServiceError as exc:
        logger.exception("Ola Maps ETA calculation failed")
        raise EtaServiceError("Unable to calculate ETA with Ola Maps") from exc
    except (KeyError, TypeError, ValueError) as exc:
        logger.exception("Ola Maps ETA response was unusable")
        raise EtaServiceError("Ola Maps ETA response was unusable") from exc
