"""Lark Bitable sync — pulls posts from the Octo Agent social media table.

Runs on the same APScheduler cadence as the Reddit crawler (08:00 / 20:00 Manila).
Reads new records from the Bitable via the Lark API, deduplicates against our
posts table (by platform + post_id), and writes new rows into PostgreSQL so they
flow through the standard annotate → cluster → alert pipeline.

Requires two environment variables:
  LARK_APP_ID      — Lark open-platform app id  (cli_xxxxx)
  LARK_APP_SECRET  — Lark open-platform app secret

The Bitable is accessed via the bot tenant-access-token.  Make sure the
self-built app has been granted "Bitable records read" permission and has
been added as a collaborator (read) on the target Bitable.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy.dialects.postgresql import insert

from backend.config import settings
from backend.database import async_session
from backend.models.post import Post

logger = logging.getLogger(__name__)

# ── Bitable coordinates (env-overridable; default to the shared table) ───────
BASE_TOKEN  = settings.lark_bitable_base_token
TABLE_ID    = settings.lark_bitable_table_id
VIEW_ID     = settings.lark_bitable_view_id

LARK_API    = "https://open.larksuite.com/open-apis"
PAGE_SIZE   = 100                   # max per Bitable page

# ── Category label → our taxonomy key ────────────────────────────────────────
CATEGORY_MAP: dict[str, str] = {
    "Fraud":            "fraud",
    "User Review":      "user_review",
    "Product":          "fees",           # closest match
    "Card Application": "card_application",
    "Payment":          "payment",
    "Marketing":        "user_review",    # no direct match — treat as user_review
    "Transaction":      "transaction",
    "Customer Service": "customer_service",
    "Collections":      "collections",
}

# ── Severity → engagement level ──────────────────────────────────────────────
SEVERITY_MAP: dict[str, str] = {
    "Critical": "High",
    "High":     "High",
    "Medium":   "Medium",
    "Low":      "Low",
    "Info":     "Low",
}

# ── Platform normalisation ────────────────────────────────────────────────────
PLATFORM_MAP: dict[str, str] = {
    "Facebook": "facebook",
    "Reddit":   "reddit",
    "Twitter":  "twitter",
    "X":        "twitter",  # X and Twitter are the same platform
    "TikTok":   "tiktok",
}


# ── Lark tenant-access-token (cached per process lifetime) ───────────────────
_tenant_token: str | None = None
_token_expires: float = 0.0


async def _get_tenant_token(client: httpx.AsyncClient) -> str | None:
    global _tenant_token, _token_expires
    import time

    if _tenant_token and time.time() < _token_expires - 60:
        return _tenant_token

    if not settings.lark_app_id or not settings.lark_app_secret:
        logger.warning(
            "LARK_APP_ID / LARK_APP_SECRET not set — Bitable sync disabled"
        )
        return None

    resp = await client.post(
        f"{LARK_API}/auth/v3/tenant_access_token/internal",
        json={"app_id": settings.lark_app_id, "app_secret": settings.lark_app_secret},
    )
    resp.raise_for_status()
    data = resp.json()
    _tenant_token = data.get("tenant_access_token")
    _token_expires = time.time() + int(data.get("expire", 7200))
    return _tenant_token


def _text_value(cell) -> str:
    """Extract plain string from a Bitable cell (text / select / etc.)."""
    if cell is None:
        return ""
    if isinstance(cell, str):
        return cell
    if isinstance(cell, list):
        parts = []
        for item in cell:
            if isinstance(item, dict):
                parts.append(item.get("text", "") or item.get("name", "") or "")
            elif isinstance(item, str):
                parts.append(item)
        return " ".join(p for p in parts if p)
    if isinstance(cell, dict):
        return cell.get("text", "") or cell.get("name", "") or ""
    return str(cell)


def _parse_date(cell) -> datetime | None:
    """Parse a Bitable datetime cell (milliseconds epoch or ISO string)."""
    if cell is None:
        return None
    try:
        if isinstance(cell, (int, float)):
            # Lark stores datetime fields as ms since epoch
            ts = cell / 1000 if cell > 1e10 else cell
            return datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
        if isinstance(cell, str):
            return datetime.fromisoformat(cell.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        pass
    return None


def _map_record(fields: dict) -> dict | None:
    """Convert a Bitable record dict to our Post insert dict.  Returns None to skip."""
    post_id = _text_value(fields.get("Post ID"))
    if not post_id:
        return None

    platform_raw = _text_value(fields.get("Platform")).strip()
    platform = PLATFORM_MAP.get(platform_raw, platform_raw.lower() or "unknown")

    country_raw = _text_value(fields.get("Country")).strip().upper()
    brand = f"atome_{country_raw.lower()}" if country_raw else "atome_ph"

    content = _text_value(fields.get("Raw Content")) or _text_value(fields.get("Snippet"))
    if not content:
        return None

    # Relevance filter: drop false-positives that never mention the brand.
    # Octo occasionally scrapes unrelated posts (matched on generic keywords like
    # "overdue"/"collection"). Require "atome" somewhere in title/content/snippet.
    relevance_blob = " ".join([
        _text_value(fields.get("Title")),
        _text_value(fields.get("Raw Content")),
        _text_value(fields.get("Snippet")),
        _text_value(fields.get("Hit Keywords")),
    ]).lower()
    if "atome" not in relevance_blob:
        logger.info("Bitable: skipping irrelevant post %s (no brand mention)", post_id[:12])
        return None

    category_raw = _text_value(fields.get("Category")).strip()
    category = CATEGORY_MAP.get(category_raw)  # None if unmapped

    severity_raw = _text_value(fields.get("Severity Level")).strip()
    eng_level = SEVERITY_MAP.get(severity_raw, "Low")
    # Map engagement level to a numeric score for storage
    eng_score = {"High": 80, "Medium": 40, "Low": 5}.get(eng_level, 5)

    sentiment_raw = _text_value(fields.get("Sentiment")).strip()
    is_negative = True if sentiment_raw == "Negative" else (
        False if sentiment_raw == "Positive" else None
    )

    return {
        "platform":           platform,
        "brand":              brand,
        "post_id":            post_id,
        "url":                _text_value(fields.get("Post URL")) or None,
        "author_handle":      _text_value(fields.get("Post Author")) or None,
        "content_text":       content,
        "created_at":         _parse_date(fields.get("Publish Date")) or datetime.utcnow(),
        "engagement_likes":   int(fields.get("Likes Count") or 0),
        "engagement_comments":int(fields.get("Comments Count") or 0),
        "engagement_replies": 0,
        "engagement_reposts": 0,
        "engagement_score":   eng_score,
        "engagement_level":   eng_level,
        "category":           category,
        "summary":            _text_value(fields.get("AI Summary")) or None,
        # Octo Agent's richer AI impact/analysis text (shown in the drawer).
        "ai_analysis":        _text_value(fields.get("AI Analysis")) or None,
        "is_negative":        is_negative,
        # Octo Agent already did the AI analysis (category / summary / sentiment /
        # severity), so mark these as annotated to skip our LLM re-annotation and
        # make them visible in the mentions list immediately.
        "annotated_at":       datetime.utcnow(),
        "raw_json":           None,
    }


async def fetch_bitable_records() -> list[dict]:
    """Fetch all records from the configured Bitable (handles auth + pagination)."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        token = await _get_tenant_token(client)
        if not token:
            return []

        headers = {"Authorization": f"Bearer {token}"}
        page_token: str | None = None
        all_records: list[dict] = []

        while True:
            params: dict = {"page_size": PAGE_SIZE, "view_id": VIEW_ID}
            if page_token:
                params["page_token"] = page_token

            resp = await client.get(
                f"{LARK_API}/bitable/v1/apps/{BASE_TOKEN}/tables/{TABLE_ID}/records",
                headers=headers,
                params=params,
            )
            resp.raise_for_status()
            body = resp.json()
            if body.get("code", 0) != 0:
                logger.error("Bitable API error: %s", body.get("msg"))
                break

            data = body.get("data", {})
            all_records.extend(data.get("items", []))
            if not data.get("has_more"):
                break
            page_token = data.get("page_token")

    logger.info("Lark Bitable: fetched %d records", len(all_records))
    return all_records


