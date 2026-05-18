"""Cluster annotated posts into incidents (design-aligned).

Two-layer approach so /api/v2 (design) and /api (legacy) both work:

1. Per-post `cluster_id_str` — slug derived from cluster_topic (LLM output) +
   category. Posts that share a topic end up in the same cluster_id_str. This is
   what the design's "issue clusters" surface uses.

2. Legacy `incidents` table — still populated by grouping cluster_id_str rows so
   the older /api/incidents endpoints keep returning data during transition.
"""

import logging
import re
from datetime import datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.models.incident import Incident
from backend.models.post import Post
from backend.services.engagement_calculator import (
    LEVEL_HIGH,
    LEVEL_MEDIUM,
    legacy_severity,
)

logger = logging.getLogger(__name__)


_SLUG_RE = re.compile(r"[^a-z0-9]+")


def make_cluster_id(category: str | None, topic: str | None) -> str:
    """Stable slug used to group posts that share an LLM-detected topic.

    Combines category + first few topic words so two unrelated topics with
    similar wording don't collide. Falls back to category if topic missing.
    Total length kept under 64 chars to fit posts.cluster_id_str column.
    """
    cat = (category or "uncategorized").lower()
    base = (topic or "").lower().strip()
    base = _SLUG_RE.sub("-", base).strip("-")
    if not base:
        return f"{cat}__general"
    # Reserve room for "<cat>__" prefix; cap remaining at 56 chars total.
    max_total = 60
    prefix = f"{cat}__"
    budget = max_total - len(prefix)
    if budget < 8:
        # Category itself is huge — use first 8 chars of base regardless
        budget = 8
    if len(base) > budget:
        # Keep whole leading words up to the budget
        kept = []
        used = 0
        for word in base.split("-"):
            if used + len(word) + (1 if kept else 0) > budget:
                break
            kept.append(word)
            used += len(word) + (1 if len(kept) > 1 else 0)
        if not kept:
            kept = [base[:budget]]
        base = "-".join(kept)
    return f"{prefix}{base}"


async def cluster_posts(lookback_hours: int = 48):
    """Assign cluster_id_str to every annotated negative post, then update incidents.

    Runs in two passes:
      Pass A — compute & write cluster_id_str on each post (idempotent).
      Pass B — sync incidents table from cluster_id_str groups (for legacy API).
    """
    async with async_session() as db:
        cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

        # ── Pass A: per-post cluster_id_str ─────────────────────────────────
        posts = (
            await db.execute(
                select(Post)
                .where(
                    and_(
                        Post.annotated_at.isnot(None),
                        Post.is_negative == True,
                        Post.created_at >= cutoff,
                    )
                )
                .order_by(Post.created_at)
            )
        ).scalars().all()

        if not posts:
            logger.info("No posts to cluster")
            return 0

        for p in posts:
            p.cluster_id_str = make_cluster_id(p.category, p.cluster_topic)

        await db.flush()

        # ── Pass B: incidents table from cluster_id_str groups ──────────────
        # Reuse cluster_id_str as a deterministic key for the legacy incident.
        groups: dict[str, list[Post]] = {}
        for p in posts:
            groups.setdefault(p.cluster_id_str, []).append(p)

        now = datetime.utcnow()
        today_prefix = f"INC-{now.strftime('%Y-%m%d')}-"
        max_code = (
            await db.execute(
                select(func.max(Incident.incident_code)).where(
                    Incident.incident_code.like(f"{today_prefix}%")
                )
            )
        ).scalar()
        next_seq = 1
        if max_code:
            try:
                next_seq = int(max_code.split("-")[-1]) + 1
            except ValueError:
                next_seq = 1

        incidents_created = 0
        for cluster_id, group_posts in groups.items():
            sample = group_posts[0]
            platforms = sorted({p.platform for p in group_posts})

            # Find existing open incident sharing the cluster slug (we encode it
            # in the title's bracketed prefix `[cluster:<slug>]`).
            existing = (
                await db.execute(
                    select(Incident).where(
                        and_(
                            Incident.title.like(f"%[cluster:{cluster_id}]%"),
                            Incident.last_seen >= cutoff,
                            Incident.status.in_(["new", "acknowledged", "in_review"]),
                        )
                    )
                )
            ).scalar_one_or_none()

            # Aggregate cluster stats
            max_level = max(
                (p.engagement_level or "Low" for p in group_posts),
                key=lambda lv: {"Low": 0, "Medium": 1, "High": 2}.get(lv, 0),
            )
            sev = legacy_severity(max_level, escalate=(max_level == LEVEL_HIGH))
            topic = sample.cluster_topic or sample.category or "Issue cluster"
            earliest = min((p.created_at or now) for p in group_posts)
            latest = max((p.created_at or now) for p in group_posts)

            if existing:
                # Re-link any posts that weren't in this incident yet
                for p in group_posts:
                    p.incident_id = existing.id
                existing.post_count = len(group_posts)
                existing.first_seen = min(existing.first_seen or earliest, earliest)
                existing.last_seen = max(existing.last_seen or latest, latest)
                existing.severity = sev
                existing.platforms = platforms
                existing.summary = sample.summary or existing.summary
            else:
                code = f"{today_prefix}{next_seq:02d}"
                next_seq += 1
                incident = Incident(
                    incident_code=code,
                    title=f"{topic} [cluster:{cluster_id}]",
                    summary=sample.summary or f"{len(group_posts)} mentions about {sample.category}",
                    category=sample.category,
                    severity=sev,
                    platforms=platforms,
                    post_count=len(group_posts),
                    first_seen=earliest,
                    last_seen=latest,
                    status="new",
                )
                db.add(incident)
                await db.flush()
                for p in group_posts:
                    p.incident_id = incident.id
                incidents_created += 1

        await db.commit()
        logger.info(
            "Clustered %d posts into %d new + %d updated incidents",
            len(posts), incidents_created, len(groups) - incidents_created,
        )
        return incidents_created
