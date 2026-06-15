from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Post(Base):
    __tablename__ = "posts"
    __table_args__ = (
        UniqueConstraint("platform", "brand", "post_id", name="uq_platform_brand_post"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    platform: Mapped[str] = mapped_column(String(20), nullable=False)  # twitter | reddit
    brand: Mapped[str] = mapped_column(String(50), nullable=False, default="atome_ph")
    post_id: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str | None] = mapped_column(Text)
    author_handle: Mapped[str | None] = mapped_column(String(255))
    content_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    engagement_likes: Mapped[int] = mapped_column(Integer, default=0)
    engagement_replies: Mapped[int] = mapped_column(Integer, default=0)
    engagement_reposts: Mapped[int] = mapped_column(Integer, default=0)
    engagement_comments: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    # Cached sum (likes + replies + reposts + comments). Recomputed at annotate time.
    engagement_score: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    engagement_level: Mapped[str | None] = mapped_column(String(20))  # Low / Medium / High
    raw_json: Mapped[dict | None] = mapped_column(JSONB)

    # AI annotation fields
    is_negative: Mapped[bool | None] = mapped_column(Boolean)
    category: Mapped[str | None] = mapped_column(String(50))
    sub_issues: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    severity: Mapped[str | None] = mapped_column(String(20))  # legacy: none/low/medium/high/critical
    language: Mapped[str | None] = mapped_column(String(5))  # en/tl/mixed
    summary: Mapped[str | None] = mapped_column(Text)
    ai_explanation: Mapped[str | None] = mapped_column(Text)
    # Octo Agent's AI impact/analysis text (from the Lark Bitable sync).
    ai_analysis: Mapped[str | None] = mapped_column(Text)
    annotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # SHA-256 of normalized content_text — lets the annotator reuse a prior
    # annotation for identical content instead of re-calling the LLM.
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    # Design-aligned per-mention fields
    # New | In Review | Actioned | Closed | Rejected | Not Relevant | Duplicate
    mention_status: Mapped[str] = mapped_column(String(30), default="New", server_default="New")
    # Per-cluster grouping (free-form string id like "fees_apr"). Topic is the
    # human-readable issue title shared across the cluster.
    cluster_topic: Mapped[str | None] = mapped_column(Text)
    cluster_id_str: Mapped[str | None] = mapped_column(String(64))
    # Override of taxonomy's primary_owner (per-mention correction).
    primary_owner: Mapped[str | None] = mapped_column(String(100))

    # Alert workflow fields (added migration 005)
    # Not triggered | Triggered | Acknowledged | Resolved
    alert_status: Mapped[str] = mapped_column(String(30), default="Not triggered", server_default="Not triggered")
    alert_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relations
    incident_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("incidents.id"))
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
