"""Daily alert service — generates and delivers a daily VoC digest."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from markupsafe import escape
from sqlalchemy import select

from backend.config import settings as app_config
from backend.database import async_session
from backend.models.alert_delivery_config import AlertDeliveryConfig
from backend.models.alert_message import AlertMessage
from backend.models.app_settings import AppSettings
from backend.models.post import Post


def _cat_label(key: str | None) -> str:
    return (key or "uncategorized").replace("_", " ").title()


def _safe_url(url: str | None) -> str | None:
    if isinstance(url, str) and url.strip().lower().startswith(("http://", "https://")):
        return url.strip()
    return None


def build_daily_digest(posts: list[Post], date_str: str, headline: str = "new posts") -> tuple[str, str, str]:
    """Return (title, text_body, html_body) for a daily VoC digest of `posts`.

    Content: overview count, by-category table, sentiment split, and the posts
    themselves (sorted by engagement) with AI summary + source link.
    """
    total = len(posts)
    by_cat: dict[str, int] = {}
    neg = pos = neu = 0
    for p in posts:
        if p.category:
            by_cat[p.category] = by_cat.get(p.category, 0) + 1
        if p.is_negative is True:
            neg += 1
        elif p.is_negative is False:
            pos += 1
        else:
            neu += 1
    cats = sorted(by_cat.items(), key=lambda kv: -kv[1])

    top = sorted(posts, key=lambda p: (p.engagement_score or 0), reverse=True)[:8]

    title = f"VoC Daily Alert — {date_str}"

    # ── plain text (Lark group) ──
    tl = [f"Atome VoC Daily Alert — {date_str}",
          f"{total} {headline} (24h)  |  Negative {neg} · Neutral {neu} · Positive {pos}", ""]
    if cats:
        tl.append("By category:")
        tl += [f"  {_cat_label(c)}: {n}" for c, n in cats]
    if top:
        tl += ["", "Top items:"]
        for p in top:
            tl.append(f"  [{_cat_label(p.category)}/{p.platform}] {(p.summary or p.content_text or '')[:140]}")
            if _safe_url(p.url):
                tl.append(f"    {p.url}")
    text_body = "\n".join(tl)

    # ── rich HTML (email) ──
    base = (app_config.frontend_base_url or "").rstrip("/")
    dash = f"{base}/design/atome-voc.html" if base else "#"

    cat_rows = "".join(
        f'<tr><td style="padding:4px 10px;border-bottom:1px solid #f0f0f0;">{escape(_cat_label(c))}</td>'
        f'<td style="padding:4px 10px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">{n}</td></tr>'
        for c, n in cats
    ) or '<tr><td style="padding:4px 10px;color:#9ca3af;">No categorised posts.</td></tr>'

    def _card(p: Post) -> str:
        text = escape((p.summary or p.content_text or "")[:240])
        url = _safe_url(p.url)
        link = (f'<a href="{escape(url)}" style="color:#2563eb;font-size:11px;text-decoration:none;">View source →</a>'
                if url else '<span style="color:#9ca3af;font-size:11px;">no link</span>')
        border, bg = ("#fecaca", "#fef2f2") if p.is_negative is True else ("#e5e7eb", "#f9fafb")
        return (
            f'<div style="border:1px solid {border};background:{bg};border-radius:8px;padding:10px 12px;margin-bottom:8px;">'
            f'<div style="font-size:11px;color:#991b1b;font-weight:700;margin-bottom:3px;">'
            f'{escape(_cat_label(p.category))} · {escape((p.platform or "").title())} · eng {p.engagement_score or 0}</div>'
            f'<div style="font-size:12.5px;color:#374151;line-height:1.5;">{text}</div>'
            f'<div style="margin-top:4px;">{link}</div></div>'
        )

    cards = "".join(_card(p) for p in top) or '<div style="color:#9ca3af;font-size:12px;">No notable items.</div>'

    html_body = f"""
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f5f5;margin:0;padding:20px;">
<div style="max-width:640px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
  <div style="background:#141c30;padding:22px 28px;">
    <div style="color:#f0ff5f;font-size:18px;font-weight:700;">Atome VoC — Daily Alert</div>
    <div style="color:rgba(255,255,255,.6);font-size:13px;margin-top:2px;">{escape(date_str)}</div>
  </div>
  <div style="padding:24px 28px;">
    <div style="font-size:14px;color:#111;margin-bottom:14px;">
      <strong>{total}</strong> {escape(headline)} in the last 24h
    </div>
    <div style="font-size:12.5px;margin-bottom:18px;">
      <span style="background:#fef2f2;color:#991b1b;padding:3px 9px;border-radius:12px;font-weight:600;">🔴 Negative {neg}</span>&nbsp;
      <span style="background:#f3f4f6;color:#4b5563;padding:3px 9px;border-radius:12px;font-weight:600;">⚪ Neutral {neu}</span>&nbsp;
      <span style="background:#ecfdf5;color:#047857;padding:3px 9px;border-radius:12px;font-weight:600;">🟢 Positive {pos}</span>
    </div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:6px;">By category</div>
    <table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:20px;">{cat_rows}</table>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-bottom:8px;">Top negative / high-engagement</div>
    {cards}
    <div style="margin-top:20px;">
      <a href="{escape(dash)}" style="display:inline-block;background:#141c30;color:#f0ff5f;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Open Dashboard →</a>
    </div>
  </div>
  <div style="padding:14px 28px;border-top:1px solid #f0f0f0;font-size:11px;color:#9ca3af;">Atome VoC Early Warning Agent · automated daily digest</div>
