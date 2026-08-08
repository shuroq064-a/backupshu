"""add worker home base location columns

Revision ID: add_worker_home_location
Revises: add_booking_otp
Create Date: 2026-08-08

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_worker_home_location'
down_revision = 'add_booking_otp'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("workers", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("workers", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("workers", sa.Column("location_updated_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("workers", "location_updated_at")
    op.drop_column("workers", "longitude")
    op.drop_column("workers", "latitude")