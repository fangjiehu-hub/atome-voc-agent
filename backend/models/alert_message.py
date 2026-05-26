"""AlertMessage — record of every alert sent (or attempted) by the scheduler."""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AlertMessage(Base):
    """Persisted record of a generated and/or delivered alert message.

    alert_type: "daily_alert", "weekly_summary", or "post_alert"
    status:     "pending", "sent", "failed", or "skipped"
    """

    __tablename__ = "alert_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # What kind of alert
    alert_type: Mapped[str] = mapped_column(String(30), nullable=False)

    # Content
    title: Mapped[str | None] = mapped_column(String(500), nullable=True)
    message_body: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Optional taxonomy association for post-level or per-category alerts
    taxonomy: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Related IDs for traceability
    related_incident_ids: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    related_post_ids: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)

    # Delivery target info
    delivery_channel: Mapped[str | None] = mapped_column(String(30), nullable=True)  # "lark_group" | "owner_dm"
    target_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(500), nullable=True)  # webhook URL or Lark open_id

    # Delivery status
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Timestamps
    generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
