from __future__ import annotations

import logging
from typing import Any

from .eta_service import OlaMapsServiceError, _call_ola_maps


logger = logging.getLogger(__name__)


def _first_result(data: dict[str, Any]) -> dict[str, Any]:
    for key in ("results", "reverseGeocodingResults", "geocodingResults"):
        results = data.get(key)
        if isinstance(results, list) and results and isinstance(results[0], dict):
            return results[0]
    raise OlaMapsServiceError(
        "Ola Maps reverse geocoding response did not include results"
    )


def reverse_geocode(latitude: float, longitude: float) -> dict[str, str]:
    """Reverse geocode coordinates into a formatted address."""
    data = _call_ola_maps(
        "GET",
        "/places/v1/reverse-geocode",
        {"latlng": f"{latitude},{longitude}", "language": "en"},
    )
    result = _first_result(data)
    formatted_address = (
        result.get("formatted_address")
        or result.get("formattedAddress")
        or result.get("description")
        or result.get("address")
    )

    if not isinstance(formatted_address, str) or not formatted_address:
        raise OlaMapsServiceError(
            "Ola Maps reverse geocoding response missing address"
        )

    logger.info(
        "Ola Maps reverse geocoding completed",
        extra={"has_formatted_address": True},
    )
    return {"formatted_address": formatted_address}
