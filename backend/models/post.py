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
    raw_json: Mapped[dict | None] = mapped_column(JSONB)

    # AI annotation fields
    is_negative: Mapped[bool | None] = mapped_column(Boolean)
    category: Mapped[str | None] = mapped_column(String(50))
    sub_issues: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    severity: Mapped[str | None] = mapped_column(String(20))  # none/low/medium/high/critical
    language: Mapped[str | None] = mapped_column(String(5))  # en/tl/mixed
    summary: Mapped[str | None] = mapped_column(Text)
    ai_explanation: Mapped[str | None] = mapped_column(Text)
    annotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Relations
    incident_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("incidents.id"))
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False)
