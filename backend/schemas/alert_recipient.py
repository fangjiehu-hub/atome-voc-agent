from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel


class AlertRecipientCreate(BaseModel):
    channel: Literal["email", "lark_group"]
    target: str           # email address OR webhook URL
    label: Optional[str] = None
    enabled: bool = True


class AlertRecipientUpdate(BaseModel):
    target: Optional[str] = None
    label: Optional[str] = None
    enabled: Optional[bool] = None


class AlertRecipientOut(BaseModel):
    id: int
    channel: str
    label: Optional[str] = None
    target: str
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertRecipientListResponse(BaseModel):
    items: list[AlertRecipientOut]
    total: int
