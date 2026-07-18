"""Add LocationPermission model and location permission fields to User

Revision ID: add_location_permission_db
Revises: 8a9b0c1d2e3f
Create Date: 2026-06-18

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_location_permission_db'
down_revision = '8a9b0c1d2e3f'
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # The development app has historically used metadata.create_all() on
    # startup. It may have created the new table before Alembic gets a chance
    # to record this revision, so make this migration safe to apply in either
    # order.
    user_columns = {column["name"] for column in inspector.get_columns("users")}
    if "location_permission_granted" not in user_columns:
        op.add_column("users", sa.Column("location_permission_granted", sa.String(), nullable=True))
    if "location_permission_granted_at" not in user_columns:
        op.add_column("users", sa.Column("location_permission_granted_at", sa.DateTime(), nullable=True))

    tables = set(inspector.get_table_names())
    if "location_permissions" not in tables:
        op.create_table(
            "location_permissions",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("permission_type", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    inspector = sa.inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("location_permissions")}
    if "ix_location_permissions_user_id" not in indexes:
        op.create_index("ix_location_permissions_user_id", "location_permissions", ["user_id"])
    if "ix_location_permissions_expires_at" not in indexes:
        op.create_index("ix_location_permissions_expires_at", "location_permissions", ["expires_at"])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('ix_location_permissions_expires_at', 'location_permissions')
    op.drop_index('ix_location_permissions_user_id', 'location_permissions')
    
    # Drop location_permissions table
    op.drop_table('location_permissions')
    
    # Remove location permission fields from users table
    op.drop_column('users', 'location_permission_granted_at')
    op.drop_column('users', 'location_permission_granted')
