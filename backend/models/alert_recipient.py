from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class AlertRecipient(Base):
    """A single alert destination — an email address or a Lark group webhook.

    High-engagement posts are pushed to every enabled recipient. Managed as two
    lists (email / lark_group) in Admin → Alert Setting.
    """

    __tablename__ = "alert_recipients"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    channel: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # email | lark_group
    label: Mapped[str | None] = mapped_column(String(200))
    target: Mapped[str] = mapped_column(Text, nullable=False)  # email address OR webhook URL
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
