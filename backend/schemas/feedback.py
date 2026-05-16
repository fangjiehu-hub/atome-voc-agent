from datetime import datetime

from pydantic import BaseModel


class FeedbackCreate(BaseModel):
    object_type: str
    object_id: int
    field_name: str
    original_value: str | None = None
    corrected_value: str | None = None
    reason: str | None = None


class FeedbackOut(BaseModel):
    id: int
    object_type: str
    object_id: int
    field_name: str
    original_value: str | None
    corrected_value: str | None
    reason: str | None
    reviewer_id: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class FeedbackListResponse(BaseModel):
    items: list[FeedbackOut]
    total: int
    page: int
    page_size: int
