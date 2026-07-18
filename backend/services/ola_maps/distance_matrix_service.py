from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from .eta_service import OlaMapsServiceError, _call_ola_maps, _eta_minutes, _number_from


logger = logging.getLogger(__name__)

CoordinateInput = Sequence[float] | Mapping[str, float]


def _coordinate_string(points: Iterable[CoordinateInput] | str) -> str:
    if isinstance(points, str):
        if not points.strip():
            raise ValueError("coordinate string must not be empty")
        return points.strip()

    coordinates: list[str] = []
    for point in points:
        if isinstance(point, Mapping):
            latitude = point.get("latitude", point.get("lat"))
            longitude = point.get("longitude", point.get("lng"))
        else:
            if len(point) < 2:
                raise ValueError("coordinate sequences must include lat and lng")
            latitude = point[0]
            longitude = point[1]

        if latitude is None or longitude is None:
            raise ValueError("coordinates must include latitude and longitude")
        coordinates.append(f"{float(latitude)},{float(longitude)}")

    if not coordinates:
        raise ValueError("at least one coordinate is required")

    return "|".join(coordinates)


def get_distance_matrix(
    origins: Iterable[CoordinateInput] | str,
    destinations: Iterable[CoordinateInput] | str,
) -> list[dict[str, int]]:
    """Return flattened distance and ETA results for origin-destination pairs."""
    origins_param = _coordinate_string(origins)
    destinations_param = _coordinate_string(destinations)

    data = _call_ola_maps(
        "GET",
        "/routing/v1/distanceMatrix",
        {
            "origins": origins_param,
            "destinations": destinations_param,
            "mode": "driving",
            "route_preference": "fastest",
        },
    )

    rows = data.get("rows")
    if not isinstance(rows, list):
        raise OlaMapsServiceError("Ola Maps distance matrix response missing rows")

    matrix: list[dict[str, int]] = []
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("elements"), list):
            raise OlaMapsServiceError("Ola Maps distance matrix row was malformed")

        for element in row["elements"]:
            if not isinstance(element, dict):
                raise OlaMapsServiceError(
                    "Ola Maps distance matrix element was malformed"
                )
            distance_meters = _number_from(element.get("distance"), "distance")
            duration_seconds = _number_from(element.get("duration"), "duration")
            matrix.append(
                {
                    "distance_meters": distance_meters,
                    "duration_seconds": duration_seconds,
                    "eta_minutes": _eta_minutes(duration_seconds),
                }
            )

    logger.info(
        "Ola Maps distance matrix calculated",
        extra={"origin_count": len(rows), "result_count": len(matrix)},
    )
    return matrix
