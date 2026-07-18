import os
from pathlib import Path

from celery import Celery
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

REDIS_URL = os.getenv("REDIS_URL")
if not REDIS_URL:
    raise RuntimeError("REDIS_URL must be set in backend/.env or the deployment environment")

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL") or REDIS_URL
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND") or REDIS_URL

celery = Celery(
    "nlp_tasks",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tasks.nlp_tasks"]
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_concurrency=1
)
