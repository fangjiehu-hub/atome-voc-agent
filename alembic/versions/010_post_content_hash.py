"""010 — add content_hash to posts for LLM annotation dedup.

Lets the annotator skip re-classifying posts whose content is identical to one
already annotated (saves Claude tokens — audit / optimization request).

Revision ID: 010
Revises: 009
Create Date: 2026-06-04
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("posts", sa.Column("content_hash", sa.String(64), nullable=True))
    op.create_index("ix_posts_content_hash", "posts", ["content_hash"])


def downgrade() -> None:
    op.drop_index("ix_posts_content_hash", table_name="posts")
    op.drop_column("posts", "content_hash")
