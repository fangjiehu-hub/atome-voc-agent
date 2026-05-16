from datetime import date as date_type
from datetime import datetime, timedelta
from typing import Optional, Tuple

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert import Alert
from backend.models.incident import Incident
from backend.models.post import Post
from backend.schemas.analytics import (
    CategoryCount,
    CategoryResponse,
    ChannelResponse,
    ChannelStats,
    DrilldownPost,
    DrilldownResponse,
    KPIOverview,
    SeverityCount,
    SeverityDistribution,
    TrendPoint,
    TrendResponse,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def resolve_time_range(
    days: int = 7,
    since: Optional[date_type] = None,
    until: Optional[date_type] = None,
) -> Tuple[datetime, datetime]:
    """Return (start_dt, end_dt) from either custom dates or a preset days value.

    If ``since`` is provided, use custom range (``until`` defaults to today).
    ``until`` is inclusive — the end bound is set to the start of the next day.
    If ``since > until``, the two are swapped automatically.
    """
    if since is not None:
        end_date = until if until is not None else datetime.utcnow().date()
        start_date = since
        if start_date > end_date:
            start_date, end_date = end_date, start_date
        start_dt = datetime.combine(start_date, datetime.min.time())
        end_dt = datetime.combine(end_date + timedelta(days=1), datetime.min.time())
    else:
        end_dt = datetime.utcnow()
        start_dt = end_dt - timedelta(days=days)
    return start_dt, end_dt


@router.get("/overview", response_model=KPIOverview)
async def overview(
    days: int = Query(7, ge=1, le=90),
    since: Optional[date_type] = Query(None),
    until: Optional[date_type] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    start_dt, end_dt = resolve_time_range(days, since, until)
    time_filter = and_(Post.created_at >= start_dt, Post.created_at < end_dt)

    # Previous period (same duration, immediately before current)
    period_len = end_dt - start_dt
    prev_start = start_dt - period_len
    prev_end = start_dt
    prev_filter = and_(Post.created_at >= prev_start, Post.created_at < prev_end)

    total = (
        await db.execute(select(func.count()).select_from(Post).where(time_filter))
    ).scalar() or 0

    negative = (
        await db.execute(
            select(func.count())
            .select_from(Post)
            .where(and_(time_filter, Post.is_negative == True))
        )
    ).scalar() or 0

    inc_time_filter = and_(Incident.last_seen >= start_dt, Incident.last_seen < end_dt)
    critical_inc = (
        await db.execute(
            select(func.count())
            .select_from(Incident)
            .where(
                and_(
                    inc_time_filter,
                    Incident.severity.in_(["critical", "high"]),
                )
            )
        )
    ).scalar() or 0

    open_inc = (
        await db.execute(
            select(func.count())
            .select_from(Incident)
            .where(Incident.status.in_(["new", "acknowledged", "in_review"]))
        )
    ).scalar() or 0

    # Detect-to-alert latency: avg minutes between Incident.created_at (system detection)
    # and first Alert.created_at (alert dispatch)
    first_alert_subq = (
        select(
            Alert.incident_id,
            func.min(Alert.created_at).label("first_alert_at"),
        )
        .where(Alert.incident_id.isnot(None))
        .group_by(Alert.incident_id)
        .subquery()
    )
    latency_rows = (
        await db.execute(
            select(
                func.avg(
                    func.extract("epoch", first_alert_subq.c.first_alert_at)
                    - func.extract("epoch", Incident.created_at)
                ).label("avg_seconds")
            )
            .select_from(Incident)
            .join(first_alert_subq, Incident.id == first_alert_subq.c.incident_id)
            .where(inc_time_filter)
        )
    ).scalar()
    avg_latency_min = round(latency_rows / 60, 1) if latency_rows and latency_rows > 0 else None

    # Previous period stats
    prev_total = (
        await db.execute(select(func.count()).select_from(Post).where(prev_filter))
    ).scalar() or 0

    prev_negative = (
        await db.execute(
            select(func.count())
            .select_from(Post)
            .where(and_(prev_filter, Post.is_negative == True))
        )
    ).scalar() or 0

    prev_inc_filter = and_(Incident.last_seen >= prev_start, Incident.last_seen < prev_end)
    prev_critical_inc = (
        await db.execute(
            select(func.count())
            .select_from(Incident)
            .where(
                and_(
                    prev_inc_filter,
                    Incident.severity.in_(["critical", "high"]),
                )
            )
        )
    ).scalar() or 0

    # Previous period open incidents (created in prev period, currently still open)
    prev_open_inc = (
        await db.execute(
            select(func.count())
            .select_from(Incident)
            .where(
                and_(
                    prev_inc_filter,
                    Incident.status.in_(["new", "acknowledged", "in_review"]),
                )
            )
        )
    ).scalar() or 0

    # Previous period latency
    prev_latency_rows = (
        await db.execute(
            select(
                func.avg(
                    func.extract("epoch", first_alert_subq.c.first_alert_at)
                    - func.extract("epoch", Incident.created_at)
                ).label("avg_seconds")
            )
            .select_from(Incident)
            .join(first_alert_subq, Incident.id == first_alert_subq.c.incident_id)
            .where(prev_inc_filter)
        )
    ).scalar()
    prev_avg_latency_min = round(prev_latency_rows / 60, 1) if prev_latency_rows and prev_latency_rows > 0 else None

    return KPIOverview(
        total_mentions=total,
        negative_complaints=negative,
        negative_pct=round(negative / total * 100, 1) if total else 0,
        critical_incidents=critical_inc,
        open_incidents=open_inc,
        avg_detect_to_alert_min=avg_latency_min,
        prev_total_mentions=prev_total,
        prev_negative_pct=round(prev_negative / prev_total * 100, 1) if prev_total else 0,
        prev_critical_incidents=prev_critical_inc,
        prev_open_incidents=prev_open_inc,
        prev_avg_detect_to_alert_min=prev_avg_latency_min,
    )


@router.get("/trend", response_model=TrendResponse)
async def trend(
    days: int = Query(7, ge=1, le=90),
    since: Optional[date_type] = Query(None),
    until: Optional[date_type] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    start_dt, end_dt = resolve_time_range(days, since, until)
    time_filter = and_(Post.created_at >= start_dt, Post.created_at < end_dt)
    date_col = func.date(Post.created_at)

    rows = (
        await db.execute(
            select(
                date_col.label("date"),
                func.count().label("total"),
                func.count().filter(Post.severity == "critical").label("critical"),
                func.count().filter(Post.severity == "high").label("high"),
                func.count().filter(Post.severity == "medium").label("medium"),
                func.count().filter(Post.severity == "low").label("low"),
                func.count().filter(Post.severity == "none").label("none_sev"),
            )
            .where(time_filter)
            .group_by(date_col)
            .order_by(date_col)
        )
    ).all()

    # Build lookup from DB rows
    data_by_date = {
        str(r.date): TrendPoint(
            date=str(r.date),
            total=r.total,
            critical=r.critical,
            high=r.high,
            medium=r.medium,
            low=r.low,
            none=r.none_sev,
        )
        for r in rows
    }

    # Fill all days in the range (including zeros)
    start_date = start_dt.date() if isinstance(start_dt, datetime) else start_dt
    end_date = end_dt.date() if isinstance(end_dt, datetime) else end_dt
    num_days = (end_date - start_date).days
    points = []
    for i in range(num_days):
        d = start_date + timedelta(days=i)
        ds = str(d)
        if ds in data_by_date:
            points.append(data_by_date[ds])
        else:
            points.append(TrendPoint(date=ds, total=0, critical=0, high=0, medium=0, low=0, none=0))

    return TrendResponse(points=points)


@router.get("/categories", response_model=CategoryResponse)
async def categories(
    days: int = Query(7, ge=1, le=90),
    since: Optional[date_type] = Query(None),
    until: Optional[date_type] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    start_dt, end_dt = resolve_time_range(days, since, until)
    time_filter = and_(Post.created_at >= start_dt, Post.created_at < end_dt)
    rows = (
        await db.execute(
            select(Post.category, func.count().label("cnt"))
            .where(and_(time_filter, Post.category.isnot(None)))
            .group_by(Post.category)
            .order_by(func.count().desc())
        )
    ).all()

    total = sum(r.cnt for r in rows) or 1
    return CategoryResponse(
        items=[
            CategoryCount(category=r.category, count=r.cnt, pct=round(r.cnt / total * 100, 1))
            for r in rows
        ]
    )


@router.get("/channels", response_model=ChannelResponse)
async def channels(
    days: int = Query(7, ge=1, le=90),
    since: Optional[date_type] = Query(None),
    until: Optional[date_type] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    start_dt, end_dt = resolve_time_range(days, since, until)
    time_filter = and_(Post.created_at >= start_dt, Post.created_at < end_dt)
    rows = (
        await db.execute(
            select(
                Post.platform,
                func.count().label("total"),
                func.count().filter(Post.is_negative == True).label("negative"),
            )
            .where(time_filter)
            .group_by(Post.platform)
        )
    ).all()

    return ChannelResponse(
        items=[
            ChannelStats(platform=r.platform, total=r.total, negative=r.negative) for r in rows
        ]
    )


@router.get("/severity-distribution", response_model=SeverityDistribution)
async def severity_distribution(
    days: int = Query(7, ge=1, le=90),
    since: Optional[date_type] = Query(None),
    until: Optional[date_type] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    start_dt, end_dt = resolve_time_range(days, since, until)
    time_filter = and_(Post.created_at >= start_dt, Post.created_at < end_dt)
    rows = (
        await db.execute(
            select(Post.severity, func.count().label("cnt"))
            .where(and_(time_filter, Post.severity.isnot(None)))
            .group_by(Post.severity)
        )
    ).all()

    total = sum(r.cnt for r in rows) or 1
    return SeverityDistribution(
        items=[
            SeverityCount(severity=r.severity, count=r.cnt, pct=round(r.cnt / total * 100, 1))
            for r in rows
        ],
        total=total,
    )


@router.get("/drilldown", response_model=DrilldownResponse)
async def drilldown(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
):
    """Drill down into a specific date to understand what drove the volume."""
    target = date_type.fromisoformat(date)
    day_start = datetime.combine(target, datetime.min.time())
    day_end = day_start + timedelta(days=1)

    date_filter = and_(Post.created_at >= day_start, Post.created_at < day_end)

    # Total count
    total = (
        await db.execute(select(func.count()).select_from(Post).where(date_filter))
    ).scalar() or 0

    # By category
    cat_rows = (
        await db.execute(
            select(Post.category, func.count().label("cnt"))
            .where(and_(date_filter, Post.category.isnot(None)))
            .group_by(Post.category)
            .order_by(func.count().desc())
        )
    ).all()
    cat_total = sum(r.cnt for r in cat_rows) or 1
    by_category = [
        CategoryCount(category=r.category, count=r.cnt, pct=round(r.cnt / cat_total * 100, 1))
        for r in cat_rows
    ]

    # By severity
    sev_rows = (
        await db.execute(
            select(Post.severity, func.count().label("cnt"))
            .where(and_(date_filter, Post.severity.isnot(None)))
            .group_by(Post.severity)
        )
    ).all()
    sev_total = sum(r.cnt for r in sev_rows) or 1
    by_severity = [
        SeverityCount(severity=r.severity, count=r.cnt, pct=round(r.cnt / sev_total * 100, 1))
        for r in sev_rows
    ]

    # By platform
    plat_rows = (
        await db.execute(
            select(Post.platform, func.count().label("cnt"))
            .where(date_filter)
            .group_by(Post.platform)
        )
    ).all()
    by_platform = [{"platform": r.platform, "count": r.cnt} for r in plat_rows]

    # Top posts sorted by severity rank then engagement
    severity_rank = case(
        {"critical": 0, "high": 1, "medium": 2, "low": 3},
        value=Post.severity,
        else_=4,
    )
    top_posts_rows = (
        await db.execute(
            select(Post)
            .where(date_filter)
            .order_by(severity_rank, (Post.engagement_likes + Post.engagement_replies).desc())
            .limit(10)
        )
    ).scalars().all()

    top_posts = [
        DrilldownPost(
            id=p.id,
            platform=p.platform,
            url=p.url,
            author_handle=p.author_handle,
            severity=p.severity,
            category=p.category,
            summary=p.summary,
            content_text=p.content_text,
            engagement_likes=p.engagement_likes,
            engagement_replies=p.engagement_replies,
            engagement_reposts=p.engagement_reposts,
            created_at=p.created_at.isoformat() if p.created_at else None,
        )
        for p in top_posts_rows
    ]

    return DrilldownResponse(
        date=date,
        total=total,
        by_category=by_category,
        by_severity=by_severity,
        by_platform=by_platform,
        top_posts=top_posts,
    )
