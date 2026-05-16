"""X/Twitter crawler — Apify Tweet Scraper (preferred), Brave Search fallback."""

import asyncio
import logging
import re
from datetime import datetime, timedelta

import httpx

from backend.database import async_session
from backend.models.post import Post
from backend.services.dedup import is_official_account, is_noise_account, is_ph_relevant, is_too_short, mentions_brand
from backend.services.llm_annotator import annotate_unannotated_posts
from backend.services.clustering import cluster_posts
from backend.services.alerting import check_and_send_alerts
from backend.config import settings

from sqlalchemy.dialects.postgresql import insert

logger = logging.getLogger(__name__)

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

# Apify Tweet Scraper (apidojo~tweet-scraper — most popular, 138M+ runs)
APIFY_TWEET_ACTOR_ID = "apidojo~tweet-scraper"
APIFY_BASE = "https://api.apify.com/v2"
APIFY_POLL_INTERVAL = 10  # seconds
APIFY_TIMEOUT = 300  # max wait seconds

KEYWORDS = [
    "Atome credit card Philippines",
    "Atome scam Philippines",
    "Atome refund Philippines",
    "Atome BNPL complaint",
    "Atome payment failed",
    "Atome credit limit",
    "Atome collection Philippines",
    "Atome overdue Philippines",
    "Atome debt collection",
    "Atome home visit",
    "Atome harassment",
    "Atome threatening",
    # Taglish / Filipino keywords
    "Atome bayad",
    "Atome hindi mabayaran",
    "Atome nabawasan limit",
    "Atome OTP di gumagana",
    "Atome ang laki ng interest",
    "Atome nagbabanta",
    "Atome tumawag collection",
]


async def crawl_twitter(lookback_hours: int = 24):
    """Crawl X/Twitter for Atome mentions and run full pipeline."""
    logger.info(f"Starting Twitter/X crawl (lookback={lookback_hours}h)")

    # Priority: Apify (can actually scrape X) → Brave (fallback, limited X indexing)
    if settings.apify_api_token:
        all_posts = await _crawl_via_apify(lookback_hours)
        # Fall back to Brave if Apify returned nothing
        if not all_posts and settings.brave_api_key:
            logger.warning("Apify returned 0 tweets, falling back to Brave Search")
            all_posts = await _crawl_via_brave(lookback_hours)
    elif settings.brave_api_key:
        all_posts = await _crawl_via_brave(lookback_hours)
    else:
        logger.warning("No APIFY_API_TOKEN or BRAVE_API_KEY set, skipping Twitter crawl")
        return

    saved = await _save_posts(all_posts)
    logger.info(f"Twitter/X crawl complete: {len(all_posts)} found, {saved} new")

    await annotate_unannotated_posts()
    await cluster_posts(lookback_hours)
    await check_and_send_alerts()


# ── Apify path (preferred) ──────────────────────────────────


async def _crawl_via_apify(lookback_hours: int) -> list[dict]:
    """Use Apify Tweet Scraper to scrape X/Twitter posts."""
    logger.info("Using Apify Tweet Scraper (apidojo)")
    all_posts: list[dict] = []
    seen_urls: set[str] = set()
    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

    # Build X search URLs for each keyword
    search_urls = []
    for keyword in KEYWORDS:
        encoded = keyword.replace(" ", "%20")
        search_urls.append({"url": f"https://x.com/search?q={encoded}&f=live"})

    # Limit items based on lookback period
    max_items = 50 if lookback_hours <= 24 else 200 if lookback_hours <= 168 else 500

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # Start the Apify actor run
            run_url = f"{APIFY_BASE}/acts/{APIFY_TWEET_ACTOR_ID}/runs"
            resp = await client.post(
                run_url,
                params={"token": settings.apify_api_token},
                json={
                    "startUrls": search_urls,
                    "maxItems": max_items,
                    "addUserInfo": False,
                    "scrapeTweetReplies": False,
                },
            )
            resp.raise_for_status()
            run_data = resp.json().get("data", {})
            run_id = run_data.get("id")
            dataset_id = run_data.get("defaultDatasetId")
            logger.info(f"Apify tweet run started: {run_id} (dataset: {dataset_id})")

            # Poll until finished
            status = "RUNNING"
            elapsed = 0
            while elapsed < APIFY_TIMEOUT:
                await asyncio.sleep(APIFY_POLL_INTERVAL)
                elapsed += APIFY_POLL_INTERVAL
                status_resp = await client.get(
                    f"{APIFY_BASE}/actor-runs/{run_id}",
                    params={"token": settings.apify_api_token},
                )
                status_resp.raise_for_status()
                run_info = status_resp.json().get("data", {})
                status = run_info.get("status")
                items_count = run_info.get("stats", {}).get("datasetItems", 0)
                logger.info(f"Apify tweet run {run_id}: status={status}, items={items_count}, elapsed={elapsed}s")
                if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                    break

            if status != "SUCCEEDED":
                logger.error(f"Apify tweet run {run_id} ended with status: {status}")
                return []

            # Fetch results from dataset
            items_resp = await client.get(
                f"{APIFY_BASE}/datasets/{dataset_id}/items",
                params={"token": settings.apify_api_token, "format": "json"},
            )
            items_resp.raise_for_status()
            items = items_resp.json()

            logger.info(f"Apify returned {len(items)} tweets")

            for item in items:
                try:
                    post = _parse_apify_tweet(item, cutoff)
                    if post and post["url"] not in seen_urls:
                        seen_urls.add(post["url"])
                        all_posts.append(post)
                except Exception:
                    logger.exception("Failed to parse Apify tweet")

        except Exception:
            logger.exception("Apify Twitter crawl failed")

    logger.info(f"Apify Twitter: {len(all_posts)} posts after filtering")
    return all_posts


