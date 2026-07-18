import os
import sys

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

if __package__ and "." in __package__:
    from ..database import get_db
    from ..dbmodels import Service
    from ..models import ServiceOut
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db
    from dbmodels import Service
    from models import ServiceOut

router = APIRouter(prefix="/services", tags=["Services"])


@router.get("", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)):
    return db.query(Service).order_by(Service.name.asc()).all()
