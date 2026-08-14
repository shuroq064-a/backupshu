"""add premium profile setup columns to users

Revision ID: add_premium_profile_setup
Revises: add_worker_home_location
Create Date: 2026-08-14

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_premium_profile_setup'
down_revision = 'add_worker_home_location'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("gender", sa.String(), nullable=True))
    op.add_column("users", sa.Column("profession", sa.String(), nullable=True))
    op.add_column(
        "users",
        sa.Column("onboarding_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column("users", "onboarding_completed")
    op.drop_column("users", "profession")
    op.drop_column("users", "gender")
    op.drop_column("users", "age")