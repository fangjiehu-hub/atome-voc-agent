"""Correction log: every reviewer-applied change to an AI-classified mention.

Maps to the design's CorrectionLogPage. Replaces the older `feedback` table for
this specific flow (feedback remains for free-form reviewer comments).
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Correction(Base):
    __tablename__ = "corrections"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    mention_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # category | owner | not_relevant | duplicate | comment
    correction_type: Mapped[str] = mapped_column(String(30), nullable=False)
    original_category: Mapped[str | None] = mapped_column(String(50))
    corrected_category: Mapped[str | None] = mapped_column(String(50))
    original_owner: Mapped[str | None] = mapped_column(String(100))
    corrected_owner: Mapped[str | None] = mapped_column(String(100))
    linked_cluster_id: Mapped[str | None] = mapped_column(String(64))
    comment: Mapped[str | None] = mapped_column(Text)
    reviewer_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
