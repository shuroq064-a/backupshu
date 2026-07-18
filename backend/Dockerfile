FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libpq-dev libgomp1 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install -r requirements.txt

COPY . .

# Fail the image build when a revision file is missing, a migration points to a
# non-existent revision, or the built image does not contain the declared head.
RUN python scripts/verify_migrations.py

EXPOSE 8000

CMD ["sh", "./start.sh"]
