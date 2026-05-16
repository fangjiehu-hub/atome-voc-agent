"""Add primary_owner column to routing_rules

Revision ID: 003
Revises: 002
Create Date: 2026-04-22
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "routing_rules",
        sa.Column("primary_owner", sa.String(100), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("routing_rules", "primary_owner")
