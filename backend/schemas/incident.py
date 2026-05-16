from datetime import datetime

from pydantic import BaseModel


class IncidentOut(BaseModel):
    id: int
    incident_code: str
    title: str
    summary: str | None
    category: str | None
    severity: str
    platforms: list[str] | None
    post_count: int
    first_seen: datetime | None
    last_seen: datetime | None
    trend_pct: float | None
    status: str
    assigned_to: int | None
    assigned_dept: str | None
    created_at: datetime
    updated_at: datetime
    source_url: str | None = None
    source_created_at: datetime | None = None
    source_author: str | None = None

    model_config = {"from_attributes": True}


class IncidentUpdate(BaseModel):
    status: str | None = None
    severity: str | None = None
    assigned_to: int | None = None
    assigned_dept: str | None = None
    title: str | None = None
    summary: str | None = None


class IncidentListResponse(BaseModel):
    items: list[IncidentOut]
    total: int
    page: int
    page_size: int
