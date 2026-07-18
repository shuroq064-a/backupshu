import json
import os
import joblib
import pandas as pd

from sklearn.ensemble import GradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

from services.feature_engineering import (
    day_mapping,
    area_mapping,
    is_peak_hour
)

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

DATASET_PATH = os.path.join(
    BASE_DIR,
    "datasets",
    "eta_training_data.csv"
)

MODEL_PATH = os.path.join(
    BASE_DIR,
    "models",
    "eta_model.pkl"
)

META_PATH = os.path.join(
    BASE_DIR,
    "models",
    "eta_metadata.json"
)


def train_eta_model():

    df = pd.read_csv(DATASET_PATH)

    df["day_of_week"] = (
        df["day_of_week"]
        .map(day_mapping)
    )

    df["area_type"] = (
        df["area_type"]
        .map(area_mapping)
    )

    df["is_peak_hour"] = (
        df["hour"]
        .apply(is_peak_hour)
    )

    X = df[
        [
            "distance_km",
            "hour",
            "day_of_week",
            "area_type",
            "historical_speed",
            "is_peak_hour"
        ]
    ]

    y = df["eta_minutes"]

    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42
    )

    model = GradientBoostingRegressor(
        random_state=42
    )

    model.fit(
        X_train,
        y_train
    )

    predictions = model.predict(X_test)

    mae = mean_absolute_error(
        y_test,
        predictions
    )

    joblib.dump(
        model,
        MODEL_PATH
    )

    metadata = {
        "mae": round(mae, 2),
        "features": list(X.columns)
    }

    with open(
        META_PATH,
        "w"
    ) as f:
        json.dump(
            metadata,
            f,
            indent=4
        )

    print(f"MAE: {mae:.2f}")
    print("ETA model saved successfully")


if __name__ == "__main__":
    train_eta_model()