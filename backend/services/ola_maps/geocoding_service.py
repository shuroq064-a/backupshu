from __future__ import annotations

import logging
import re
from typing import Any

from .eta_service import OlaMapsServiceError, _call_ola_maps


logger = logging.getLogger(__name__)

# Tokens that carry no locational meaning on their own. When the query is made
# up only of these (or of very short fragments) we don't reject a geocode
# result, to avoid false negatives on phrasing like "service center near me".
_FILLER_TOKENS = {
    "near", "me", "my", "the", "a", "an", "of", "in", "at", "on", "to", "i",
    "want", "book", "find", "show", "please", "location", "area", "place",
    "address", "road", "street", "st", "rd", "avenue", "ave", "lane", "ln",
    "search", "for", "this", "that", "with",
}


def _query_tokens(address: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", address.lower()) if len(t) >= 3]


def _is_relevant_match(address: str, formatted_address: str) -> bool:
    """Check that a geocoded result actually relates to the query.

    Geocoders frequently return a best-guess fallback for meaningless input
    (e.g. random characters). A result is treated as irrelevant when none of
    the query's meaningful tokens appear anywhere in the returned address.
    """
    tokens = _query_tokens(address)
    if not tokens:
        return True
    meaningful = [t for t in tokens if t not in _FILLER_TOKENS]
    check_against = meaningful or tokens
    haystack = formatted_address.lower()
    return any(token in haystack for token in check_against)


def _first_result(data: dict[str, Any]) -> dict[str, Any]:
    for key in ("geocodingResults", "results"):
        results = data.get(key)
        if isinstance(results, list) and results and isinstance(results[0], dict):
            return results[0]
    raise OlaMapsServiceError("Ola Maps geocoding response did not include results")


def _location_from(result: dict[str, Any]) -> tuple[float, float]:
    geometry = result.get("geometry")
    location = geometry.get("location") if isinstance(geometry, dict) else None
    if not isinstance(location, dict):
        location = result.get("location")
    if not isinstance(location, dict):
        location = result

    latitude = location.get("lat", location.get("latitude"))
    longitude = location.get("lng", location.get("lon", location.get("longitude")))

    if not isinstance(latitude, (int, float)) or not isinstance(longitude, (int, float)):
        raise OlaMapsServiceError("Ola Maps geocoding response missing coordinates")

    return float(latitude), float(longitude)


def geocode_address(address: str) -> dict[str, float | str]:
    """Geocode a human-readable address into coordinates and a formatted address."""
    if not address or not address.strip():
        raise ValueError("address must not be empty")

    data = _call_ola_maps(
        "GET",
        "/places/v1/geocode",
        {"address": address.strip(), "language": "en"},
    )
    result = _first_result(data)
    latitude, longitude = _location_from(result)
    formatted_address = (
        result.get("formatted_address")
        or result.get("formattedAddress")
        or result.get("description")
        or result.get("address")
    )

    if not isinstance(formatted_address, str) or not formatted_address:
        raise OlaMapsServiceError("Ola Maps geocoding response missing address")

    if not _is_relevant_match(address, formatted_address):
        raise OlaMapsServiceError(
            "No location matches that search. Please enter a valid place, landmark, or address."
        )

    logger.info(
        "Ola Maps geocoding completed",
        extra={"has_formatted_address": True},
    )
    return {
        "latitude": latitude,
        "longitude": longitude,
        "formatted_address": formatted_address,
    }
