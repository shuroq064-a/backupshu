from __future__ import annotations

import os
import sys

if __package__ and "." in __package__:
    from .. import dbmodels, models
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    import dbmodels
    import models


def service_name(worker_service: dbmodels.WorkerService) -> str:
    service = worker_service.service
    return service.name if service else str(worker_service.service_id)


def build_worker_service_out(
    worker_service: dbmodels.WorkerService,
) -> models.WorkerServiceOut:
    return models.WorkerServiceOut(
        service_id=worker_service.service_id,
        service_name=service_name(worker_service),
        price_override=worker_service.price_override,
        experience_years=worker_service.experience_years,
        status=worker_service.status,
    )


def build_worker_services(
    worker: dbmodels.Worker,
) -> list[models.WorkerServiceOut]:
    return [build_worker_service_out(item) for item in worker.services]


def primary_service_name(worker: dbmodels.Worker | None) -> str:
    if not worker or not worker.services:
        return "Service"
    verified = [item for item in worker.services if item.status == "verified"]
    return service_name((verified or worker.services)[0])
