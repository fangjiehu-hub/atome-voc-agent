from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AlertDeliveryConfig(Base):
    """Per-category alert delivery configuration.

    Controls where VoC alerts are sent (Lark group webhook and/or owner DM)
    when a post matching a taxonomy category crosses the priority threshold.
    """

    __tablename__ = "alert_delivery_configs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # One config per taxonomy category key (e.g. "fraud", "transaction")
    taxonomy: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)

    # Owner DM settings
    primary_owner_name: Mapped[str | None] = mapped_column(String(100))
    primary_owner_lark_open_id: Mapped[str | None] = mapped_column(String(100))

    # Lark group channel settings
    lark_group_name: Mapped[str | None] = mapped_column(String(200))
    lark_group_webhook: Mapped[str | None] = mapped_column(Text)

    # Which channels are active for this config: ["lark_group", "owner_dm"]
    delivery_channels: Mapped[list[str] | None] = mapped_column(ARRAY(String))

    # Routing / cooldown logic
    priority_threshold: Mapped[str] = mapped_column(String(20), default="High")
    cooldown_hours: Mapped[int] = mapped_column(Integer, default=24)

    # Delivery telemetry
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_delivery_status: Mapped[str | None] = mapped_column(String(20))

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
