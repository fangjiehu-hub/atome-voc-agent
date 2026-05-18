"""LLM annotation pipeline using Claude Sonnet. Batch 8 posts per call.

Aligned with the Claude Design import: writes engagement_score / engagement_level,
mention_status, cluster_topic, and primary_owner; keeps the legacy `severity`
column populated for backward compat.
"""

import json
import logging
from datetime import datetime

from anthropic import AsyncAnthropic
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import async_session
from backend.models.app_settings import AppSettings
from backend.models.post import Post
from backend.models.taxonomy import TaxonomyCategory
from backend.services.engagement_calculator import (
    engagement_level,
    engagement_score,
    is_sensitive_text,
    legacy_severity,
    should_escalate,
)
from backend.services.llm_prompts import (
    BATCH_USER_TEMPLATE,
    SYSTEM_PROMPT,
    format_posts_block,
)

logger = logging.getLogger(__name__)

BATCH_SIZE = 8

# Valid category keys (must match taxonomy_categories.key seeded in migration 004)
VALID_CATEGORIES = {
    "collections", "customer_service", "bayad", "transaction", "card_delivery",
    "fees", "payment", "card_application", "limit_increase", "card_binding",
    "otp", "user_review", "fraud",
}
FALLBACK_CATEGORY = "customer_service"


async def _load_app_context(db: AsyncSession) -> tuple[dict, list[str], dict[str, TaxonomyCategory]]:
    """Pull engagement thresholds, sensitive keywords, and the taxonomy lookup.

    Returns (thresholds, sensitive_keywords, taxonomy_by_key).
    """
    settings_row = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
    thresholds = settings_row.engagement_thresholds if settings_row else {"lowMax": 20, "mediumMax": 100}
    keywords = list(settings_row.sensitive_keywords) if settings_row else []
    ownership_override = settings_row.ownership if settings_row else {}

    tax_rows = (await db.execute(select(TaxonomyCategory))).scalars().all()
    tax_by_key = {t.key: t for t in tax_rows}
    # Apply settings.ownership override on top of taxonomy.primary_owner
    for key, owner in (ownership_override or {}).items():
        if key in tax_by_key:
            tax_by_key[key].primary_owner = owner

    return thresholds, keywords, tax_by_key


async def annotate_unannotated_posts(limit: int = 100):
    """Find and annotate posts that haven't been classified yet."""
    return await _annotate_posts(only_unannotated=True, limit=limit)


async def reannotate_all_posts(limit: int = 500):
    """Re-classify ALL posts, including ones already annotated under the old schema.

    Used after migration 004 to backfill engagement_level / cluster_topic /
    primary_owner / mention_status on existing rows.
    """
    return await _annotate_posts(only_unannotated=False, limit=limit)


async def _annotate_posts(only_unannotated: bool, limit: int) -> int:
    async with async_session() as db:
        query = select(Post).where(Post.content_text.isnot(None))
        if only_unannotated:
            query = query.where(Post.annotated_at.is_(None))
        rows = (await db.execute(query.order_by(Post.collected_at.desc()).limit(limit))).scalars().all()

        if not rows:
            logger.info("No posts to annotate (only_unannotated=%s)", only_unannotated)
            return 0

        thresholds, keywords, tax_by_key = await _load_app_context(db)

        annotated = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            try:
                results = await _classify_batch(batch)
                _apply_results(batch, results, thresholds, keywords, tax_by_key)
                annotated += len(batch)
            except Exception:
                logger.exception("Batch annotation failed, retrying individually")
                for post in batch:
                    try:
                        results = await _classify_batch([post])
                        _apply_results([post], results, thresholds, keywords, tax_by_key)
                        annotated += 1
                    except Exception:
                        logger.exception("Individual annotation failed for post %s", post.id)

        await db.commit()
        logger.info("Annotated %d posts (only_unannotated=%s)", annotated, only_unannotated)
        return annotated


async def _classify_batch(posts: list[Post]) -> list[dict]:
    """Call Claude Sonnet to classify a batch of posts."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    posts_data = [
        {
            "platform": p.platform,
            "author_handle": p.author_handle or "anonymous",
            "content_text": p.content_text or "",
        }
        for p in posts
    ]

    posts_block = format_posts_block(posts_data)
    user_msg = BATCH_USER_TEMPLATE.format(posts_block=posts_block)

    response = await client.messages.create(
        model=settings.llm_model,
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    text = response.content[0].text.strip()
    # Strip optional markdown fences (```json ... ``` or ``` ... ```)
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    return json.loads(text)


def _apply_results(
    posts: list[Post],
    results: list[dict],
    thresholds: dict,
    sensitive_keywords: list[str],
    tax_by_key: dict[str, TaxonomyCategory],
):
    """Write LLM output + computed engagement/escalation fields onto each post row."""
    for post, result in zip(posts, results):
        # 1. Category (validated against the taxonomy)
        cat = result.get("category", FALLBACK_CATEGORY)
        if cat not in VALID_CATEGORIES:
            logger.warning("Post %s: LLM returned unknown category %r, using %r", post.id, cat, FALLBACK_CATEGORY)
            cat = FALLBACK_CATEGORY
        post.category = cat
        tax = tax_by_key.get(cat)

        # 2. Engagement (computed deterministically, NOT from LLM)
        score = engagement_score(
            likes=post.engagement_likes,
            replies=post.engagement_replies,
            reposts=post.engagement_reposts,
            comments=post.engagement_comments or 0,
        )
        level = engagement_level(score, thresholds)
        post.engagement_score = score
        post.engagement_level = level

        # 3. Owner (from taxonomy, can be overridden per-mention via correction)
        if not post.primary_owner:  # don't clobber a human correction
            post.primary_owner = tax.primary_owner if tax else None

        # 4. Escalation + legacy severity
        sensitive_hit = is_sensitive_text(post.content_text, sensitive_keywords)
        escalate = should_escalate(
            level=level,
            category_escalation_flag=bool(tax and tax.escalation_flag),
            sensitive_text_hit=sensitive_hit,
        )
        post.severity = legacy_severity(level, escalate)  # kept for old /api endpoints

        # 5. Status — only set on first annotation; preserve human-set values
        if post.mention_status in (None, "", "New"):
            post.mention_status = "New"

        # 6. Other LLM fields
        post.is_negative = result.get("is_negative", False)
        post.cluster_topic = (result.get("cluster_topic") or "").strip()[:240] or None
        post.language = result.get("language", "en")
        post.summary = result.get("summary", "")
        post.sub_issues = result.get("sub_issues", [])  # legacy field, optional

        post.ai_explanation = (
            f"engagement={score} ({level}); owner={post.primary_owner}; "
            f"escalate={escalate} (cat_flag={bool(tax and tax.escalation_flag)}, "
            f"sensitive_text={sensitive_hit})"
        )
        post.annotated_at = datetime.utcnow()
