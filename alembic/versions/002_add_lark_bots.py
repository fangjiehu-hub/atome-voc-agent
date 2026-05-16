"""Add lark_bots table

Revision ID: 002
Revises: 001
Create Date: 2026-04-21
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lark_bots",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("team_name", sa.String(100), nullable=False),
        sa.Column("webhook_url", sa.String(500), nullable=False),
        sa.Column("description", sa.String(300), server_default=""),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("team_name"),
    )


def downgrade() -> None:
    op.drop_table("lark_bots")
