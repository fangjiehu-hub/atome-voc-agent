from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.database import Base


class LarkBot(Base):
    __tablename__ = "lark_bots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    team_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    webhook_url: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(String(300), default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
