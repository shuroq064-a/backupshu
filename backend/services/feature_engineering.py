day_mapping = {
    "Monday": 0,
    "Tuesday": 1,
    "Wednesday": 2,
    "Thursday": 3,
    "Friday": 4,
    "Saturday": 5,
    "Sunday": 6
}

area_mapping = {
    "residential": 0,
    "commercial": 1
}


def is_peak_hour(hour: int) -> int:
    """
    Hyderabad peak traffic hours
    """
    return int(hour in [8, 9, 10, 17, 18, 19])


def transform_record(
    distance_km,
    hour,
    day_of_week,
    area_type,
    historical_speed
):
    return [
        distance_km,
        hour,
        day_mapping[day_of_week],
        area_mapping[area_type],
        historical_speed,
        is_peak_hour(hour)
    ]