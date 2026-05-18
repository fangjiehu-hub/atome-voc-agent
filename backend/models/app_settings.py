"""Singleton row holding app-wide config aligned with the Claude Design import.

There is always exactly one row (id = 1). It controls:
  - engagement_thresholds: {"lowMax": int, "mediumMax": int} (engagement → Low/Medium/High)
  - sensitive_keywords: list[str] (any mention containing these → Escalation flag)
  - ownership: dict[category_key, owner_name] (override taxonomy.primary_owner)
  - display defaults (market / source / time window)
"""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AppSettings(Base):
    __tablename__ = "app_settings"
    __table_args__ = (CheckConstraint("id = 1", name="ck_app_settings_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    engagement_thresholds: Mapped[dict] = mapped_column(JSONB, nullable=False)
    sensitive_keywords: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    ownership: Mapped[dict] = mapped_column(JSONB, nullable=False)
    default_market: Mapped[str] = mapped_column(String(20), default="PH", server_default="PH")
    default_source: Mapped[str] = mapped_column(String(50), default="X + Reddit", server_default="X + Reddit")
    default_time_window: Mapped[str] = mapped_column(String(10), default="7d", server_default="7d")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
