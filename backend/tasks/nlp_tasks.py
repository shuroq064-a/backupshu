#import os
#import sys

#if __package__ and "." in __package__:
#    from ..core.celery_app import celery_app
#    from ..database import SessionLocal
#    from ..dbmodels import UserQuery
#    from ..services.nlp_service import predict_pipeline
#else:
#    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
#    if BACKEND_DIR not in sys.path:
#        sys.path.insert(0, BACKEND_DIR)

#    from core.celery_app import celery_app
#    from database import SessionLocal
#    from dbmodels import UserQuery
#    from services.nlp_service import predict_pipeline


#def _process_nlp(self, query_id: str):
#    db = SessionLocal()
#    try:
#        query = db.query(UserQuery).filter(UserQuery.id == query_id).first()
#        if not query:
#            return {"status": "not_found"}

#        result = predict_pipeline(query.input_message)
#        query.intent = result["intent"]

#        db.commit()
#        return {
#            "status": "completed",
#            "query_id": query_id,
#            "intent": query.intent,
#            "confidence": result["confidence"],
#        }
#    except Exception as exc:
#        db.rollback()
#        raise self.retry(exc=exc, countdown=5)
#    finally:
#        db.close()


#@celery_app.task(name="tasks.nlp_tasks.process_nlp", bind=True, max_retries=3)
#def process_nlp(self, query_id: str):
#    return _process_nlp(self, query_id)


#@celery_app.task(name="backend.tasks.nlp_tasks.process_nlp", bind=True, max_retries=3)
#def process_nlp_backend(self, query_id: str):
#    return _process_nlp(self, query_id)

import os
import sys

# Fix import paths (important for your structure)
if __package__ and "." in __package__:
    from ..core.celery_app import celery
    from ..database import SessionLocal
    from .. import dbmodels
    from ..services.nlp_service import predict_pipeline
else:
    BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
    if BACKEND_DIR not in sys.path:
        sys.path.insert(0, BACKEND_DIR)

    from core.celery_app import celery
    from database import SessionLocal
    import dbmodels
    from services.nlp_service import predict_pipeline


def process_query_intent(query_id: str):
    db = SessionLocal()

    try:
        query = db.query(dbmodels.UserQuery).filter(
            dbmodels.UserQuery.id == query_id
        ).first()

        if not query:
            return

        # 🔥 Run NLP
        result = predict_pipeline(query.input_message)
        intent = str(result.get("intent") or "").strip() or "unknown"

        # 🔥 Update DB
        query.intent = intent

        # ✅ NEW LOGIC (as we discussed)
        if intent == "unknown":
            query.status = "needs_clarification"
        else:
            query.status = "done"

        db.commit()

    finally:
        db.close()


@celery.task(name="tasks.process_nlp")
def process_nlp(query_id: str):
    process_query_intent(query_id)
