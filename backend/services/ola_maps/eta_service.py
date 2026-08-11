from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from dotenv import load_dotenv


logger = logging.getLogger(__name__)

_BACKEND_DIR = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND_DIR / ".env")

_OLA_MAPS_BASE_URL = "https://api.olamaps.io"
_REQUEST_TIMEOUT_SECONDS = 10


class OlaMapsServiceError(RuntimeError):
    """Raised when an Ola Maps service call fails or returns unusable data."""


def _get_api_key() -> str:
    api_key = os.getenv("OLA_MAPS_API_KEY")
    if not api_key:
        raise OlaMapsServiceError("OLA_MAPS_API_KEY must be set in backend/.env")
    return api_key


def _call_ola_maps(
    method: str,
    path: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    request_id = str(uuid.uuid4())
    query_params = {**params, "api_key": _get_api_key()}
    url = f"{_OLA_MAPS_BASE_URL}{path}?{urlencode(query_params)}"
    request = Request(
        url,
        method=method,
        headers={
            "accept": "application/json",
            "x-request-id": request_id,
            "x-correlation-id": request_id,
        },
    )

    logger.info(
        "Calling Ola Maps API",
        extra={"method": method, "path": path, "request_id": request_id},
    )

    try:
        with urlopen(request, timeout=_REQUEST_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8")
    except HTTPError as exc:
        logger.warning(
            "Ola Maps API returned an error",
            extra={
                "method": method,
                "path": path,
                "request_id": request_id,
                "status_code": exc.code,
            },
        )
        raise OlaMapsServiceError(
            f"Ola Maps API request failed with status {exc.code}"
        ) from exc
    except (TimeoutError, URLError, OSError) as exc:
        logger.exception(
            "Ola Maps API request failed",
            extra={"method": method, "path": path, "request_id": request_id},
        )
        raise OlaMapsServiceError("Unable to reach Ola Maps API") from exc

    try:
        data = json.loads(body) if body else {}
    except json.JSONDecodeError as exc:
        logger.exception(
            "Ola Maps API returned invalid JSON",
            extra={"method": method, "path": path, "request_id": request_id},
        )
        raise OlaMapsServiceError("Ola Maps API returned invalid JSON") from exc

    if not isinstance(data, dict):
        raise OlaMapsServiceError("Ola Maps API returned an unexpected response")

    return data


def _number_from(value: Any, field_name: str) -> int:
    if isinstance(value, dict):
        value = value.get("value")

    if isinstance(value, (int, float)):
        return int(round(value))

    raise OlaMapsServiceError(f"Ola Maps response missing numeric {field_name}")


def _eta_minutes(duration_seconds: int) -> int:
    return int((duration_seconds + 30) // 60)


def _extract_route_totals(data: dict[str, Any]) -> tuple[int, int]:
    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        raise OlaMapsServiceError("Ola Maps response did not include routes")

    first_route = routes[0]
    if not isinstance(first_route, dict):
        raise OlaMapsServiceError("Ola Maps route response was malformed")

    legs = first_route.get("legs")
    if not isinstance(legs, list) or not legs:
        raise OlaMapsServiceError("Ola Maps route response did not include legs")

    distance_meters = 0
    duration_seconds = 0
    for leg in legs:
        if not isinstance(leg, dict):
            raise OlaMapsServiceError("Ola Maps route leg response was malformed")
        distance_meters += _number_from(leg.get("distance"), "distance")
        duration_seconds += _number_from(leg.get("duration"), "duration")

    return distance_meters, duration_seconds


def get_eta_minutes(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
) -> dict[str, int]:
    """Return route distance, duration, and rounded ETA between two coordinates."""
    data = _call_ola_maps(
        "POST",
        "/routing/v1/directions",
        {
            "origin": f"{origin_lat},{origin_lng}",
            "destination": f"{destination_lat},{destination_lng}",
            "mode": "driving",
            "alternatives": "false",
            "steps": "false",
            "overview": "false",
            "language": "en",
            "traffic_metadata": "false",
            "route_preference": "fastest",
        },
    )

    distance_meters, duration_seconds = _extract_route_totals(data)
    result = {
        "distance_meters": distance_meters,
        "duration_seconds": duration_seconds,
        "eta_minutes": _eta_minutes(duration_seconds),
    }

    logger.info(
        "Ola Maps ETA calculated",
        extra={
            "distance_meters": distance_meters,
            "duration_seconds": duration_seconds,
            "eta_minutes": result["eta_minutes"],
        },
    )
    return result


def decode_polyline(polyline: str) -> list[tuple[float, float]]:
    """Decode a Google-encoded polyline into [(lat, lng), ...] pairs."""
    coords: list[tuple[float, float]] = []
    index = 0
    lat = 0
    lng = 0

    while index < len(polyline):
        result = 0
        shift = 0
        while True:
            byte_value = ord(polyline[index]) - 63
            index += 1
            result |= (byte_value & 0x1F) << shift
            shift += 5
            if byte_value < 0x20:
                break
        dlat = ~(result >> 1) if result & 1 else result >> 1
        lat += dlat

        result = 0
        shift = 0
        while True:
            byte_value = ord(polyline[index]) - 63
            index += 1
            result |= (byte_value & 0x1F) << shift
            shift += 5
            if byte_value < 0x20:
                break
        dlng = ~(result >> 1) if result & 1 else result >> 1
        lng += dlng

        coords.append((lat / 1e5, lng / 1e5))

    return coords


def get_route_polyline(
    origin_lat: float,
    origin_lng: float,
    destination_lat: float,
    destination_lng: float,
) -> dict[str, Any]:
    """Return a driving route polyline (lat/lng pairs) plus totals between two points.

    Used by the live tracking map — replaces the unreliable public OSRM router
    with the Ola Maps directions API (same provider that computes ETA/distance).
    """
    data = _call_ola_maps(
        "POST",
        "/routing/v1/directions",
        {
            "origin": f"{origin_lat},{origin_lng}",
            "destination": f"{destination_lat},{destination_lng}",
            "mode": "driving",
            "alternatives": "false",
            "steps": "false",
            "overview": "full",
            "language": "en",
            "traffic_metadata": "false",
            "route_preference": "fastest",
        },
    )

    routes = data.get("routes")
    if not isinstance(routes, list) or not routes:
        raise OlaMapsServiceError("Ola Maps route response did not include routes")

    first_route = routes[0]
    if not isinstance(first_route, dict):
        raise OlaMapsServiceError("Ola Maps route response was malformed")

    overview = first_route.get("overview_polyline")
    if isinstance(overview, dict):
        encoded = overview.get("points")
    elif isinstance(overview, str):
        encoded = overview
    else:
        encoded = None
    if not isinstance(encoded, str) or not encoded:
        raise OlaMapsServiceError("Ola Maps route response missing polyline")

    coordinates = decode_polyline(encoded)
    if len(coordinates) < 2:
        raise OlaMapsServiceError("Ola Maps route polyline was empty")

    distance_meters, duration_seconds = _extract_route_totals(data)
    return {
        "coordinates": coordinates,
        "distance_meters": distance_meters,
        "duration_seconds": duration_seconds,
        "eta_minutes": _eta_minutes(duration_seconds),
    }
