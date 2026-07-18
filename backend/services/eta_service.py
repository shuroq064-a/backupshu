from __future__ import annotations

import logging

from .ola_maps.eta_service import OlaMapsServiceError, get_eta_minutes as get_ola_eta_details


logger = logging.getLogger(__name__)


class EtaServiceError(RuntimeError):
    """Raised when ETA calculation cannot be completed."""


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
