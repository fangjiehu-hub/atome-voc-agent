from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.incident import Incident
from backend.models.post import Post
from backend.schemas.incident import IncidentListResponse, IncidentOut, IncidentUpdate
from backend.schemas.post import PostOut

router = APIRouter(prefix="/api/incidents", tags=["incidents"])


@router.get("", response_model=IncidentListResponse)
async def list_incidents(
    status: str | None = None,
    severity: str | None = None,
    category: str | None = None,
    days: int | None = Query(None, ge=1, le=90),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if days:
        since = datetime.utcnow() - timedelta(days=days)
        conditions.append(Incident.last_seen >= since)
    if status:
        conditions.append(Incident.status == status)
    if severity:
        conditions.append(Incident.severity == severity)
    if category:
        conditions.append(Incident.category == category)

    where = and_(*conditions) if conditions else True
    total = (await db.execute(select(func.count()).select_from(Incident).where(where))).scalar() or 0

    # Sort by severity priority (critical first), then post count (bigger clusters first), then recency
    severity_rank = case(
        {"critical": 0, "high": 1, "medium": 2, "low": 3},
        value=Incident.severity,
        else_=4,
    )

    offset = (page - 1) * page_size
    rows = (
        (
            await db.execute(
                select(Incident)
                .where(where)
                .order_by(severity_rank, Incident.post_count.desc(), Incident.last_seen.desc())
                .offset(offset)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )

    # Attach source post info (first post by created_at) for each incident
    items = []
    for inc in rows:
        out = IncidentOut.model_validate(inc)
        first_post = (
            await db.execute(
                select(Post)
                .where(Post.incident_id == inc.id)
                .order_by(Post.created_at.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if first_post:
            out.source_url = first_post.url
            out.source_created_at = first_post.created_at
            out.source_author = first_post.author_handle
        items.append(out)

    return IncidentListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{incident_id}", response_model=dict)
async def get_incident(incident_id: int, db: AsyncSession = Depends(get_db)):
    inc = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if not inc:
        raise HTTPException(404, "Incident not found")

    post_severity_rank = case(
        {"critical": 0, "high": 1, "medium": 2, "low": 3},
        value=Post.severity,
        else_=4,
    )
    posts = (
        (await db.execute(
            select(Post)
            .where(Post.incident_id == incident_id)
            .order_by(post_severity_rank, Post.created_at.desc())
        ))
        .scalars()
        .all()
    )
    return {
        "incident": IncidentOut.model_validate(inc),
        "posts": [PostOut.model_validate(p) for p in posts],
    }


@router.patch("/{incident_id}", response_model=IncidentOut)
async def update_incident(
    incident_id: int, update: IncidentUpdate, db: AsyncSession = Depends(get_db)
):
    inc = (await db.execute(select(Incident).where(Incident.id == incident_id))).scalar_one_or_none()
    if not inc:
        raise HTTPException(404, "Incident not found")

    for field, value in update.model_dump(exclude_none=True).items():
        setattr(inc, field, value)
    await db.commit()
    await db.refresh(inc)
    return IncidentOut.model_validate(inc)
