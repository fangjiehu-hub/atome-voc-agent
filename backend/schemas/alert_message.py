"""Pydantic v2 output schemas for AlertMessage."""
from datetime import datetime

from pydantic import BaseModel


class AlertMessageOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    alert_type: str
    title: str | None
    message_body: str | None
    taxonomy: str | None
    related_incident_ids: list[int] | None
    related_post_ids: list[int] | None
    delivery_channel: str | None
    target_name: str | None
    target_id: str | None
    status: str
    error_message: str | None
    generated_at: datetime | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AlertMessageListResponse(BaseModel):
    items: list[AlertMessageOut]
    total: int
