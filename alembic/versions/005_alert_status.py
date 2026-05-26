"""005 — add alert_status and alert_triggered_at to posts.

Revision ID: 005
Revises: 004
Create Date: 2026-05-26
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "posts",
        sa.Column(
            "alert_status",
            sa.String(30),
            nullable=True,
            server_default="Not triggered",
        ),
    )
    op.add_column(
        "posts",
        sa.Column(
            "alert_triggered_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("posts", "alert_triggered_at")
    op.drop_column("posts", "alert_status")
