from datetime import datetime

from pydantic import BaseModel


class AlertOut(BaseModel):
    id: int
    incident_id: int | None
    post_id: int | None
    alert_type: str
    severity: str
    channel: str
    recipients: list[str] | None
    subject: str | None
    body: str | None
    delivery_status: str
    acknowledged_at: datetime | None
    sent_at: datetime | None
    created_at: datetime
    source_url: str | None = None
    source_created_at: datetime | None = None
    source_author: str | None = None

    model_config = {"from_attributes": True}


class AlertListResponse(BaseModel):
    items: list[AlertOut]
    total: int
    page: int
    page_size: int
