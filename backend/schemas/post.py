from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class Platform(str, Enum):
    twitter = "twitter"
    reddit = "reddit"


class Severity(str, Enum):
    none = "none"
    low = "low"
    medium = "medium"
    high = "high"
    critical = "critical"


class Category(str, Enum):
    fraud = "fraud"
    transaction = "transaction"
    refund = "refund"
    spend_limit = "spend_limit"
    account = "account"
    security = "security"
    app_bug = "app_bug"
    customer_service = "customer_service"
    debt_collection = "debt_collection"
    interest_rate = "interest_rate"
    not_negative = "not_negative"


class PostSave(BaseModel):
    platform: Platform
    brand: str = "atome_ph"
    post_id: str
    url: str | None = None
    author_handle: str | None = None
    content_text: str | None = None
    created_at: datetime | None = None
    engagement_likes: int = 0
    engagement_replies: int = 0
    engagement_reposts: int = 0
    raw_json: dict | None = None


class PostSaveBatch(BaseModel):
    posts: list[PostSave]


class PostQuery(BaseModel):
    platform: Platform | None = None
    category: Category | None = None
    severity: Severity | None = None
    is_negative: bool | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    search: str | None = None
    page: int = 1
    page_size: int = 20


class PostOut(BaseModel):
    id: int
    platform: str
    brand: str
    post_id: str
    url: str | None
    author_handle: str | None
    content_text: str | None
    created_at: datetime | None
    collected_at: datetime
    engagement_likes: int
    engagement_replies: int
    engagement_reposts: int
    is_negative: bool | None
    category: str | None
    sub_issues: list[str] | None
    severity: str | None
    language: str | None
    summary: str | None
    ai_explanation: str | None
    annotated_at: datetime | None
    incident_id: int | None
    is_reviewed: bool

    model_config = {"from_attributes": True}


class PostListResponse(BaseModel):
    items: list[PostOut]
    total: int
    page: int
    page_size: int
