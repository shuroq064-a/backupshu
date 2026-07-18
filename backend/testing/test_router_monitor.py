import sys
import os

BASE_DIR = os.path.dirname(
    os.path.dirname(
        os.path.abspath(__file__)
    )
)

sys.path.append(
    BASE_DIR
)

from datetime import datetime
from datetime import timedelta
from datetime import timezone

from services.route_monitor import (
    check_offline,
    is_gps_jump
)

old_time = (
    datetime.now(
        timezone.utc
    )
    -
    timedelta(minutes=4)
)

print(
    "Offline Check:",
    check_offline(old_time)
)

prev = (
    17.4474,
    78.3762
)

new = (
    17.2403,
    78.4294
)

print(
    "GPS Jump:",
    is_gps_jump(
        prev,
        new,
        20
    )
)