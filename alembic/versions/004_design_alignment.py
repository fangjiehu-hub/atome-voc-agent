"""Align schema to Claude Design import (engagement model, 13-cat taxonomy,
app_settings, corrections)

Revision ID: 004
Revises: 003
Create Date: 2026-05-18
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Category set per design's data.js TAXONOMY (13 keys)
TAXONOMY_SEED = [
    ("collections",       "Collections",           "Collection",        "Collection Review",      True,
     "Repayment chasing, SMS / call tone, agency conduct.",
     ["aggressive SMS", "threatening calls", "harassment", "legal action threats"],
     "Collections conduct is always reviewed by Compliance."),
    ("customer_service",  "Customer Service",      "Customer Services", "Monitor / Review",      False,
     "Generic CS complaints — slow reply, unhelpful agent.",
     ["long wait", "no reply", "rude agent", "ticket ignored"],
     "Only when public agent-name callouts."),
    ("bayad",             "Bayad",                 "Customer Services", "Monitor / Review",      False,
     "Issues paying via Bayad Center or partner outlets.",
     ["Bayad declined", "partner refused", "receipt not posted"],
     "Only if a partner outage is suspected."),
    ("transaction",       "Transaction",           "Customer Services", "Monitor / Review",      False,
     "Failed, duplicate, or stuck transactions.",
     ["payment declined", "duplicate charge", "GCash failed"],
     "Only when systemic."),
    ("card_delivery",     "Card Delivery",         "Customer Services", "Monitor / Review",      False,
     "Card not delivered, lost in transit, wrong address.",
     ["not delivered", "no card yet", "courier", "wrong address"],
     "Only on >14d SLA breach."),
    ("fees",              "Fees",                  "Product",           "Monitor / Review",      False,
     "Late fees, hidden fees, interest, fee transparency.",
     ["hidden fees", "overcharged", "late fee", "interest too high"],
     "Only at high engagement."),
    ("payment",           "Payment",               "Customer Services", "Monitor / Review",      False,
     "Refunds, repayment failures, posting delays.",
     ["refund delayed", "repayment failed", "showing unpaid"],
     "Only on systemic posting delays."),
    ("card_application",  "Card Application",      "Product",           "Monitor / Review",      False,
     "Application stuck, KYC rejected, approval delays.",
     ["application stuck", "KYC failed", "no decision"],
     "Only when KYC policy is publicly cited."),
    ("limit_increase",    "Limit Increase",        "Risk",              "Monitor / Review",      False,
     "Limit too low, denied increase, surprise reduction.",
     ["limit too low", "limit cut", "increase denied"],
     "Only on viral limit-cut threads."),
    ("card_binding",      "Card Binding",          "Product",           "Monitor / Review",      False,
     "Linking the card to wallets / merchants / app.",
     ["can't bind", "won't link", "Apple Pay fail", "wallet error"],
     "Only when partner-side is implicated."),
    ("otp",               "OTP",                   "Marketing",         "Monitor / Review",      False,
     "OTP not arriving, delayed, or suspected-phish OTP messages.",
     ["OTP not received", "OTP delayed", "fake OTP"],
     "Only on suspected phishing pattern."),
    ("user_review",       "User Review",           "Marketing",         "Monitor / Review",      False,
     "Public ratings, reviews, influencer commentary.",
     ["1 star", "would not recommend", "influencer thread"],
     "Only on viral negative influencer post."),
    ("fraud",             "Fraud / Unauthorized",  "Risk",              "Risk Review (always)",  True,
     "Unauthorized transactions, account takeover, phishing claims.",
     ["unauthorized", "fraud", "scam", "stolen", "account takeover", "phishing"],
     "Fraud cases are always escalated for review."),
]

DEFAULT_OWNERSHIP = {row[0]: row[2] for row in TAXONOMY_SEED}
DEFAULT_SENSITIVE_KEYWORDS = ["fraud", "unauthorized", "scam", "phishing", "regulator", "BSP"]
DEFAULT_THRESHOLDS = {"lowMax": 20, "mediumMax": 100}


def upgrade() -> None:
    # ── posts: engagement model fields ───────────────────────────────────
    op.add_column("posts", sa.Column("engagement_comments", sa.Integer(), server_default="0", nullable=False))
    op.add_column("posts", sa.Column("engagement_score",    sa.Integer(), server_default="0", nullable=False))
    op.add_column("posts", sa.Column("engagement_level",    sa.String(20), nullable=True))
    op.add_column("posts", sa.Column("mention_status",      sa.String(30), server_default="New", nullable=False))
    op.add_column("posts", sa.Column("cluster_topic",       sa.Text(), nullable=True))
    op.add_column("posts", sa.Column("cluster_id_str",      sa.String(64), nullable=True))
    op.add_column("posts", sa.Column("primary_owner",       sa.String(100), nullable=True))
    op.create_index("ix_posts_cluster_id_str", "posts", ["cluster_id_str"])
    op.create_index("ix_posts_engagement_level", "posts", ["engagement_level"])
    op.create_index("ix_posts_mention_status", "posts", ["mention_status"])

    # Backfill engagement_score = sum of existing engagement columns; level stays NULL
    # (re-annotation pass will compute level via app_settings).
    op.execute("""
        UPDATE posts SET engagement_score =
            COALESCE(engagement_likes, 0) +
            COALESCE(engagement_replies, 0) +
            COALESCE(engagement_reposts, 0) +
            COALESCE(engagement_comments, 0)
    """)

    # ── taxonomy_categories: add design fields ───────────────────────────
    op.add_column("taxonomy_categories", sa.Column("primary_owner",   sa.String(100), nullable=True))
    op.add_column("taxonomy_categories", sa.Column("signals",         ARRAY(sa.String), nullable=True))
    op.add_column("taxonomy_categories", sa.Column("default_action",  sa.String(80),  nullable=True))
    op.add_column("taxonomy_categories", sa.Column("escalation_flag", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("taxonomy_categories", sa.Column("escalation_note", sa.Text(), nullable=True))

    # Wipe legacy categories and seed the 13 from design
    op.execute("DELETE FROM taxonomy_categories")
    op.execute("ALTER SEQUENCE taxonomy_categories_id_seq RESTART WITH 1")
    bind = op.get_bind()
    for sort_idx, (key, label, owner, default_action, esc_flag, desc, signals, esc_note) in enumerate(TAXONOMY_SEED):
        # Use psycopg/asyncpg-friendly array param to avoid quote-escaping bugs
        # (e.g. signal "can't bind" was breaking the ARRAY['...'] literal).
        bind.execute(
            sa.text("""
                INSERT INTO taxonomy_categories
                  (key, label, description, color, sort_order, is_active, primary_owner,
                   signals, default_action, escalation_flag, escalation_note)
                VALUES
                  (:key, :label, :desc, NULL, :sort, true, :owner,
                   CAST(:signals AS varchar[]), :action, :esc_flag, :esc_note)
            """),
            dict(
                key=key, label=label, desc=desc, sort=sort_idx, owner=owner,
                signals=list(signals), action=default_action,
                esc_flag=esc_flag, esc_note=esc_note,
            ),
        )

    # ── app_settings (singleton) ─────────────────────────────────────────
    op.create_table(
        "app_settings",
        sa.Column("id",                    sa.Integer(), primary_key=True),  # always 1
        sa.Column("engagement_thresholds", JSONB(), nullable=False),
        sa.Column("sensitive_keywords",    ARRAY(sa.String), nullable=False, server_default="{}"),
        sa.Column("ownership",             JSONB(), nullable=False),
        sa.Column("default_market",        sa.String(20), nullable=False, server_default="PH"),
        sa.Column("default_source",        sa.String(50), nullable=False, server_default="X + Reddit"),
        sa.Column("default_time_window",   sa.String(10), nullable=False, server_default="7d"),
        sa.Column("updated_at",            sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("id = 1", name="ck_app_settings_singleton"),
    )

    import json
    bind.execute(
        sa.text("""
            INSERT INTO app_settings
              (id, engagement_thresholds, sensitive_keywords, ownership)
            VALUES
              (1, CAST(:thresholds AS jsonb), CAST(:keywords AS varchar[]), CAST(:ownership AS jsonb))
        """),
        dict(
            thresholds=json.dumps(DEFAULT_THRESHOLDS),
            keywords=list(DEFAULT_SENSITIVE_KEYWORDS),
            ownership=json.dumps(DEFAULT_OWNERSHIP),
        ),
    )

    # ── corrections (replaces old `feedback` for design's correction flow) ──
    op.create_table(
        "corrections",
        sa.Column("id",                 sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column("mention_id",         sa.BigInteger(), sa.ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("correction_type",    sa.String(30), nullable=False),  # category | owner | not_relevant | duplicate | comment
        sa.Column("original_category",  sa.String(50), nullable=True),
        sa.Column("corrected_category", sa.String(50), nullable=True),
        sa.Column("original_owner",     sa.String(100), nullable=True),
        sa.Column("corrected_owner",    sa.String(100), nullable=True),
        sa.Column("linked_cluster_id",  sa.String(64), nullable=True),
        sa.Column("comment",            sa.Text(), nullable=True),
        sa.Column("reviewer_id",        sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at",         sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("corrections")
    op.drop_table("app_settings")
    op.drop_column("taxonomy_categories", "escalation_note")
    op.drop_column("taxonomy_categories", "escalation_flag")
    op.drop_column("taxonomy_categories", "default_action")
    op.drop_column("taxonomy_categories", "signals")
    op.drop_column("taxonomy_categories", "primary_owner")
    op.drop_index("ix_posts_mention_status", table_name="posts")
    op.drop_index("ix_posts_engagement_level", table_name="posts")
    op.drop_index("ix_posts_cluster_id_str", table_name="posts")
    op.drop_column("posts", "primary_owner")
    op.drop_column("posts", "cluster_id_str")
    op.drop_column("posts", "cluster_topic")
    op.drop_column("posts", "mention_status")
    op.drop_column("posts", "engagement_level")
    op.drop_column("posts", "engagement_score")
    op.drop_column("posts", "engagement_comments")
