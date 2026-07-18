"""add user address book

Revision ID: add_user_addresses
Revises: add_location_permission_db
Create Date: 2026-07-09
"""

from alembic import op
import sqlalchemy as sa


revision = "add_user_addresses"
down_revision = "add_location_permission_db"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    if "user_addresses" not in tables:
        op.create_table(
            "user_addresses",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("address", sa.String(), nullable=False),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("receiver_name", sa.String(), nullable=False),
            sa.Column("contact_number", sa.String(), nullable=False),
            sa.Column("house_flat", sa.String(), nullable=False),
            sa.Column("block_area", sa.String(), nullable=False),
            sa.Column("landmark", sa.String(), nullable=True),
            sa.Column("address_label", sa.String(), nullable=False),
            sa.Column("custom_address_label", sa.String(), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("user_addresses")}
    if "ix_user_addresses_user_id" not in indexes:
        op.create_index("ix_user_addresses_user_id", "user_addresses", ["user_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())
    if "user_addresses" in tables:
        indexes = {index["name"] for index in inspector.get_indexes("user_addresses")}
        if "ix_user_addresses_user_id" in indexes:
            op.drop_index("ix_user_addresses_user_id", table_name="user_addresses")
        op.drop_table("user_addresses")
