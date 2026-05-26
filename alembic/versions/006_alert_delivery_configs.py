"""006 — create alert_delivery_configs table.

Revision ID: 006
Revises: 005
Create Date: 2026-05-26
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_delivery_configs",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("taxonomy", sa.String(50), nullable=False),
        sa.Column("primary_owner_name", sa.String(100), nullable=True),
        sa.Column("primary_owner_lark_open_id", sa.String(100), nullable=True),
        sa.Column("lark_group_name", sa.String(200), nullable=True),
        sa.Column("lark_group_webhook", sa.Text(), nullable=True),
        sa.Column("delivery_channels", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column(
            "priority_threshold",
            sa.String(20),
            nullable=False,
            server_default="High",
        ),
        sa.Column("cooldown_hours", sa.Integer(), nullable=False, server_default="24"),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_delivery_status", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("taxonomy", name="uq_alert_delivery_taxonomy"),
    )


def downgrade() -> None:
    op.drop_table("alert_delivery_configs")
