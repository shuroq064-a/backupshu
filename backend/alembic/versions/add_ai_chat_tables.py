"""Add AI chat session and message tables

Revision ID: add_ai_chat_tables
Revises: add_location_permission_db
Create Date: 2026-07-21

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_ai_chat_tables'
down_revision = 'add_location_permission_db'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    tables = set(inspector.get_table_names())
    if "ai_chat_sessions" not in tables:
        op.create_table(
            "ai_chat_sessions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("title", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ai_chat_messages" not in tables:
        op.create_table(
            "ai_chat_messages",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("session_id", sa.String(), nullable=False),
            sa.Column("role", sa.String(), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["session_id"], ["ai_chat_sessions.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    indexes = {index["name"] for index in inspector.get_indexes("ai_chat_sessions")} if "ai_chat_sessions" in tables else set()
    if "ix_ai_chat_sessions_user_id" not in indexes:
        op.create_index("ix_ai_chat_sessions_user_id", "ai_chat_sessions", ["user_id"])
    if "ix_ai_chat_sessions_updated_at" not in indexes:
        op.create_index("ix_ai_chat_sessions_updated_at", "ai_chat_sessions", ["updated_at"])

    indexes = {index["name"] for index in inspector.get_indexes("ai_chat_messages")} if "ai_chat_messages" in tables else set()
    if "ix_ai_chat_messages_session_id" not in indexes:
        op.create_index("ix_ai_chat_messages_session_id", "ai_chat_messages", ["session_id"])
    if "ix_ai_chat_messages_created_at" not in indexes:
        op.create_index("ix_ai_chat_messages_created_at", "ai_chat_messages", ["created_at"])


def downgrade() -> None:
    op.drop_index('ix_ai_chat_messages_created_at', 'ai_chat_messages')
    op.drop_index('ix_ai_chat_messages_session_id', 'ai_chat_messages')
    op.drop_table('ai_chat_messages')

    op.drop_index('ix_ai_chat_sessions_updated_at', 'ai_chat_sessions')
    op.drop_index('ix_ai_chat_sessions_user_id', 'ai_chat_sessions')
    op.drop_table('ai_chat_sessions')