def _parse_apify_tweet(item: dict, cutoff: datetime) -> dict | None:
    """Parse an Apify tweet-scraper result into our post format.

    Fields from apidojo~tweet-scraper:
      id, url, text/fullText, author.userName, createdAt, likeCount, replyCount, retweetCount
    """
    # Skip retweets
    if item.get("isRetweet"):
        return None

    text = item.get("fullText", "") or item.get("text", "") or ""
    url = item.get("url", "") or item.get("twitterUrl", "") or ""
    post_id = str(item.get("id", ""))

    # Author info
    author_data = item.get("author", {})
    if isinstance(author_data, dict):
        author = author_data.get("userName", "") or author_data.get("name", "") or ""
    else:
        author = str(author_data) if author_data else ""

    if not post_id or not url:
        return None

    # Parse created time — format: "Tue Apr 21 08:35:45 +0000 2026"
    created_str = item.get("createdAt", "")
    created = _parse_twitter_date(created_str)

    if created < cutoff:
        return None

    # Filters
    if is_too_short(text):
        return None
    if not mentions_brand(text):
        return None
    if is_official_account(author):
        return None
    if is_noise_account(author):
        return None
    if not is_ph_relevant(text):
        return None

    return {
        "platform": "twitter",
        "brand": "atome_ph",
        "post_id": post_id,
        "url": url,
        "author_handle": author,
        "content_text": text,
        "created_at": created,
        "engagement_likes": item.get("likeCount", 0) or 0,
        "engagement_replies": item.get("replyCount", 0) or 0,
        "engagement_reposts": item.get("retweetCount", 0) or 0,
        "raw_json": item,
    }


def _parse_twitter_date(date_str: str) -> datetime:
    """Parse Twitter date format: 'Tue Apr 21 08:35:45 +0000 2026'."""
    if not date_str:
        return datetime.utcnow()
    try:
        return datetime.strptime(date_str, "%a %b %d %H:%M:%S %z %Y").replace(tzinfo=None)
    except (ValueError, TypeError):
        pass
    # Fallback: try ISO format
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, TypeError):
        pass
    return datetime.utcnow()


# ── Brave Search path (fallback) ────────────────────────────


async def _crawl_via_brave(lookback_hours: int) -> list[dict]:
    """Use Brave Search API as fallback — limited X/Twitter indexing."""
    logger.info("Using Brave Search for Twitter crawl (fallback)")
    all_posts: list[dict] = []
    seen_urls: set[str] = set()

    async with httpx.AsyncClient(timeout=30.0) as client:
        for keyword in KEYWORDS:
            try:
                posts = await _brave_search(client, keyword, lookback_hours)
                for p in posts:
                    if p["url"] not in seen_urls:
                        seen_urls.add(p["url"])
                        all_posts.append(p)
                logger.info(f"Keyword '{keyword}': found {len(posts)} results")
            except Exception:
                logger.exception(f"Failed to search keyword '{keyword}'")

    return all_posts


