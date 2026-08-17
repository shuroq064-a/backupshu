#!/bin/sh
set -u

python scripts/verify_migrations.py || true
alembic upgrade head || echo "alembic upgrade head failed; continuing without applying migrations"
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}"
