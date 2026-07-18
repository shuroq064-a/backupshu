"""baseline

Revision ID: 2fb81e6d69fd
Revises: 
Create Date: 2026-05-21 19:32:11.490039

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '2fb81e6d69fd'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('hashed_password', sa.String(), nullable=True),
        sa.Column('role', sa.String(), nullable=True),
        sa.Column('avatar', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('address', sa.String(), nullable=True),
        sa.Column('language', sa.String(), nullable=True),
        sa.Column('location', sa.String(), nullable=True),
        sa.Column('auth_provider', sa.String(), nullable=True),
        sa.Column('provider_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id', name=op.f('users_pkey')),
        sa.UniqueConstraint('email', name=op.f('users_email_key')),
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=False)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)

    op.create_table(
        'workers',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('verification_status', sa.String(), nullable=True),
        sa.Column('is_available', sa.Boolean(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=True),
        sa.Column('submitted_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.Column('rejection_reason', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('workers_user_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('workers_pkey')),
    )
    op.create_index(op.f('ix_workers_id'), 'workers', ['id'], unique=False)

    op.create_table(
        'bookings',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('booking_number', sa.String(), nullable=True),
        sa.Column('client_id', sa.String(), nullable=False),
        sa.Column('worker_id', sa.String(), nullable=False),
        sa.Column('service_type', sa.String(), nullable=False),
        sa.Column('address', sa.String(), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('scheduled_date', sa.String(), nullable=False),
        sa.Column('scheduled_time', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('visit_charge', sa.Float(), nullable=True),
        sa.Column('repair_amount', sa.Float(), nullable=True),
        sa.Column('tip', sa.Float(), nullable=True),
        sa.Column('total_amount', sa.Float(), nullable=True),
        sa.Column('payment_method', sa.String(), nullable=True),
        sa.Column('eta_minutes', sa.Integer(), nullable=True),
        sa.Column('customer_feedback', sa.Text(), nullable=True),
        sa.Column('customer_rating', sa.Integer(), nullable=True),
        sa.Column('cancellation_reason', sa.Text(), nullable=True),
        sa.Column('cancelled_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['client_id'], ['users.id'], name=op.f('bookings_client_id_fkey')),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], name=op.f('bookings_worker_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('bookings_pkey')),
        sa.UniqueConstraint('booking_number', name=op.f('bookings_booking_number_key')),
    )
    op.create_index(op.f('ix_bookings_booking_number'), 'bookings', ['booking_number'], unique=False)
    op.create_index(op.f('ix_bookings_id'), 'bookings', ['id'], unique=False)

    op.create_table(
        'userQuery',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('input_message', sa.Text(), nullable=False),
        sa.Column('intent', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('userQuery_user_id_fkey')),
        sa.PrimaryKeyConstraint('id', name=op.f('userQuery_pkey')),
    )
    op.create_index(op.f('ix_userQuery_id'), 'userQuery', ['id'], unique=False)

    op.create_table(
        'services',
        sa.Column('id', sa.VARCHAR(), nullable=False),
        sa.Column('name', sa.VARCHAR(), nullable=False),
        sa.Column('description', sa.TEXT(), nullable=True),
        sa.Column('base_price', sa.INTEGER(), nullable=True),
        sa.Column('created_at', postgresql.TIMESTAMP(), nullable=True),
        sa.PrimaryKeyConstraint('id', name=op.f('services_pkey')),
        sa.UniqueConstraint('name', name=op.f('services_name_key')),
    )
    op.create_index(op.f('ix_services_id'), 'services', ['id'], unique=False)

    op.create_table(
        'worker_services',
        sa.Column('worker_id', sa.VARCHAR(), nullable=False),
        sa.Column('service_id', sa.VARCHAR(), nullable=False),
        sa.Column('price_override', sa.INTEGER(), nullable=True),
        sa.Column('experience_years', sa.INTEGER(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('requested_at', sa.DateTime(), nullable=True, server_default=sa.func.now()),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
        sa.Column('reviewed_by', sa.String(), nullable=True),
        sa.ForeignKeyConstraint(['service_id'], ['services.id'], name=op.f('worker_services_service_id_fkey')),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id'], name=op.f('worker_services_worker_id_fkey')),
        sa.PrimaryKeyConstraint('worker_id', 'service_id', name=op.f('worker_services_pkey')),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('worker_services')
    op.drop_index(op.f('ix_services_id'), table_name='services')
    op.drop_table('services')
    op.drop_index(op.f('ix_userQuery_id'), table_name='userQuery')
    op.drop_table('userQuery')
    op.drop_index(op.f('ix_bookings_id'), table_name='bookings')
    op.drop_index(op.f('ix_bookings_booking_number'), table_name='bookings')
    op.drop_table('bookings')
    op.drop_index(op.f('ix_workers_id'), table_name='workers')
    op.add_column('workers', sa.Column('skill', sa.String(), nullable=False, server_default='pending'))
    op.drop_table('workers')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