async def sync_lark_bitable() -> int:
    """Fetch new records from the Bitable and upsert into our posts table.

    Returns the number of newly inserted rows.
    """
    all_records = await fetch_bitable_records()
    if not all_records:
        return 0

    posts = []
    for rec in all_records:
        mapped = _map_record(rec.get("fields", {}))
        if mapped:
            posts.append(mapped)

    logger.info("Lark Bitable: %d records after mapping", len(posts))

    inserted = 0
    async with async_session() as db:
        for p in posts:
            stmt = (
                insert(Post)
                .values(**p)
                .on_conflict_do_nothing(constraint="uq_platform_brand_post")
            )
            result = await db.execute(stmt)
            if result.rowcount > 0:
                inserted += 1
        await db.commit()

    logger.info("Lark Bitable sync complete: %d new posts inserted", inserted)
    return inserted


async def crawl_lark_bitable() -> None:
    """Full pipeline: sync Bitable → annotate → cluster → alert."""
    from backend.services.clustering import cluster_posts
    from backend.services.llm_annotator import annotate_unannotated_posts
    from backend.services.alerting import check_and_send_alerts

    inserted = await sync_lark_bitable()
    logger.info("Lark Bitable: %d new posts, running pipeline", inserted)

    await annotate_unannotated_posts()
    await cluster_posts(lookback_hours=24)
    await check_and_send_alerts()
