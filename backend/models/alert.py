from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    incident_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("incidents.id"))
    post_id: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("posts.id"))
    alert_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # immediate / queue / digest
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    channel: Mapped[str] = mapped_column(String(30), nullable=False)  # slack / lark / email
    recipients: Mapped[list[str] | None] = mapped_column(ARRAY(String))
    subject: Mapped[str | None] = mapped_column(String(500))
    body: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict | None] = mapped_column(JSONB)
    delivery_status: Mapped[str] = mapped_column(
        String(30), default="pending"
    )  # pending/sent/failed
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    acknowledged_by: Mapped[int | None] = mapped_column(BigInteger, ForeignKey("users.id"))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
