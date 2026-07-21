"""add customer location updated timestamp

Revision ID: 7d2f0a9c3b
Revises: task04_05_11
Create Date: 2026-06-17
"""

from alembic import op
import sqlalchemy as sa


revision = "7d2f0a9c3b"
down_revision = "task04_05_11"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("bookings")}
    if "customer_location_updated_at" not in columns:
        op.add_column(
            "bookings",
            sa.Column("customer_location_updated_at", sa.DateTime(), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("bookings")}
    if "customer_location_updated_at" in columns:
        op.drop_column("bookings", "customer_location_updated_at")
