"""LLM annotation pipeline using Claude Sonnet. Batch 8 posts per call."""

import json
import logging
from datetime import datetime

from anthropic import AsyncAnthropic
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from backend.config import settings
from backend.database import async_session
from backend.models.post import Post
from backend.services.llm_prompts import BATCH_USER_TEMPLATE, SYSTEM_PROMPT, format_posts_block
from backend.services.severity_calculator import apply_severity_overrides

logger = logging.getLogger(__name__)

BATCH_SIZE = 8


async def annotate_unannotated_posts(limit: int = 100):
    """Find and annotate posts that haven't been classified yet."""
    async with async_session() as db:
        rows = (
            await db.execute(
                select(Post)
                .where(
                    and_(
                        Post.annotated_at.is_(None),
                        Post.content_text.isnot(None),
                    )
                )
                .order_by(Post.collected_at.desc())
                .limit(limit)
            )
        ).scalars().all()

        if not rows:
            logger.info("No unannotated posts found")
            return 0

        # Process in batches
        annotated = 0
        for i in range(0, len(rows), BATCH_SIZE):
            batch = rows[i : i + BATCH_SIZE]
            try:
                results = await _classify_batch(batch)
                await _apply_results(db, batch, results)
                annotated += len(batch)
            except Exception:
                logger.exception("Batch annotation failed, retrying individually")
                for post in batch:
                    try:
                        results = await _classify_batch([post])
                        await _apply_results(db, [post], results)
                        annotated += 1
                    except Exception:
                        logger.exception(f"Individual annotation failed for post {post.id}")

        await db.commit()
        logger.info(f"Annotated {annotated} posts")
        return annotated


async def _classify_batch(posts: list[Post]) -> list[dict]:
    """Call Claude Sonnet to classify a batch of posts."""
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    posts_data = [
        {
            "platform": p.platform,
            "author_handle": p.author_handle or "anonymous",
            "content_text": p.content_text or "",
            "engagement_likes": p.engagement_likes,
            "engagement_replies": p.engagement_replies,
            "engagement_reposts": p.engagement_reposts,
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
    # Extract JSON from response (handle markdown code blocks)
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()

    return json.loads(text)


async def _apply_results(db: AsyncSession, posts: list[Post], results: list[dict]):
    """Apply LLM results to post records, with severity overrides."""
    for post, result in zip(posts, results):
        post.is_negative = result.get("is_negative", False)
        post.category = result.get("category", "not_negative")
        post.sub_issues = result.get("sub_issues", [])
        post.language = result.get("language", "en")
        post.summary = result.get("summary", "")

        # Apply rule-based severity overrides
        llm_severity = result.get("severity", "none")
        post.severity = apply_severity_overrides(
            llm_severity=llm_severity,
            category=post.category,
            engagement_likes=post.engagement_likes,
            engagement_replies=post.engagement_replies,
            engagement_reposts=post.engagement_reposts,
        )
        post.ai_explanation = (
            f"LLM severity: {llm_severity}, final: {post.severity}. "
            f"Category: {post.category}, Sub-issues: {post.sub_issues}"
        )
        post.annotated_at = datetime.utcnow()
