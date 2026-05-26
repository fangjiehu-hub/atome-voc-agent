from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AlertDeliveryConfigBase(BaseModel):
    enabled: bool = True
    taxonomy: str
    primary_owner_name: Optional[str] = None
    primary_owner_lark_open_id: Optional[str] = None
    lark_group_name: Optional[str] = None
    lark_group_webhook: Optional[str] = None
    delivery_channels: Optional[list[str]] = None
    priority_threshold: str = "High"
    cooldown_hours: int = 24


class AlertDeliveryConfigCreate(AlertDeliveryConfigBase):
    pass


class AlertDeliveryConfigUpdate(BaseModel):
    """All fields optional — PATCH-style partial update."""

    enabled: Optional[bool] = None
    primary_owner_name: Optional[str] = None
    primary_owner_lark_open_id: Optional[str] = None
    lark_group_name: Optional[str] = None
    lark_group_webhook: Optional[str] = None
    delivery_channels: Optional[list[str]] = None
    priority_threshold: Optional[str] = None
    cooldown_hours: Optional[int] = None


class AlertDeliveryConfigOut(AlertDeliveryConfigBase):
    id: int
    last_triggered_at: Optional[datetime] = None
    last_delivery_status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertDeliveryConfigListResponse(BaseModel):
    items: list[AlertDeliveryConfigOut]
    total: int
