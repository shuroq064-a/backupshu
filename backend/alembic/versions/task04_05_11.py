"""make_worker_id_nullable_default_charge_100

Revision ID: task04_05_11
Revises: 2fb81e6d69fd
Create Date: 2026-06-07
"""
from alembic import op
import sqlalchemy as sa

revision = "task04_05_11"
down_revision = "2fb81e6d69fd"
branch_labels = None
depends_on = None


def upgrade():
    # Make worker_id nullable — bookings start unassigned, any matching
    # specialist can accept (first-click wins)
    op.alter_column(
        "bookings", "worker_id",
        existing_type=sa.String(),
        nullable=True,
    )
    # Default visit charge 100 Rs
    op.alter_column(
        "bookings", "visit_charge",
        existing_type=sa.Float(),
        server_default="100",
    )
    op.alter_column(
        "bookings", "total_amount",
        existing_type=sa.Float(),
        server_default="100",
    )


def downgrade():
    op.alter_column(
        "bookings", "worker_id",
        existing_type=sa.String(),
        nullable=False,
    )
    op.alter_column(
        "bookings", "visit_charge",
        existing_type=sa.Float(),
        server_default="0",
    )
    op.alter_column(
        "bookings", "total_amount",
        existing_type=sa.Float(),
        server_default="0",
    )