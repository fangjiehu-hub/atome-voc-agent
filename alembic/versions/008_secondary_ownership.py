"""008 — add secondary_ownership to app_settings (server-global CC teams).

Revision ID: 008
Revises: 007
Create Date: 2026-05-29
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Default CC-team mapping (mirrors lark_alert.SECONDARY_TEAMS / frontend SECONDARY_TEAMS_MAP).
# Seeded so the server returns real defaults instead of an empty object on first load.
_DEFAULT_SECONDARY = {
    "collections":       ["Risk"],
    "customer_service":  ["Product"],
    "bayad":             ["Customer Services"],
    "transaction":       ["Risk"],
    "card_delivery":     ["Product"],
    "fees":              ["Customer Services"],
    "payment":           ["Risk"],
    "card_application":  ["Customer Services"],
    "limit_increase":    ["Product", "Customer Services"],
    "card_binding":      ["Customer Services"],
    "otp":               ["Product"],
    "user_review":       ["Customer Services"],
    "fraud":             ["Legal", "Collection"],
}


def upgrade() -> None:
    op.add_column(
        "app_settings",
        sa.Column("secondary_ownership", postgresql.JSONB(), nullable=True),
    )
    # Seed the singleton row (id = 1) with the default CC-team map.
    # Pass the dict directly — JSONB bindparam serializes it (do NOT pre-dumps).
    op.execute(
        sa.text("UPDATE app_settings SET secondary_ownership = :val WHERE id = 1").bindparams(
            sa.bindparam("val", _DEFAULT_SECONDARY, type_=postgresql.JSONB())
        )
    )


def downgrade() -> None:
    op.drop_column("app_settings", "secondary_ownership")
