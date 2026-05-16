"""Design-doc mandated endpoints: POST /save, GET /query."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Select, and_, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.post import Post
from backend.schemas.post import (
    PostListResponse,
    PostOut,
    PostSave,
    PostSaveBatch,
)

router = APIRouter(prefix="/api/monitor", tags=["monitor"])


@router.post("/save", response_model=dict)
async def save_posts(batch: PostSaveBatch, db: AsyncSession = Depends(get_db)):
    """Upsert crawled posts. ON CONFLICT (platform, brand, post_id) DO NOTHING."""
    inserted = 0
    for p in batch.posts:
        stmt = (
            insert(Post)
            .values(
                platform=p.platform.value,
                brand=p.brand,
                post_id=p.post_id,
                url=p.url,
                author_handle=p.author_handle,
                content_text=p.content_text,
                created_at=p.created_at,
                collected_at=datetime.utcnow(),
                engagement_likes=p.engagement_likes,
                engagement_replies=p.engagement_replies,
                engagement_reposts=p.engagement_reposts,
                raw_json=p.raw_json,
            )
            .on_conflict_do_nothing(constraint="uq_platform_brand_post")
        )
        result = await db.execute(stmt)
        if result.rowcount > 0:
            inserted += 1
    await db.commit()
    return {"inserted": inserted, "total": len(batch.posts)}


@router.get("/query", response_model=PostListResponse)
async def query_posts(
    platform: str | None = None,
    category: str | None = None,
    severity: str | None = None,
    is_negative: bool | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Filter posts by platform, category, severity, is_negative, date range, search."""
    conditions = []
    if platform:
        conditions.append(Post.platform == platform)
    if category:
        conditions.append(Post.category == category)
    if severity:
        conditions.append(Post.severity == severity)
    if is_negative is not None:
        conditions.append(Post.is_negative == is_negative)
    if date_from:
        conditions.append(Post.created_at >= date_from)
    if date_to:
        conditions.append(Post.created_at <= date_to)
    if search:
        conditions.append(Post.content_text.ilike(f"%{search}%"))

    where = and_(*conditions) if conditions else True

    count_q = select(func.count()).select_from(Post).where(where)
    total = (await db.execute(count_q)).scalar() or 0

    offset = (page - 1) * page_size
    items_q = (
        select(Post)
        .where(where)
        .order_by(Post.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    rows = (await db.execute(items_q)).scalars().all()

    return PostListResponse(
        items=[PostOut.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
