"""009 — add email_address to alert_delivery_configs, drop owner DM fields.

Revision ID: 009
Revises: 008
Create Date: 2026-05-29
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add email address field
    op.add_column(
        "alert_delivery_configs",
        sa.Column("email_address", sa.String(200), nullable=True),
    )
    # Rename any existing delivery_channels that reference "owner_dm" → "email"
    op.execute(
        sa.text("""
            UPDATE alert_delivery_configs
            SET delivery_channels = array_replace(delivery_channels, 'owner_dm', 'email')
            WHERE delivery_channels IS NOT NULL AND 'owner_dm' = ANY(delivery_channels)
        """)
    )


def downgrade() -> None:
    op.execute(
        sa.text("""
            UPDATE alert_delivery_configs
            SET delivery_channels = array_replace(delivery_channels, 'email', 'owner_dm')
            WHERE delivery_channels IS NOT NULL AND 'email' = ANY(delivery_channels)
        """)
    )
    op.drop_column("alert_delivery_configs", "email_address")
