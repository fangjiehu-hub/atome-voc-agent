"""011 — add ai_analysis to posts (Octo Agent AI impact analysis).

Revision ID: 011
Revises: 010
Create Date: 2026-06-08
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("ai_analysis", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("posts", "ai_analysis")
