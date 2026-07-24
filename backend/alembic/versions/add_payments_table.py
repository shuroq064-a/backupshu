"""add payments table and booking.is_paid

Revision ID: add_payments_table
Revises: merge_ai_chat_and_user_addresses
Create Date: 2025-07-24
"""
from alembic import op
import sqlalchemy as sa

revision = "add_payments_table"
down_revision = "merge_ai_chat_and_user_addresses"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create payments table
    op.create_table(
        "payments",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("booking_id", sa.String(), nullable=False),
        sa.Column("razorpay_order_id", sa.String(), nullable=False, unique=True),
        sa.Column("razorpay_payment_id", sa.String(), nullable=True),
        sa.Column("razorpay_signature", sa.String(), nullable=True),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="INR"),
        sa.Column("status", sa.String(), nullable=False, server_default="created"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_payments_booking_id", "payments", ["booking_id"])
    op.create_index("ix_payments_razorpay_order_id", "payments", ["razorpay_order_id"])

    # Add is_paid column to bookings
    op.add_column("bookings", sa.Column("is_paid", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    op.drop_column("bookings", "is_paid")
    op.drop_index("ix_payments_razorpay_order_id", table_name="payments")
    op.drop_index("ix_payments_booking_id", table_name="payments")
    op.drop_table("payments")
