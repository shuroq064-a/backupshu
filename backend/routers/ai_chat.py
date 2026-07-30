"""
Router for AI Assistant chat sessions and messages.
Provides CRUD for chat sessions and messages, with user-scoped access.
"""

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from database import get_db
from auth_utils import get_current_user
from dbmodels import AiChatSession, AiChatMessage, User
from models import (
    AiChatSessionCreate,
    AiChatSessionOut,
    AiChatMessageCreate,
    AiChatMessageOut,
    AiChatSessionWithMessagesOut,
)

router = APIRouter(prefix="/ai-chat", tags=["AI Chat"])


@router.post("/sessions", response_model=AiChatSessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: AiChatSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new AI chat session for the current user."""
    session = AiChatSession(
        user_id=current_user.id,
        title=payload.title,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/sessions", response_model=list[AiChatSessionOut])
def list_sessions(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all AI chat sessions for the current user, most recent first."""
    sessions = (
        db.query(AiChatSession)
        .filter(AiChatSession.user_id == current_user.id)
        .order_by(AiChatSession.updated_at.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    return sessions


@router.get("/sessions/{session_id}", response_model=AiChatSessionWithMessagesOut)
def get_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a session with all its messages."""
    session = (
        db.query(AiChatSession)
        .options(joinedload(AiChatSession.messages))
        .filter(AiChatSession.id == session_id, AiChatSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.post("/sessions/{session_id}/messages", response_model=AiChatMessageOut, status_code=status.HTTP_201_CREATED)
def add_message(
    session_id: str,
    payload: AiChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a message to an existing session."""
    session = (
        db.query(AiChatSession)
        .filter(AiChatSession.id == session_id, AiChatSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    message = AiChatMessage(
        session_id=session_id,
        role="user",
        content=payload.content,
    )
    db.add(message)
    
    # Update session's updated_at to keep ordering fresh
    session.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(message)
    return message


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete a chat session and all its messages."""
    session = (
        db.query(AiChatSession)
        .filter(AiChatSession.id == session_id, AiChatSession.user_id == current_user.id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db.delete(session)
    db.commit()