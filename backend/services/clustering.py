"""Basic clustering: group posts by category + platform + 48h window into incidents."""

import logging
from datetime import datetime, timedelta

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import async_session
from backend.models.incident import Incident
from backend.models.post import Post
from backend.services.severity_calculator import SEVERITY_ORDER, severity_index

logger = logging.getLogger(__name__)


async def cluster_posts(lookback_hours: int = 48):
    """
    Group classified-but-unassigned posts into incidents.
    Logic: same category + platform within the lookback window = same incident.
    """
    async with async_session() as db:
        cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

        # Find annotated posts without incident assignment
        unassigned = (
            await db.execute(
                select(Post)
                .where(
                    and_(
                        Post.annotated_at.isnot(None),
                        Post.incident_id.is_(None),
                        Post.is_negative == True,
                        Post.created_at >= cutoff,
                    )
                )
                .order_by(Post.created_at)
            )
        ).scalars().all()

        if not unassigned:
            logger.info("No posts to cluster")
            return 0

        # Group by (category, platform)
        groups: dict[tuple[str, str], list[Post]] = {}
        for post in unassigned:
            key = (post.category or "unknown", post.platform)
            groups.setdefault(key, []).append(post)

        # Find the highest incident code number for today
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
        for (category, platform), posts in groups.items():
            # Check for existing open incident with same category+platform in window
            existing = (
                await db.execute(
                    select(Incident).where(
                        and_(
                            Incident.category == category,
                            Incident.platforms.contains([platform]),
                            Incident.last_seen >= cutoff,
                            Incident.status.in_(["new", "acknowledged", "in_review"]),
                        )
                    )
                )
            ).scalar_one_or_none()

            if existing:
                # Add posts to existing incident
                for post in posts:
                    post.incident_id = existing.id
                existing.post_count += len(posts)
                earliest = min(p.created_at or datetime.utcnow() for p in posts)
                latest = max(p.created_at or datetime.utcnow() for p in posts)
                existing.first_seen = min(existing.first_seen, earliest)
                existing.last_seen = max(existing.last_seen, latest)
                # Recalculate severity based on cluster size
                _update_incident_severity(existing)
            else:
                # Create new incident
                code = f"{today_prefix}{next_seq:02d}"
                next_seq += 1
                first_post = posts[0]
                best_severity = max(
                    (severity_index(p.severity or "none") for p in posts),
                    default=0,
                )

                incident = Incident(
                    incident_code=code,
                    title=_generate_title(category, platform, len(posts)),
                    summary=posts[0].summary if posts[0].summary else f"{len(posts)} complaints about {category} on {platform}",
                    category=category,
                    severity=SEVERITY_ORDER[best_severity],
                    platforms=[platform],
                    post_count=len(posts),
                    first_seen=first_post.created_at or now,
                    last_seen=max(p.created_at or now for p in posts),
                    status="new",
                )
                db.add(incident)
                await db.flush()

                for post in posts:
                    post.incident_id = incident.id

                incidents_created += 1

        await db.commit()
        logger.info(f"Clustered {len(unassigned)} posts into {incidents_created} new incidents")
        return incidents_created


def _generate_title(category: str, platform: str, count: int) -> str:
    """Generate a human-readable incident title."""
    cat_labels = {
        "fraud": "Fraud/Scam Reports",
        "transaction": "Transaction Failures",
        "refund": "Refund Issues",
        "spend_limit": "Spend Limit Complaints",
        "account": "Account Access Issues",
        "security": "Security Concerns",
        "app_bug": "App Bug Reports",
        "customer_service": "Customer Service Complaints",
        "debt_collection": "Debt Collection Complaints",
        "interest_rate": "Interest Rate/Fee Issues",
    }
    label = cat_labels.get(category, category.replace("_", " ").title())
    return f"[{platform.upper()}] {label} ({count} posts)"


def _update_incident_severity(incident: Incident):
    """Bump severity if cluster is growing."""
    if incident.post_count > 10:
        current = severity_index(incident.severity)
        incident.severity = SEVERITY_ORDER[max(current, severity_index("high"))]
    if incident.post_count > 25:
        incident.severity = "critical"
