"""add OTP fields to bookings

Revision ID: add_booking_otp
Revises: add_payments_table
Create Date: 2025-08-04
"""
from alembic import op
import sqlalchemy as sa

revision = "add_booking_otp"
down_revision = "add_payments_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {c["name"] for c in inspector.get_columns("bookings")}

    if "otp_code" not in columns:
        op.add_column("bookings", sa.Column("otp_code", sa.String(4), nullable=True))

    if "otp_expires_at" not in columns:
        op.add_column("bookings", sa.Column("otp_expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("bookings", "otp_expires_at")
    op.drop_column("bookings", "otp_code")
