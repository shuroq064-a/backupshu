from datetime import datetime
from datetime import timezone

from services.geo_utils import (
    calculate_distance
)

def check_offline(
    last_seen_at
):
    """
    Returns True if no GPS update
    received for more than 3 mins
    """

    now = datetime.now(
        timezone.utc
    )

    seconds_elapsed = (
        now - last_seen_at
    ).total_seconds()

    return (
        seconds_elapsed > 180
    )


def is_gps_jump(
    prev_coords,
    new_coords,
    seconds_elapsed
):
    """
    Detect impossible movement
    """

    distance_km = calculate_distance(
        prev_coords[0],
        prev_coords[1],
        new_coords[0],
        new_coords[1]
    )

    return (
        distance_km > 10
        and
        seconds_elapsed < 30
    )