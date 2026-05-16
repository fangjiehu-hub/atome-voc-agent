from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class RoutingRule(Base):
    __tablename__ = "routing_rules"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    severity_min: Mapped[str] = mapped_column(
        String(20), default="low"
    )  # route only if severity >= this
    primary_owner: Mapped[str] = mapped_column(
        String(100), nullable=False, default=""
    )  # single accountable team
    departments: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)  # secondary stakeholders
    escalate_to: Mapped[list[str] | None] = mapped_column(
        ARRAY(String)
    )  # extra recipients on critical
    channels: Mapped[list[str]] = mapped_column(
        ARRAY(String), default=["slack"]
    )  # slack/lark/email
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
