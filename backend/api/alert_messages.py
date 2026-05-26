"""/api/v2/alert-messages — query the alert message log."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, nullslast, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert_message import AlertMessage
from backend.schemas.alert_message import AlertMessageListResponse, AlertMessageOut

router = APIRouter(prefix="/api/v2/alert-messages", tags=["alert-messages"])


@router.get("", response_model=AlertMessageListResponse)
async def list_alert_messages(
    db: AsyncSession = Depends(get_db),
    alert_type: str | None = Query(None, description="Filter by alert_type: daily_alert, weekly_summary, post_alert"),
    limit: int = Query(50, le=500),
    offset: int = 0,
):
    """List alert messages ordered by generated_at DESC (nulls last), then created_at DESC."""
    q = select(AlertMessage)
    if alert_type:
        q = q.where(AlertMessage.alert_type == alert_type)

    # Count total (before pagination)
    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Fetch page
    q = q.order_by(
        nullslast(AlertMessage.generated_at.desc()),
        AlertMessage.created_at.desc(),
    ).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()

    return AlertMessageListResponse(
        items=[AlertMessageOut.model_validate(r) for r in rows],
        total=total,
    )


@router.get("/{message_id}", response_model=AlertMessageOut)
async def get_alert_message(message_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single alert message by ID."""
    row = (await db.execute(select(AlertMessage).where(AlertMessage.id == message_id))).scalar_one_or_none()
    if not row:
        raise HTTPException(404, f"AlertMessage {message_id} not found")
    return AlertMessageOut.model_validate(row)