async def _brave_search(
    client: httpx.AsyncClient, keyword: str, lookback_hours: int
) -> list[dict]:
    """Search Brave for X/Twitter posts matching keyword."""
    query = f"site:x.com {keyword}"

    params: dict = {"q": query, "count": 20}
    # Only add freshness filter for short lookbacks — longer ones need all results
    if lookback_hours <= 24:
        params["freshness"] = "pd"
    elif lookback_hours <= 168:
        params["freshness"] = "pw"
    elif lookback_hours <= 730:
        params["freshness"] = "pm"
    # For 90d+, skip freshness filter to get max results

    resp = await client.get(
        BRAVE_SEARCH_URL,
        params=params,
        headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "X-Subscription-Token": settings.brave_api_key,
        },
    )
    resp.raise_for_status()
    data = resp.json()

    posts = []
    for result in data.get("web", {}).get("results", []):
        url = result.get("url", "")

        # Only keep x.com or twitter.com status URLs
        if not _is_tweet_url(url):
            continue

        title = result.get("title", "")
        description = result.get("description", "")
        text = f"{title} {description}".strip()

        # Extract author handle from URL
        author = _extract_handle(url)

        # Parse post ID from URL
        post_id = _extract_post_id(url)
        if not post_id:
            continue

        # Parse date if available
        age = result.get("age", "")
        page_age = result.get("page_age", "")
        created = _parse_brave_date(page_age or age)

        # Filters
        if is_too_short(text):
            continue
        if not mentions_brand(text):
            continue
        if is_official_account(author):
            continue
        if is_noise_account(author):
            continue
        if not is_ph_relevant(text):
            continue

        posts.append({
            "platform": "twitter",
            "brand": "atome_ph",
            "post_id": post_id,
            "url": url,
            "author_handle": author,
            "content_text": text,
            "created_at": created,
            "engagement_likes": 0,
            "engagement_replies": 0,
            "engagement_reposts": 0,
            "raw_json": result,
        })

    return posts


# ── Shared helpers ───────────────────────────────────────────


def _is_tweet_url(url: str) -> bool:
    """Check if URL is an individual tweet/post."""
    return bool(re.search(r"(x\.com|twitter\.com)/\w+/status/\d+", url))


def _extract_handle(url: str) -> str:
    """Extract @handle from tweet URL."""
    match = re.search(r"(?:x\.com|twitter\.com)/(\w+)/status/", url)
    return match.group(1) if match else ""


def _extract_post_id(url: str) -> str:
    """Extract tweet ID from URL."""
    match = re.search(r"/status/(\d+)", url)
    return match.group(1) if match else ""


def _parse_brave_date(date_str: str) -> datetime:
    """Parse Brave's date/age string into a datetime."""
    if not date_str:
        return datetime.utcnow()

    # Brave returns ISO dates like "2026-04-20T..."
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).replace(tzinfo=None)
    except (ValueError, TypeError):
        pass

    # Or relative ages like "1 day ago", "3 hours ago"
    now = datetime.utcnow()
    match = re.search(r"(\d+)\s*(hour|day|week|month)", date_str.lower())
    if match:
        num = int(match.group(1))
        unit = match.group(2)
        if unit == "hour":
            return now - timedelta(hours=num)
        elif unit == "day":
            return now - timedelta(days=num)
        elif unit == "week":
            return now - timedelta(weeks=num)
        elif unit == "month":
            return now - timedelta(days=num * 30)

    return now


async def _save_posts(posts: list[dict]) -> int:
    """Save posts to DB with ON CONFLICT DO NOTHING."""
    async with async_session() as db:
        inserted = 0
        for p in posts:
            stmt = (
                insert(Post)
                .values(
                    platform=p["platform"],
                    brand=p["brand"],
                    post_id=p["post_id"],
                    url=p["url"],
                    author_handle=p["author_handle"],
                    content_text=p["content_text"],
                    created_at=p["created_at"],
                    engagement_likes=p["engagement_likes"],
                    engagement_replies=p["engagement_replies"],
                    engagement_reposts=p["engagement_reposts"],
                    raw_json=p.get("raw_json"),
                )
                .on_conflict_do_nothing(constraint="uq_platform_brand_post")
            )
            result = await db.execute(stmt)
            if result.rowcount > 0:
                inserted += 1
        await db.commit()
        return inserted
