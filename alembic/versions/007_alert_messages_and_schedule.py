"""007 — create alert_messages table and add schedule config to app_settings.

Revision ID: 007
Revises: 006
Create Date: 2026-05-27
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create alert_messages table
    op.create_table(
        "alert_messages",
        sa.Column("id", sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("alert_type", sa.String(30), nullable=False),
        sa.Column("title", sa.String(500), nullable=True),
        sa.Column("message_body", sa.Text(), nullable=True),
        sa.Column("taxonomy", sa.String(50), nullable=True),
        sa.Column("related_incident_ids", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("related_post_ids", postgresql.ARRAY(sa.Integer()), nullable=True),
        sa.Column("delivery_channel", sa.String(30), nullable=True),
        sa.Column("target_name", sa.String(200), nullable=True),
        sa.Column("target_id", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Add schedule config columns to app_settings
    op.add_column("app_settings", sa.Column("daily_alert_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=True))
    op.add_column("app_settings", sa.Column("daily_alert_time", sa.String(10), server_default="09:00", nullable=True))
    op.add_column("app_settings", sa.Column("daily_alert_timezone", sa.String(50), server_default="Asia/Singapore", nullable=True))
    op.add_column("app_settings", sa.Column("weekly_summary_enabled", sa.Boolean(), server_default=sa.text("true"), nullable=True))
    op.add_column("app_settings", sa.Column("weekly_summary_day", sa.String(20), server_default="Monday", nullable=True))
    op.add_column("app_settings", sa.Column("weekly_summary_time", sa.String(10), server_default="09:00", nullable=True))
    op.add_column("app_settings", sa.Column("weekly_summary_timezone", sa.String(50), server_default="Asia/Singapore", nullable=True))


def downgrade() -> None:
    op.drop_column("app_settings", "weekly_summary_timezone")
    op.drop_column("app_settings", "weekly_summary_time")
    op.drop_column("app_settings", "weekly_summary_day")
    op.drop_column("app_settings", "weekly_summary_enabled")
    op.drop_column("app_settings", "daily_alert_timezone")
    op.drop_column("app_settings", "daily_alert_time")
    op.drop_column("app_settings", "daily_alert_enabled")
    op.drop_table("alert_messages")
