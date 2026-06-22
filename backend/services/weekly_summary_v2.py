"""Weekly summary service — generates and delivers a weekly VoC summary to configured Lark groups."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

from backend.database import async_session
from backend.models.alert_delivery_config import AlertDeliveryConfig
from backend.models.alert_message import AlertMessage
from backend.models.app_settings import AppSettings
from backend.models.post import Post

# Map day name to Python weekday() value (Monday=0 … Sunday=6)
_DAY_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3,
    "Friday": 4, "Saturday": 5, "Sunday": 6,
}


async def generate_and_send_weekly_summary() -> None:
    """Generate and send the weekly summary if today is the configured day and not yet sent this week."""
    async with async_session() as db:
        # 1. Read AppSettings
        settings = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
        if not settings:
            return

        # 2. Check if weekly summaries are enabled
        if settings.weekly_summary_enabled is False:
            return

        now_utc = datetime.now(tz=timezone.utc)

        # 3. Day-of-week check — only run on the configured day
        configured_day = settings.weekly_summary_day or "Monday"
        expected_weekday = _DAY_MAP.get(configured_day, 0)
        if now_utc.weekday() != expected_weekday:
            return

        # 4. Check if we already sent a weekly_summary this week (since Monday 00:00 UTC)
        days_since_monday = now_utc.weekday()  # 0 = Monday
        week_start = (now_utc - timedelta(days=days_since_monday)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        existing = (
            await db.execute(
                select(AlertMessage).where(
                    AlertMessage.alert_type == "weekly_summary",
                    AlertMessage.generated_at >= week_start,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return

        # 5. Query posts from last 7 days
        cutoff = now_utc - timedelta(days=7)
        posts = (
            await db.execute(
                select(Post).where(Post.collected_at >= cutoff)  # newly ingested (not publish date)
            )
        ).scalars().all()

        total = len(posts)
        by_category: dict[str, int] = {}
        for p in posts:
            if p.category:
                by_category[p.category] = by_category.get(p.category, 0) + 1

        # 6. Build message body
        week_start_str = week_start.strftime("%Y-%m-%d")
        week_end_str = now_utc.strftime("%Y-%m-%d")
        lines = [
            f"Atome VoC Weekly Summary — {week_start_str} to {week_end_str}",
            f"Total posts in last 7 days: {total}",
            "",
        ]
        if by_category:
            lines.append("Breakdown by category:")
            for cat, cnt in sorted(by_category.items(), key=lambda kv: -kv[1]):
                lines.append(f"  {cat}: {cnt}")
        else:
            lines.append("No categorised posts in the last 7 days.")

        message_body = "\n".join(lines)
        title = f"VoC Weekly Summary — {week_start_str}"

        # 7. Send to each enabled Lark group webhook
        configs = (
            await db.execute(
                select(AlertDeliveryConfig).where(AlertDeliveryConfig.enabled == True)
            )
        ).scalars().all()

        lark_group_configs = [
            c for c in configs
            if c.delivery_channels and "lark_group" in c.delivery_channels and c.lark_group_webhook
        ]

        generated_at = now_utc

        if not lark_group_configs:
            skipped = AlertMessage(
                alert_type="weekly_summary",
                title=title,
                message_body=message_body,
                status="skipped",
                generated_at=generated_at,
            )
            db.add(skipped)
            await db.commit()
            return

        from backend.services.email_sender import build_alert_html, send_alert_email

        email_configs = [
            c for c in configs
            if c.delivery_channels and "email" in c.delivery_channels and c.email_address
        ]

        for config in lark_group_configs:
            alert_msg = AlertMessage(
                alert_type="weekly_summary",
                title=title,
                message_body=message_body,
                taxonomy=config.taxonomy,
                delivery_channel="lark_group",
                target_name=config.lark_group_name,
                target_id=config.lark_group_webhook,
                status="pending",
                generated_at=generated_at,
            )
            db.add(alert_msg)
            await db.flush()

            from backend.services.safe_http import safe_webhook_post
            ok, msg = await safe_webhook_post(
                config.lark_group_webhook,
                json={"msg_type": "text", "content": {"text": message_body}},
            )
            alert_msg.status = "sent" if ok else "failed"
            alert_msg.sent_at = datetime.now(tz=timezone.utc) if ok else None
            if not ok:
                alert_msg.error_message = msg[:500]

        for config in email_configs:
            alert_msg = AlertMessage(
                alert_type="weekly_summary",
                title=title,
                message_body=message_body,
                taxonomy=config.taxonomy,
                delivery_channel="email",
                target_name=config.email_address,
                target_id=config.email_address,
                status="pending",
                generated_at=generated_at,
            )
            db.add(alert_msg)
            await db.flush()

            success, err = await send_alert_email(
                to_address=config.email_address,
                subject=f"[Atome VoC] {title}",
                body_text=message_body,
                body_html=build_alert_html(
                    title=title,
                    taxonomy_label=config.taxonomy,
                    body=message_body,
                ),
            )
            alert_msg.status = "sent" if success else "failed"
            alert_msg.sent_at = datetime.now(tz=timezone.utc) if success else None
            if not success:
                alert_msg.error_message = err[:500]

        await db.commit()
