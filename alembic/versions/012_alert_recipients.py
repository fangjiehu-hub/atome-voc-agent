"""012 — create alert_recipients table (global email + Lark group lists).

Replaces the per-category alert_delivery_configs approach with two simple,
admin-managed lists: email recipients and Lark group webhooks. High-engagement
posts (per the global engagement thresholds) are pushed to all enabled recipients.

Revision ID: 012
Revises: 011
Create Date: 2026-06-23
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_recipients",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        # 'email' → target = email address; 'lark_group' → target = webhook URL
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("label", sa.String(200)),       # display name (group name, person, team)
        sa.Column("target", sa.Text(), nullable=False),  # email address OR webhook URL
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_alert_recipients_channel", "alert_recipients", ["channel"])


def downgrade() -> None:
    op.drop_index("ix_alert_recipients_channel", table_name="alert_recipients")
    op.drop_table("alert_recipients")