</div></body></html>"""
    return title, text_body, html_body


async def generate_and_send_daily_alert() -> None:
    """Generate and send the daily alert if scheduled and not yet sent today."""
    async with async_session() as db:
        # 1. Read AppSettings
        settings = (await db.execute(select(AppSettings).where(AppSettings.id == 1))).scalar_one_or_none()
        if not settings:
            return

        # 2. Check if daily alerts are enabled
        if settings.daily_alert_enabled is False:
            return

        now_utc = datetime.now(tz=timezone.utc)

        # 3. Check if we already sent a daily_alert today (UTC calendar day)
        today_utc_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        existing = (
            await db.execute(
                select(AlertMessage).where(
                    AlertMessage.alert_type == "daily_alert",
                    AlertMessage.generated_at >= today_utc_start,
                )
            )
        ).scalar_one_or_none()
        if existing:
            return

        # 4. Query posts from last 24h
        cutoff = now_utc - timedelta(hours=24)
        posts = (
            await db.execute(
                select(Post).where(Post.collected_at >= cutoff)  # newly ingested (not publish date)
            )
        ).scalars().all()

        date_str = now_utc.strftime("%Y-%m-%d")
        generated_at = now_utc

        # 5. Exception-based: only fire if there are HIGH-engagement posts today.
        #    No high-engagement posts → send nothing (record a skip for audit/dedup).
        high_posts = [p for p in posts if (p.engagement_level or "").lower() == "high"]
        if not high_posts:
            db.add(AlertMessage(
                alert_type="daily_alert",
                title=f"VoC Daily Alert — {date_str}",
                message_body="No high-engagement posts in the last 24h — not sent.",
                status="skipped",
                generated_at=generated_at,
            ))
            await db.commit()
            return

        title, message_body, html_body = build_daily_digest(
            high_posts, date_str, headline="high-engagement posts"
        )

        # 6. Resolve delivery channels
        configs = (
            await db.execute(
                select(AlertDeliveryConfig).where(AlertDeliveryConfig.enabled == True)
            )
        ).scalars().all()

        lark_group_configs = [
            c for c in configs
            if c.delivery_channels and "lark_group" in c.delivery_channels and c.lark_group_webhook
        ]
        from backend.services.email_sender import send_alert_email
        email_configs = [
            c for c in configs
            if c.delivery_channels and "email" in c.delivery_channels and c.email_address
        ]

        if not lark_group_configs and not email_configs:
            # High-engagement posts exist but nowhere to send — record skip.
            db.add(AlertMessage(
                alert_type="daily_alert", title=title, message_body=message_body,
                status="skipped", generated_at=generated_at,
            ))
            await db.commit()
            return

        for config in lark_group_configs:
            alert_msg = AlertMessage(
                alert_type="daily_alert",
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
                alert_type="daily_alert",
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
                body_html=html_body,
            )
            alert_msg.status = "sent" if success else "failed"
            alert_msg.sent_at = datetime.now(tz=timezone.utc) if success else None
            if not success:
                alert_msg.error_message = err[:500]

        await db.commit()
