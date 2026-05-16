from pydantic import BaseModel


class KPIOverview(BaseModel):
    total_mentions: int
    negative_complaints: int
    negative_pct: float
    critical_incidents: int
    open_incidents: int
    avg_detect_to_alert_min: float | None
    # Previous period comparisons
    prev_total_mentions: int = 0
    prev_negative_pct: float = 0
    prev_critical_incidents: int = 0
    prev_open_incidents: int = 0
    prev_avg_detect_to_alert_min: float | None = None


class TrendPoint(BaseModel):
    date: str
    total: int
    critical: int
    high: int
    medium: int
    low: int
    none: int


class TrendResponse(BaseModel):
    points: list[TrendPoint]


class CategoryCount(BaseModel):
    category: str
    count: int
    pct: float


class CategoryResponse(BaseModel):
    items: list[CategoryCount]


class ChannelStats(BaseModel):
    platform: str
    total: int
    negative: int
    top_subreddits: list[dict] | None = None
    top_keywords: list[dict] | None = None


class ChannelResponse(BaseModel):
    items: list[ChannelStats]


class SeverityCount(BaseModel):
    severity: str
    count: int
    pct: float


class SeverityDistribution(BaseModel):
    items: list[SeverityCount]
    total: int


class DrilldownPost(BaseModel):
    id: int
    platform: str
    url: str | None
    author_handle: str | None
    severity: str | None
    category: str | None
    summary: str | None
    content_text: str | None
    engagement_likes: int
    engagement_replies: int
    engagement_reposts: int
    created_at: str | None

    model_config = {"from_attributes": True}


class DrilldownResponse(BaseModel):
    date: str
    total: int
    by_category: list[CategoryCount]
    by_severity: list[SeverityCount]
    by_platform: list[dict]
    top_posts: list[DrilldownPost]
