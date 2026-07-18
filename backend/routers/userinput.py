from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import os
import sys
import uuid

if __package__ and "." in __package__:
    from ..database import get_db
    from .. import models, dbmodels
    from ..auth_utils import get_current_user
    from ..tasks.nlp_tasks import process_query_intent
    from ..services.worker_matching import find_available_workers_by_intent
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from database import get_db
    import models
    import dbmodels
    from auth_utils import get_current_user
    from tasks.nlp_tasks import process_query_intent
    from services.worker_matching import find_available_workers_by_intent

router = APIRouter(prefix="/userinput", tags=["Userinput"])


@router.post("/user-query", response_model=models.UserQueryProcessResponse, status_code=status.HTTP_201_CREATED)
def create_user_query(
    data: models.UserQueryCreateRequest,
    db: Session = Depends(get_db),
    current_user: dbmodels.User = Depends(get_current_user),
):
    message = data.input_message.strip()

    if not message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Input message cannot be empty",
        )

    new_query = dbmodels.UserQuery(
        id=str(uuid.uuid4()),
        input_message=message,
        intent=None,
        status="processing",
        user_id=current_user.id,
    )

    try:
        db.add(new_query)
        db.commit()
        db.refresh(new_query)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to create query",
        )

    # Process NLP immediately for faster chat experience.
    try:
        process_query_intent(new_query.id)
        db.refresh(new_query)
    except Exception as exc:
        print(
            f"[ERROR] Inline NLP processing failed for query_id={new_query.id}: {exc}"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to process user query right now",
        )

    workers = []
    response_status = "processing"

    if new_query.intent and new_query.intent != "unknown":
        workers = find_available_workers_by_intent(db, new_query.intent)
        response_status = "done"

    if new_query.intent == "unknown":
        response_status = "needs_clarification"

    if new_query.intent == "unknown":
        message = "I saved your request. Needs more clarification."
    elif workers:
        message = "User query processed successfully. Specialists available."
    else:
        message = "User query processed. No available specialist found yet."

    return {
        "status": response_status,
        "message": message,
        "intent": new_query.intent or "unknown",
        "data": new_query,
        "workers": workers,
    }


#@router.get("/user-query", response_model=models.UserQueryListResponse)
#def get_user_queries(
#    db: Session = Depends(get_db),
#    current_user: dbmodels.User = Depends(get_current_user),
#):
#    queries = (
#        db.query(dbmodels.UserQuery)
#        .filter(dbmodels.UserQuery.user_id == current_user.id)
#        .order_by(dbmodels.UserQuery.id.desc())
#        .all()
#    )
#
#    return {
#        "message": "User queries fetched successfully",
#        "data": queries,
#    }


#@router.get("/user-query/{query_id}")
#def get_query(
#    query_id: str,
#    db: Session = Depends(get_db),
#    current_user=Depends(get_current_user)
#):
#    query = db.query(dbmodels.UserQuery).filter(
#        dbmodels.UserQuery.id == query_id,
#        dbmodels.UserQuery.user_id == current_user.id
#    ).first()

#    if not query:
#        raise HTTPException(status_code=404, detail="Query not found")

#    return {
#        "status": query.status,
#        "intent": query.intent,
#        "message": query.input_message,
#    }

