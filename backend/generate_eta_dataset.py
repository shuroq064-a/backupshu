import random
import pandas as pd

random.seed(71)

days = [
    "Monday","Tuesday","Wednesday",
    "Thursday","Friday","Saturday","Sunday"
]

areas = [
    "residential",
    "commercial"
]

records = []

for _ in range(5000):

    distance_km = round(
        random.uniform(1,25),
        2
    )

    hour = random.randint(0,23)

    day = random.choice(days)

    area = random.choice(areas)

    historical_speed = round(
        random.uniform(15,40),
        2
    )

    traffic_factor = 1.0

    if hour in [8,9,10,17,18,19]:
        traffic_factor += 0.5

    if area == "commercial":
        traffic_factor += 0.2

    eta_minutes = (
        distance_km /
        historical_speed
    ) * 60 * traffic_factor

    records.append([
        distance_km,
        hour,
        day,
        area,
        historical_speed,
        round(eta_minutes,2)
    ])

df = pd.DataFrame(
    records,
    columns=[
        "distance_km",
        "hour",
        "day_of_week",
        "area_type",
        "historical_speed",
        "eta_minutes"
    ]
)

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

dataset_path = os.path.join(
    BASE_DIR,
    "datasets",
    "eta_training_data.csv"
)

df.to_csv(
    dataset_path,
    index=False
)

print("Dataset generated successfully")
