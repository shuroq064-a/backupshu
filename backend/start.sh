#!/bin/sh
set -eu

python scripts/verify_migrations.py
alembic upgrade head
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
