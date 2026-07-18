"""
add booking address/contact fields

Revision ID: 8a9b0c1d2e3f
Revises: 7d2f0a9c3b
Create Date: 2026-06-17
"""

from alembic import op
import sqlalchemy as sa


revision = "8a9b0c1d2e3f"
down_revision = "7d2f0a9c3b"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("bookings")}

    if "receiver_name" not in columns:
        op.add_column("bookings", sa.Column("receiver_name", sa.String(), nullable=False, server_default="Unknown"))
    if "contact_number" not in columns:
        op.add_column("bookings", sa.Column("contact_number", sa.String(), nullable=False, server_default=""))
    if "house_flat" not in columns:
        op.add_column("bookings", sa.Column("house_flat", sa.String(), nullable=False, server_default=""))
    if "block_area" not in columns:
        op.add_column("bookings", sa.Column("block_area", sa.String(), nullable=False, server_default=""))
    if "landmark" not in columns:
        op.add_column("bookings", sa.Column("landmark", sa.String(), nullable=True))
    if "address_label" not in columns:
        op.add_column("bookings", sa.Column("address_label", sa.String(), nullable=False, server_default="Home"))
    if "custom_address_label" not in columns:
        op.add_column("bookings", sa.Column("custom_address_label", sa.String(), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("bookings")}

    if "custom_address_label" in columns:
        op.drop_column("bookings", "custom_address_label")
    if "address_label" in columns:
        op.drop_column("bookings", "address_label")
    if "landmark" in columns:
        op.drop_column("bookings", "landmark")
    if "block_area" in columns:
        op.drop_column("bookings", "block_area")
    if "house_flat" in columns:
        op.drop_column("bookings", "house_flat")
    if "contact_number" in columns:
        op.drop_column("bookings", "contact_number")
    if "receiver_name" in columns:
        op.drop_column("bookings", "receiver_name")
