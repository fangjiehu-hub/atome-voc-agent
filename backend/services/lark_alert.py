"""Lark (Feishu) alert sender for high-engagement VoC posts.

Sends interactive card messages to a configured Lark incoming webhook URL.
Set LARK_ALERT_WEBHOOK_URL in .env to enable. If the env var is not set,
send() is a no-op that logs a warning (so the app still works without Lark).
"""
from __future__ import annotations

import logging
import os

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Secondary-team mapping (TODO: move to taxonomy_categories.secondary_teams DB column)
# ---------------------------------------------------------------------------
SECONDARY_TEAMS: dict[str, list[str]] = {
    "collections":       ["Risk"],
    "customer_service":  ["Product"],
    "bayad":             ["Customer Services"],
    "transaction":       ["Risk"],
    "card_delivery":     ["Product"],
    "fees":              ["Customer Services"],
    "payment":           ["Risk"],
    "card_application":  ["Customer Services"],
    "limit_increase":    ["Product", "Customer Services"],
    "card_binding":      ["Customer Services"],
    "otp":               ["Product"],
    "user_review":       ["Customer Services"],
    "fraud":             ["Legal", "Collection"],
}


def secondary_teams_for(category_key: str | None) -> list[str]:
    return SECONDARY_TEAMS.get(category_key or "", [])


# ---------------------------------------------------------------------------
# Message formatting
# ---------------------------------------------------------------------------

def _sentiment_emoji(sentiment: str) -> str:
    return {"Positive": "🟢", "Negative": "🔴", "Neutral": "⚪"}.get(sentiment, "⚪")


def format_lark_card(
    *,
    post_text: str,
    platform: str,
    category_label: str,
    sentiment: str,
    engagement: int,
    level: str,
    primary_owner: str,
    secondary_teams: list[str],
    suggested_action: str,
    post_url: str | None,
    translation: str | None = None,
) -> dict:
    """Build a Lark interactive card payload for the VoC alert."""
    excerpt = (post_text or "")[:280]
    if len(post_text or "") > 280:
        excerpt += "…"

    secondary_str = ", ".join(secondary_teams) if secondary_teams else "—"
    platform_label = "X / Twitter" if platform == "twitter" else platform.title()
    sent_emoji = _sentiment_emoji(sentiment)

    # Card header colour based on sentiment
    header_color = "red" if sentiment == "Negative" else "orange" if level == "High" else "blue"

    elements = [
        {
            "tag": "div",
            "fields": [
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**Category**\n{category_label}"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**Platform**\n{platform_label}"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**Sentiment**\n{sent_emoji} {sentiment}"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**Engagement**\n{engagement} ({level})"}},
            ],
        },
        {
            "tag": "div",
            "fields": [
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**Primary Owner**\n🏷️ {primary_owner}"}},
                {"is_short": True, "text": {"tag": "lark_md", "content": f"**CC Teams**\n{secondary_str}"}},
            ],
        },
        {"tag": "hr"},
        {
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"**Post**\n{excerpt}"},
        },
    ]

    if translation:
        elements.append({
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"**Translation (EN)**\n_{translation}_"},
        })

    elements += [
        {"tag": "hr"},
        {
            "tag": "div",
            "text": {"tag": "lark_md", "content": f"**Suggested Action**\n{suggested_action}"},
        },
    ]

    if post_url:
        elements.append({
            "tag": "action",
            "actions": [
                {
                    "tag": "button",
                    "text": {"tag": "plain_text", "content": "View original post"},
                    "type": "default",
                    "url": post_url,
                }
            ],
        })

    return {
        "msg_type": "interactive",
        "card": {
            "config": {"wide_screen_mode": True},
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": "🚨 [Atome VoC] High-engagement post detected",
                },
                "template": header_color,
            },
            "elements": elements,
        },
    }


def format_plain_text(
    *,
    post_text: str,
    platform: str,
    category_label: str,
    sentiment: str,
    engagement: int,
    level: str,
    primary_owner: str,
    secondary_teams: list[str],
    suggested_action: str,
    post_url: str | None,
    translation: str | None = None,
) -> dict:
    """Fallback plain-text Lark message."""
    secondary_str = ", ".join(secondary_teams) if secondary_teams else "—"
    excerpt = (post_text or "")[:300]
    lines = [
        "[Atome VoC Alert] High-engagement post detected",
        "",
        f"Category: {category_label}",
        f"Sentiment: {sentiment}",
        f"Engagement: {engagement} ({level})",
        f"Primary Owner: {primary_owner}",
        f"Secondary: {secondary_str}",
        "",
        "Post:",
        excerpt,
    ]
    if translation:
        lines += ["", f"Translation (EN): {translation}"]
    lines += [
        "",
        f"Suggested Action:\n{suggested_action}",
    ]
    if post_url:
        lines += ["", f"Link:\n{post_url}"]

    return {"msg_type": "text", "content": {"text": "\n".join(lines)}}


# ---------------------------------------------------------------------------
# Sender
# ---------------------------------------------------------------------------

async def send_alert(payload: dict, webhook_url: str | None = None) -> bool:
    """POST payload to the Lark incoming webhook. Returns True on success."""
    url = webhook_url or os.environ.get("LARK_ALERT_WEBHOOK_URL", "")
    if not url:
        logger.warning(
            "LARK_ALERT_WEBHOOK_URL not set — alert payload logged only:\n%s", payload
        )
        return False
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") not in (0, None) or data.get("StatusCode") not in (0, None):
                logger.error("Lark webhook returned non-zero code: %s", data)
                return False
            logger.info("Lark alert sent successfully (status %s)", resp.status_code)
            return True
    except Exception as exc:
        logger.error("Failed to send Lark alert: %s", exc)
        return False
