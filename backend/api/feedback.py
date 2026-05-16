from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.feedback import Feedback
from backend.schemas.feedback import FeedbackCreate, FeedbackListResponse, FeedbackOut

router = APIRouter(prefix="/api/feedback", tags=["feedback"])


@router.get("", response_model=FeedbackListResponse)
async def list_feedback(
    object_type: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    conditions = []
    if object_type:
        conditions.append(Feedback.object_type == object_type)

    from sqlalchemy import and_

    where = and_(*conditions) if conditions else True
    total = (await db.execute(select(func.count()).select_from(Feedback).where(where))).scalar() or 0

    offset = (page - 1) * page_size
    rows = (
        (
            await db.execute(
                select(Feedback)
                .where(where)
                .order_by(Feedback.created_at.desc())
                .offset(offset)
                .limit(page_size)
            )
        )
        .scalars()
        .all()
    )
    return FeedbackListResponse(
        items=[FeedbackOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("", response_model=FeedbackOut)
async def create_feedback(fb: FeedbackCreate, db: AsyncSession = Depends(get_db)):
    record = Feedback(**fb.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return FeedbackOut.model_validate(record)
