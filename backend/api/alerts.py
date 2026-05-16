from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert import Alert
from backend.models.incident import Incident
from backend.models.post import Post
from backend.schemas.alert import AlertListResponse, AlertOut

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    channel: str | None = None,
    severity: str | None = None,
    delivery_status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if channel:
        conditions.append(Alert.channel == channel)
    if severity:
        conditions.append(Alert.severity == severity)
    if delivery_status:
        conditions.append(Alert.delivery_status == delivery_status)

    from sqlalchemy import and_

    where = and_(*conditions) if conditions else True
    total = (await db.execute(select(func.count()).select_from(Alert).where(where))).scalar() or 0

    offset = (page - 1) * page_size
    rows = (
        (
            await db.execute(
                select(Alert)
                .where(where)
                .order_by(Alert.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    items = []
    for r in rows:
        out = AlertOut.model_validate(r)
        # Attach source post info via incident
        if r.incident_id:
            first_post = (
                await db.execute(
                    select(Post)
                    .where(Post.incident_id == r.incident_id)
                    .order_by(Post.created_at.asc())
                    .limit(1)
                )
            ).scalar_one_or_none()
            if first_post:
                out.source_url = first_post.url
                out.source_created_at = first_post.created_at
                out.source_author = first_post.author_handle
        items.append(out)

    return AlertListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{alert_id}/ack", response_model=AlertOut)
async def acknowledge_alert(alert_id: int, db: AsyncSession = Depends(get_db)):
    alert = (await db.execute(select(Alert).where(Alert.id == alert_id))).scalar_one_or_none()
    if not alert:
        raise HTTPException(404, "Alert not found")

    alert.acknowledged_at = datetime.utcnow()
    await db.commit()
    await db.refresh(alert)
    return AlertOut.model_validate(alert)
