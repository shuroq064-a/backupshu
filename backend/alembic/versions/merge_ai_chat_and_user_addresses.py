"""merge add_ai_chat_tables and add_user_addresses heads

Revision ID: merge_ai_chat_and_user_addresses
Revises: add_ai_chat_tables, add_user_addresses
Create Date: 2026-07-21

"""
from alembic import op
import sqlalchemy as sa


revision = 'merge_ai_chat_and_user_addresses'
down_revision = ('add_ai_chat_tables', 'add_user_addresses')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass