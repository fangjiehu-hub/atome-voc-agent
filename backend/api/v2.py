"""/api/v2 — design-aligned endpoints consumed by the Claude Design frontend.

Shape of every response matches the design's data.js so the static prototype
can swap mock data for these endpoints with minimal JS changes.

Endpoints:
    GET  /api/v2/settings      — app_settings singleton (camelCase keys)
    PATCH /api/v2/settings     — partial update
    GET  /api/v2/taxonomy      — 13-category taxonomy
    GET  /api/v2/mentions      — paginated mentions in design shape
    GET  /api/v2/clusters      — issue clusters grouped by cluster_id_str
    GET  /api/v2/overview      — Today's snapshot KPIs
    GET  /api/v2/corrections   — correction log
    POST /api/v2/corrections   — submit a correction
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.app_settings import AppSettings
from backend.models.correction import Correction
from backend.models.post import Post
from backend.models.taxonomy import TaxonomyCategory
from backend.services.engagement_calculator import (
    LEVEL_HIGH,
    LEVEL_LOW,
    LEVEL_MEDIUM,
    engagement_level,
    engagement_score,
    is_sensitive_text,
    routing_for,
    should_escalate,
)

router = APIRouter(prefix="/api/v2", tags=["v2-design"])


# ────────────────────────────────────────────────────────────────────────────
# Helpers
# ────────────────────────────────────────────────────────────────────────────

async def _get_settings(db: AsyncSession) -> AppSettings:
    row = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    if not row:
        raise HTTPException(500, "app_settings singleton missing — was migration 004 applied?")
    return row


async def _get_taxonomy_map(db: AsyncSession) -> dict[str, TaxonomyCategory]:
    rows = (await db.execute(select(TaxonomyCategory).order_by(TaxonomyCategory.sort_order))).scalars().all()
    return {t.key: t for t in rows}


def _owner_of(tax_by_key: dict[str, TaxonomyCategory], settings_row: AppSettings, category_key: str | None) -> str:
    """settings.ownership wins over taxonomy.primary_owner (design's contract)."""
    if not category_key:
        return "Unassigned"
    ownership = settings_row.ownership or {}
    if category_key in ownership:
        return ownership[category_key]
    tax = tax_by_key.get(category_key)
    return (tax.primary_owner if tax else None) or "Unassigned"


def _mention_dict(
    post: Post,
    tax_by_key: dict[str, TaxonomyCategory],
    settings_row: AppSettings,
) -> dict:
    """Reshape a Post row into the design's mention object."""
    score = post.engagement_score or engagement_score(
        post.engagement_likes, post.engagement_replies, post.engagement_reposts, post.engagement_comments or 0,
    )
    level = post.engagement_level or engagement_level(score, settings_row.engagement_thresholds)
    category = post.category
    owner = post.primary_owner or _owner_of(tax_by_key, settings_row, category)
    tax = tax_by_key.get(category or "")
    escalation_flag = bool(tax and tax.escalation_flag)
    sensitive_hit = is_sensitive_text(post.content_text, settings_row.sensitive_keywords or [])
    escalate = should_escalate(
        level=level, category_escalation_flag=escalation_flag, sensitive_text_hit=sensitive_hit,
    )
    routing = routing_for(owner=owner, level=level, category_escalation_flag=escalation_flag)
    return {
        "id": post.id,
        "clusterId": post.cluster_id_str,
        "clusterTopic": post.cluster_topic,
        "platform": post.platform,
        "author": (post.author_handle or "anonymous").lstrip("@"),
        "created": (post.created_at or post.collected_at).isoformat() if (post.created_at or post.collected_at) else None,
        "category": category,
        "likes": post.engagement_likes or 0,
        "replies": post.engagement_replies or 0,
        "reposts": post.engagement_reposts or 0,
        "comments": post.engagement_comments or 0,
        "engagement": score,
        "level": level,
        "owner": owner,
        "action": routing["action_label"],
        "actionType": routing["action_type"],
        "escalation": escalate,
        "escalationNote": _escalation_note(level, escalation_flag, sensitive_hit, category),
        "text": post.content_text,
        "status": post.mention_status or "New",
        "summary": post.summary,
        "isNegative": post.is_negative,
        "market": post.brand.replace("atome_", "").upper() if post.brand else "PH",
        "url": post.url,
    }


def _escalation_note(level: str, category_flag: bool, sensitive_hit: bool, category: str | None) -> str | None:
    if not (level == LEVEL_HIGH or category_flag or sensitive_hit):
        return None
    if category_flag and level == LEVEL_HIGH:
        return "Sensitive category at high engagement."
    if level == LEVEL_HIGH:
        return "High engagement — public visibility may amplify quickly."
    if category_flag:
        # category can be None on un-categorized posts; fall back to generic wording.
        label = (category or "").replace("_", " ").title() if category else "This"
        return f"{label} cases are sensitive by policy."
    return "Mention contains sensitive keywords."


# ────────────────────────────────────────────────────────────────────────────
# /settings
# ────────────────────────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    engagementThresholds: dict
    sensitiveKeywords: list[str]
    ownership: dict[str, str]
    defaultMarket: str
    defaultSource: str
    defaultTimeWindow: str
    updatedAt: datetime | None


class SettingsPatch(BaseModel):
    engagementThresholds: dict | None = None
    sensitiveKeywords: list[str] | None = None
    ownership: dict[str, str] | None = None
    defaultMarket: str | None = None
    defaultSource: str | None = None
    defaultTimeWindow: str | None = None


@router.get("/settings", response_model=SettingsResponse)
async def get_settings(db: AsyncSession = Depends(get_db)):
    s = await _get_settings(db)
    return SettingsResponse(
        engagementThresholds=s.engagement_thresholds,
        sensitiveKeywords=list(s.sensitive_keywords or []),
        ownership=s.ownership or {},
        defaultMarket=s.default_market,
        defaultSource=s.default_source,
        defaultTimeWindow=s.default_time_window,
        updatedAt=s.updated_at,
    )


@router.patch("/settings", response_model=SettingsResponse)
async def update_settings(patch: SettingsPatch, db: AsyncSession = Depends(get_db)):
    s = await _get_settings(db)
    if patch.engagementThresholds is not None:
        # basic validation: lowMax < mediumMax, both ≥ 0
        lm = int(patch.engagementThresholds.get("lowMax", 0))
        mm = int(patch.engagementThresholds.get("mediumMax", 0))
        if lm < 0 or mm <= lm:
            raise HTTPException(400, "engagementThresholds: need 0 ≤ lowMax < mediumMax")
        s.engagement_thresholds = {"lowMax": lm, "mediumMax": mm}
    if patch.sensitiveKeywords is not None:
        s.sensitive_keywords = [k.strip() for k in patch.sensitiveKeywords if k.strip()]
    if patch.ownership is not None:
        s.ownership = patch.ownership
    if patch.defaultMarket is not None:
        s.default_market = patch.defaultMarket
    if patch.defaultSource is not None:
        s.default_source = patch.defaultSource
    if patch.defaultTimeWindow is not None:
        s.default_time_window = patch.defaultTimeWindow
    await db.commit()
    return await get_settings(db)


# ────────────────────────────────────────────────────────────────────────────
# /taxonomy
# ────────────────────────────────────────────────────────────────────────────

@router.get("/taxonomy")
async def get_taxonomy(db: AsyncSession = Depends(get_db)):
    tax_by_key = await _get_taxonomy_map(db)
    settings_row = await _get_settings(db)
    return {
        "items": [
            {
                "key": t.key,
                "label": t.label,
                "description": t.description,
                "primaryOwner": _owner_of(tax_by_key, settings_row, t.key),
                "signals": list(t.signals or []),
                "defaultAction": t.default_action,
                "escalationFlag": bool(t.escalation_flag),
                "escalationNote": t.escalation_note,
            }
            for t in tax_by_key.values()
        ]
    }


# ────────────────────────────────────────────────────────────────────────────
# /mentions
# ────────────────────────────────────────────────────────────────────────────

@router.get("/mentions")
async def list_mentions(
    db: AsyncSession = Depends(get_db),
    category: str | None = None,
    platform: str | None = None,
    level: str | None = Query(None, pattern="^(Low|Medium|High)$"),
    status: str | None = None,
    cluster_id: str | None = Query(None, alias="clusterId"),
    limit: int = Query(200, le=500),
    offset: int = 0,
):
    q = select(Post).where(Post.annotated_at.isnot(None))
    if category:
        q = q.where(Post.category == category)
    if platform:
        q = q.where(Post.platform == platform)
    if level:
        q = q.where(Post.engagement_level == level)
    if status:
        q = q.where(Post.mention_status == status)
    if cluster_id:
        q = q.where(Post.cluster_id_str == cluster_id)
    q = q.order_by(desc(Post.engagement_score), desc(Post.created_at)).limit(limit).offset(offset)
    rows = (await db.execute(q)).scalars().all()

    tax_by_key = await _get_taxonomy_map(db)
    settings_row = await _get_settings(db)
    return {"items": [_mention_dict(p, tax_by_key, settings_row) for p in rows]}


# ────────────────────────────────────────────────────────────────────────────
# /clusters
# ────────────────────────────────────────────────────────────────────────────

@router.get("/clusters")
async def list_clusters(
    db: AsyncSession = Depends(get_db),
    only_open: bool = Query(False, alias="onlyOpen"),
):
    """Return issue clusters with aggregate stats — drives the Action Queue."""
    settings_row = await _get_settings(db)
    tax_by_key = await _get_taxonomy_map(db)

    posts = (
        await db.execute(
            select(Post).where(
                Post.cluster_id_str.isnot(None),
                Post.is_negative == True,
            ).order_by(Post.created_at.desc())
        )
    ).scalars().all()

    closed_statuses = {"Closed", "Rejected", "Not Relevant", "Duplicate"}

    groups: dict[str, list[Post]] = defaultdict(list)
    for p in posts:
        groups[p.cluster_id_str].append(p)

    items = []
    for cid, group_posts in groups.items():
        if only_open and all((p.mention_status or "New") in closed_statuses for p in group_posts):
            continue
        sample = group_posts[0]
        total_eng = sum(p.engagement_score or 0 for p in group_posts)
        level = engagement_level(total_eng, settings_row.engagement_thresholds)
        owner = _owner_of(tax_by_key, settings_row, sample.category)
        tax = tax_by_key.get(sample.category or "")
        cat_flag = bool(tax and tax.escalation_flag)
        sensitive_hit = any(
            is_sensitive_text(p.content_text, settings_row.sensitive_keywords or [])
            for p in group_posts
        )
        escalate = should_escalate(
            level=level, category_escalation_flag=cat_flag, sensitive_text_hit=sensitive_hit,
        )
        routing = routing_for(owner=owner, level=level, category_escalation_flag=cat_flag)
        platforms = sorted({p.platform for p in group_posts})
        last_seen = max((p.created_at or p.collected_at) for p in group_posts)
        open_count = sum(1 for p in group_posts if (p.mention_status or "New") not in closed_statuses)
        items.append({
            "clusterId": cid,
            "topic": sample.cluster_topic or (sample.category or "Issue cluster"),
            "category": sample.category,
            "mentionCount": len(group_posts),
            "openCount": open_count,
            "totalEngagement": total_eng,
            "level": level,
            "owner": owner,
            "action": routing["action_label"],
            "actionType": routing["action_type"],
            "escalation": escalate,
            "platforms": platforms,
            "lastSeen": last_seen.isoformat() if last_seen else None,
        })

    items.sort(key=lambda x: x["totalEngagement"], reverse=True)
    return {"items": items}


# ────────────────────────────────────────────────────────────────────────────
# /overview — Today's VoC snapshot (per design's hero card)
# ────────────────────────────────────────────────────────────────────────────

@router.get("/overview")
async def get_overview(db: AsyncSession = Depends(get_db)):
    settings_row = await _get_settings(db)
    tax_by_key = await _get_taxonomy_map(db)

    posts = (
        await db.execute(
            select(Post).where(Post.annotated_at.isnot(None))
        )
    ).scalars().all()

    closed_statuses = {"Closed", "Rejected", "Not Relevant"}

    counts_by_level = {"Low": 0, "Medium": 0, "High": 0}
    counts_by_cat: dict[str, int] = defaultdict(int)
    counts_by_owner: dict[str, int] = defaultdict(int)
    open_count = 0
    top_engagement_post: Post | None = None
    trend_by_day: dict[str, int] = defaultdict(int)

    for p in posts:
        lv = p.engagement_level or LEVEL_LOW
        counts_by_level[lv] = counts_by_level.get(lv, 0) + 1
        if p.category:
            counts_by_cat[p.category] += 1
            counts_by_owner[_owner_of(tax_by_key, settings_row, p.category)] += 1
        if (p.mention_status or "New") not in closed_statuses:
            open_count += 1
            if not top_engagement_post or (p.engagement_score or 0) > (top_engagement_post.engagement_score or 0):
                top_engagement_post = p
        if p.created_at:
            trend_by_day[p.created_at.date().isoformat()] += 1

    total = len(posts)
    top_cat = max(counts_by_cat.items(), key=lambda kv: kv[1], default=(None, 0))
    top_cat_key, top_cat_count = top_cat

    return {
        "totals": {
            "mentions": total,
            "open": open_count,
            "high": counts_by_level.get(LEVEL_HIGH, 0),
            "medium": counts_by_level.get(LEVEL_MEDIUM, 0),
            "low": counts_by_level.get(LEVEL_LOW, 0),
        },
        "topIssue": {
            "category": top_cat_key,
            "label": (tax_by_key[top_cat_key].label if top_cat_key in tax_by_key else None),
            "count": top_cat_count,
            "owner": (_owner_of(tax_by_key, settings_row, top_cat_key) if top_cat_key else None),
        },
        "topEngagement": (
            {
                "category": top_engagement_post.category,
                "label": (
                    tax_by_key[top_engagement_post.category].label
                    if top_engagement_post.category in tax_by_key else top_engagement_post.category
                ),
                "engagement": top_engagement_post.engagement_score or 0,
                "mentionId": top_engagement_post.id,
            } if top_engagement_post else None
        ),
        "byCategory": [
            {"category": k, "count": v, "label": (tax_by_key[k].label if k in tax_by_key else k),
             "owner": _owner_of(tax_by_key, settings_row, k)}
            for k, v in sorted(counts_by_cat.items(), key=lambda kv: -kv[1])
        ],
        "byOwner": [
            {"owner": k, "count": v}
            for k, v in sorted(counts_by_owner.items(), key=lambda kv: -kv[1])
        ],
        "trend": [
            {"day": d, "total": n}
            for d, n in sorted(trend_by_day.items())
        ],
    }


# ────────────────────────────────────────────────────────────────────────────
# /corrections
# ────────────────────────────────────────────────────────────────────────────

CorrectionType = Literal["category", "owner", "not_relevant", "duplicate", "comment"]


class CorrectionIn(BaseModel):
    mentionId: int
    correctionType: CorrectionType
    correctedCategory: str | None = None
    correctedOwner: str | None = None
    linkedClusterId: str | None = None
    comment: str | None = None


class CorrectionOut(BaseModel):
    id: int
    mentionId: int
    mentionText: str | None
    correctionType: str
    originalCategory: str | None
    correctedCategory: str | None
    originalOwner: str | None
    correctedOwner: str | None
    linkedClusterId: str | None
    comment: str | None
    timestamp: datetime
    updatedBy: str = "Demo user"


@router.get("/corrections")
async def list_corrections(db: AsyncSession = Depends(get_db), limit: int = Query(200, le=500)):
    rows = (
        await db.execute(
            select(Correction, Post.content_text)
            .join(Post, Post.id == Correction.mention_id, isouter=True)
            .order_by(desc(Correction.created_at))
            .limit(limit)
        )
    ).all()
    return {
        "items": [
            CorrectionOut(
                id=c.id,
                mentionId=c.mention_id,
                mentionText=(text or "")[:240],
                correctionType=c.correction_type,
                originalCategory=c.original_category,
                correctedCategory=c.corrected_category,
                originalOwner=c.original_owner,
                correctedOwner=c.corrected_owner,
                linkedClusterId=c.linked_cluster_id,
                comment=c.comment,
                timestamp=c.created_at,
            )
            for c, text in rows
        ]
    }


@router.post("/corrections", response_model=CorrectionOut)
async def create_correction(payload: CorrectionIn, db: AsyncSession = Depends(get_db)):
    post = (await db.execute(select(Post).where(Post.id == payload.mentionId))).scalar_one_or_none()
    if not post:
        raise HTTPException(404, f"mention {payload.mentionId} not found")

    settings_row = await _get_settings(db)
    tax_by_key = await _get_taxonomy_map(db)
    original_owner = post.primary_owner or _owner_of(tax_by_key, settings_row, post.category)

    correction = Correction(
        mention_id=post.id,
        correction_type=payload.correctionType,
        original_category=post.category,
        corrected_category=payload.correctedCategory,
        original_owner=original_owner,
        corrected_owner=payload.correctedOwner,
        linked_cluster_id=payload.linkedClusterId,
        comment=payload.comment,
    )
    db.add(correction)

    # Apply the correction to the post itself
    if payload.correctionType == "category" and payload.correctedCategory:
        post.category = payload.correctedCategory
        # New category implies new default owner unless user pinned one
        post.primary_owner = _owner_of(tax_by_key, settings_row, payload.correctedCategory)
    elif payload.correctionType == "owner" and payload.correctedOwner:
        post.primary_owner = payload.correctedOwner
    elif payload.correctionType == "not_relevant":
        post.mention_status = "Not Relevant"
    elif payload.correctionType == "duplicate":
        post.mention_status = "Duplicate"
        if payload.linkedClusterId:
            post.cluster_id_str = payload.linkedClusterId

    await db.commit()
    await db.refresh(correction)

    return CorrectionOut(
        id=correction.id,
        mentionId=correction.mention_id,
        mentionText=(post.content_text or "")[:240],
        correctionType=correction.correction_type,
        originalCategory=correction.original_category,
        correctedCategory=correction.corrected_category,
        originalOwner=correction.original_owner,
        correctedOwner=correction.corrected_owner,
        linkedClusterId=correction.linked_cluster_id,
        comment=correction.comment,
        timestamp=correction.created_at,
    )
