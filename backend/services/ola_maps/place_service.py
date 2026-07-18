from __future__ import annotations

import logging
from typing import Any

from .eta_service import OlaMapsServiceError, _call_ola_maps


logger = logging.getLogger(__name__)


def _result_list(data: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("results", "places", "predictions", "textSearchResults"):
        results = data.get(key)
        if isinstance(results, list):
            return [result for result in results if isinstance(result, dict)]
    raise OlaMapsServiceError("Ola Maps places response did not include results")


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
        raise OlaMapsServiceError("Ola Maps places response missing coordinates")

    return float(latitude), float(longitude)


def search_places(query: str) -> list[dict[str, float | str]]:
    """Search Ola Maps places by text and return normalized place summaries."""
    if not query or not query.strip():
        raise ValueError("query must not be empty")

    data = _call_ola_maps(
        "GET",
        "/places/v1/textsearch",
        {"input": query.strip(), "language": "en"},
    )

    places: list[dict[str, float | str]] = []
    for result in _result_list(data):
        latitude, longitude = _location_from(result)
        structured_formatting = result.get("structured_formatting")
        name = (
            result.get("name")
            or (
                structured_formatting.get("main_text")
                if isinstance(structured_formatting, dict)
                else None
            )
            or result.get("description")
        )
        address = (
            result.get("formatted_address")
            or result.get("formattedAddress")
            or result.get("address")
            or result.get("vicinity")
            or result.get("description")
        )

        if not isinstance(name, str) or not isinstance(address, str):
            logger.warning("Skipping Ola Maps place result with missing fields")
            continue

        places.append(
            {
                "name": name,
                "address": address,
                "latitude": latitude,
                "longitude": longitude,
            }
        )

    logger.info("Ola Maps place search completed", extra={"result_count": len(places)})
    return places
