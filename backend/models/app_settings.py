"""Singleton row holding app-wide config aligned with the Claude Design import.

There is always exactly one row (id = 1). It controls:
  - engagement_thresholds: {"lowMax": int, "mediumMax": int} (engagement → Low/Medium/High)
  - sensitive_keywords: list[str] (any mention containing these → Escalation flag)
  - ownership: dict[category_key, owner_name] (override taxonomy.primary_owner)
  - display defaults (market / source / time window)
"""
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Integer, String, func
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
    # Schedule configuration — daily alert
    daily_alert_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True, server_default="true")
    daily_alert_time: Mapped[str | None] = mapped_column(String(10), nullable=True, server_default="09:00")
    daily_alert_timezone: Mapped[str | None] = mapped_column(String(50), nullable=True, server_default="Asia/Singapore")

    # Schedule configuration — weekly summary
    weekly_summary_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True, server_default="true")
    weekly_summary_day: Mapped[str | None] = mapped_column(String(20), nullable=True, server_default="Monday")
    weekly_summary_time: Mapped[str | None] = mapped_column(String(10), nullable=True, server_default="09:00")
    weekly_summary_timezone: Mapped[str | None] = mapped_column(String(50), nullable=True, server_default="Asia/Singapore")

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
