"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-04-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("department", sa.String(100), nullable=True),
        sa.Column("role", sa.String(50), server_default="viewer", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )

    # Incidents
    op.create_table(
        "incidents",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("incident_code", sa.String(30), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("severity", sa.String(20), server_default="low", nullable=False),
        sa.Column("platforms", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("post_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trend_pct", sa.Float(), nullable=True),
        sa.Column("status", sa.String(30), server_default="new", nullable=False),
        sa.Column("assigned_to", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_dept", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("incident_code"),
    )

    # Posts
    op.create_table(
        "posts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("platform", sa.String(20), nullable=False),
        sa.Column("brand", sa.String(50), server_default="atome_ph", nullable=False),
        sa.Column("post_id", sa.String(255), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("author_handle", sa.String(255), nullable=True),
        sa.Column("content_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("engagement_likes", sa.Integer(), server_default="0"),
        sa.Column("engagement_replies", sa.Integer(), server_default="0"),
        sa.Column("engagement_reposts", sa.Integer(), server_default="0"),
        sa.Column("raw_json", postgresql.JSONB(), nullable=True),
        sa.Column("is_negative", sa.Boolean(), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("sub_issues", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("severity", sa.String(20), nullable=True),
        sa.Column("language", sa.String(5), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("ai_explanation", sa.Text(), nullable=True),
        sa.Column("annotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("incident_id", sa.BigInteger(), sa.ForeignKey("incidents.id"), nullable=True),
        sa.Column("is_reviewed", sa.Boolean(), server_default="false"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("platform", "brand", "post_id", name="uq_platform_brand_post"),
    )

    # Alerts
    op.create_table(
        "alerts",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("incident_id", sa.BigInteger(), sa.ForeignKey("incidents.id"), nullable=True),
        sa.Column("post_id", sa.BigInteger(), sa.ForeignKey("posts.id"), nullable=True),
        sa.Column("alert_type", sa.String(30), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("channel", sa.String(30), nullable=False),
        sa.Column("recipients", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("subject", sa.String(500), nullable=True),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=True),
        sa.Column("delivery_status", sa.String(30), server_default="pending"),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("acknowledged_by", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # Feedback
    op.create_table(
        "feedback",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("object_type", sa.String(30), nullable=False),
        sa.Column("object_id", sa.BigInteger(), nullable=False),
        sa.Column("field_name", sa.String(50), nullable=False),
        sa.Column("original_value", sa.Text(), nullable=True),
        sa.Column("corrected_value", sa.Text(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("reviewer_id", sa.BigInteger(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # Taxonomy categories
    op.create_table(
        "taxonomy_categories",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(20), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )

    # Taxonomy sub-issues
    op.create_table(
        "taxonomy_sub_issues",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(50), nullable=False),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("category_key", sa.String(50), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )

    # Routing rules
    op.create_table(
        "routing_rules",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("severity_min", sa.String(20), server_default="low"),
        sa.Column("departments", postgresql.ARRAY(sa.String()), nullable=False),
        sa.Column("escalate_to", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("channels", postgresql.ARRAY(sa.String()), server_default="{}"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )

    # Indexes
    op.create_index("ix_posts_platform_brand", "posts", ["platform", "brand"])
    op.create_index("ix_posts_category", "posts", ["category"])
    op.create_index("ix_posts_severity", "posts", ["severity"])
    op.create_index("ix_posts_created_at", "posts", ["created_at"])
    op.create_index("ix_posts_incident_id", "posts", ["incident_id"])
    op.create_index("ix_incidents_status", "incidents", ["status"])
    op.create_index("ix_incidents_severity", "incidents", ["severity"])
    op.create_index("ix_alerts_incident_id", "alerts", ["incident_id"])


def downgrade() -> None:
    op.drop_table("routing_rules")
    op.drop_table("taxonomy_sub_issues")
    op.drop_table("taxonomy_categories")
    op.drop_table("feedback")
    op.drop_table("alerts")
    op.drop_table("posts")
    op.drop_table("incidents")
    op.drop_table("users")
