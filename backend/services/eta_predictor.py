import os
import joblib
import pandas as pd

from services.feature_engineering import (
    day_mapping,
    area_mapping,
    is_peak_hour
)

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "eta_model.pkl"
)

model = joblib.load(
    MODEL_PATH
)


def predict_eta(
    distance_km: float,
    hour: int,
    day_of_week: str,
    area_type: str,
    historical_speed: float = 25
) -> int:

    features = pd.DataFrame(
        [[
            distance_km,
            hour,
            day_mapping[day_of_week],
            area_mapping[area_type],
            historical_speed,
            is_peak_hour(hour)
        ]],
        columns=[
            "distance_km",
            "hour",
            "day_of_week",
            "area_type",
            "historical_speed",
            "is_peak_hour"
        ]
    )

    prediction = model.predict(
        features
    )[0]

    return max(
        1,
        round(prediction)
    )