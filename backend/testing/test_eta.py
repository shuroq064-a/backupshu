import sys
import os

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

sys.path.append(BASE_DIR)
from services.eta_predictor import (
    predict_eta
)

eta = predict_eta(
    distance_km=8,
    hour=18,
    day_of_week="Friday",
    area_type="commercial",
    historical_speed=20
)

print(
    f"Predicted ETA: {eta} minutes"
)

print(
    "Model loaded successfully and prediction generated."
)
