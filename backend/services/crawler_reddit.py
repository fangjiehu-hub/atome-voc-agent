"""Reddit crawler — Apify (preferred) → Brave Search → direct Reddit JSON API (free)."""

import asyncio
import logging
from datetime import datetime, timedelta

import httpx

from backend.database import async_session
from backend.models.post import Post
from backend.services.dedup import is_official_account, is_too_short, mentions_brand
from backend.services.llm_annotator import annotate_unannotated_posts
from backend.services.clustering import cluster_posts
from backend.services.alerting import check_and_send_alerts
from backend.config import settings

from sqlalchemy.dialects.postgresql import insert

logger = logging.getLogger(__name__)

SUBREDDITS = [
    "PHCreditCards",
    "Philippines",
    "phinvest",
    "phfinance",
]
KEYWORDS = [
    "Atome",
    "Atome hindi mabayaran",
    "Atome interest",
    "Atome OTP",
    "Atome scam",
    "Atome collection",
    "Atome nabawasan limit",
    "Atome bayad",
]
RATE_LIMIT_DELAY = 2.0  # 1 req / 2 sec

# Apify Reddit Scraper actor (harshmaur~reddit-scraper — PPR, works with free token)
APIFY_ACTOR_ID = "harshmaur~reddit-scraper"
APIFY_BASE = "https://api.apify.com/v2"
APIFY_POLL_INTERVAL = 10  # seconds
APIFY_TIMEOUT = 300  # max wait seconds (5 min for 30-day crawl)

BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"


async def crawl_reddit(lookback_hours: int = 24):
    """Crawl Reddit for Atome mentions and run full pipeline."""
    logger.info(f"Starting Reddit crawl (lookback={lookback_hours}h)")

    # Priority: Apify → Brave Search → direct Reddit JSON API (free, no key needed)
    all_posts: list[dict] = []

    if settings.apify_api_token:
        all_posts = await _crawl_via_apify(lookback_hours)
        if not all_posts:
            logger.warning("Apify returned 0 posts, trying free alternatives")

    if not all_posts and settings.brave_api_key:
        logger.info("Trying Brave Search for Reddit crawl")
        all_posts = await _crawl_via_brave(lookback_hours)

    if not all_posts:
        logger.info("Trying direct Reddit JSON API (free, no credentials)")
        all_posts = await _crawl_direct(lookback_hours)

    # Save to DB
    saved = await _save_posts(all_posts)
    logger.info(f"Reddit crawl complete: {len(all_posts)} found, {saved} new")

    # Run annotation pipeline
    await annotate_unannotated_posts()
    await cluster_posts(lookback_hours)
    await check_and_send_alerts()


# ── Apify path (preferred) ──────────────────────────────────


async def _crawl_via_apify(lookback_hours: int) -> list[dict]:
    """Use Apify Reddit Scraper (harshmaur) to scrape Reddit posts."""
    logger.info("Using Apify Reddit Scraper (harshmaur)")
    all_posts: list[dict] = []
    seen_urls: set[str] = set()
    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)

    time_filter = _reddit_time_filter(lookback_hours)

    # Build search URLs — global search + per-subreddit for better coverage
    search_urls = []
    for keyword in KEYWORDS:
        # Global Reddit search
        search_urls.append(
            f"https://www.reddit.com/search/?q={keyword.replace(' ', '+')}&sort=new&t={time_filter}"
        )
    # Also search within target subreddits for the main keyword
    for sub in SUBREDDITS:
        search_urls.append(
            f"https://www.reddit.com/r/{sub}/search/?q=Atome&restrict_sr=1&sort=new&t={time_filter}"
        )

    # Limit max items based on lookback period
    max_items = 100 if lookback_hours <= 24 else 300 if lookback_hours <= 168 else 500

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            # Start the Apify actor run
            run_url = f"{APIFY_BASE}/acts/{APIFY_ACTOR_ID}/runs"
            resp = await client.post(
                run_url,
                params={"token": settings.apify_api_token},
                json={
                    "startUrls": [{"url": u} for u in search_urls],
                    "maxItems": max_items,
                    "skipComments": True,
                },
            )
            resp.raise_for_status()
            run_data = resp.json().get("data", {})
            run_id = run_data.get("id")
            dataset_id = run_data.get("defaultDatasetId")
            logger.info(f"Apify run started: {run_id} (dataset: {dataset_id})")

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
                logger.info(f"Apify run {run_id}: status={status}, items={items_count}, elapsed={elapsed}s")
                if status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                    break

            if status != "SUCCEEDED":
                logger.error(f"Apify run {run_id} ended with status: {status}")
                return []

            # Fetch results from dataset
            items_resp = await client.get(
                f"{APIFY_BASE}/datasets/{dataset_id}/items",
                params={"token": settings.apify_api_token, "format": "json"},
            )
            items_resp.raise_for_status()
            items = items_resp.json()

            logger.info(f"Apify returned {len(items)} items")

            for item in items:
                try:
                    post = _parse_apify_item(item, cutoff)
                    if post and post["url"] not in seen_urls:
                        seen_urls.add(post["url"])
                        all_posts.append(post)
                except Exception:
                    logger.exception("Failed to parse Apify item")

        except Exception:
            logger.exception("Apify Reddit crawl failed")

    logger.info(f"Apify Reddit: {len(all_posts)} posts after filtering")
    return all_posts


def _parse_apify_item(item: dict, cutoff: datetime) -> dict | None:
    """Parse an Apify Reddit Scraper result into our post format.

    Handles field names from harshmaur~reddit-scraper:
      postUrl, parsedId, authorName, title, body, upVotes, commentsCount, createdAt
    Also handles trudax~reddit-scraper-lite fields as fallback.
    """
    # Skip comments — only want posts
    data_type = item.get("dataType", "")
    if data_type == "comment":
        return None

    title = item.get("title", "") or ""
    body = item.get("body", "") or item.get("selftext", "") or ""
    text = f"{title} {body}".strip()

    # Author: harshmaur uses authorName, trudax lite uses username
    author = item.get("authorName", "") or item.get("username", "") or item.get("author", "") or ""

    # URL: harshmaur uses postUrl, trudax lite uses url
    url = item.get("postUrl", "") or item.get("url", "") or ""

    # Post ID: harshmaur uses parsedId, also try id
    post_id = item.get("parsedId", "") or item.get("id", "") or item.get("dataId", "") or ""
    # Strip Reddit type prefix (t3_, t1_)
    if isinstance(post_id, str) and post_id.startswith("t3_"):
        post_id = post_id[3:]

    # Parse created time
    created_str = item.get("createdAt") or item.get("created_at") or ""
    if created_str:
        try:
            created = datetime.fromisoformat(created_str.replace("Z", "+00:00")).replace(tzinfo=None)
        except (ValueError, TypeError):
            created = datetime.utcnow()
    else:
        created_utc = item.get("created_utc") or item.get("createdUtc")
        if created_utc:
            created = datetime.utcfromtimestamp(float(created_utc))
        else:
            created = datetime.utcnow()

    if created < cutoff:
        return None

    # Filters
    if is_too_short(text):
        return None
    if not mentions_brand(text):
        return None
    if is_official_account(author):
        return None

    # Normalize URL
    if not url.startswith("http"):
        permalink = item.get("permalink", "")
        url = f"https://reddit.com{permalink}" if permalink else ""
    if not url:
        return None

    # Extract a stable post_id from URL if not available
    if not post_id:
        parts = url.rstrip("/").split("/")
        for i, part in enumerate(parts):
            if part == "comments" and i + 1 < len(parts):
                post_id = parts[i + 1]
                break
    if not post_id:
        return None

    return {
        "platform": "reddit",
        "brand": "atome_ph",
        "post_id": post_id,
        "url": url,
        "author_handle": author,
        "content_text": text,
        "created_at": created,
        "engagement_likes": item.get("upVotes", 0) or item.get("score", 0) or 0,
        "engagement_replies": item.get("commentsCount", 0) or item.get("numberOfComments", 0) or item.get("num_comments", 0) or 0,
        "engagement_reposts": 0,
        "raw_json": item,
    }


# ── Brave Search path (fallback) ────────────────────────────


async def _crawl_via_brave(lookback_hours: int) -> list[dict]:
    """Use Brave Search API to find Reddit posts — works from any IP."""
    logger.info("Using Brave Search for Reddit crawl")
    all_posts: list[dict] = []
    seen_urls: set[str] = set()

    # Build targeted queries: site:reddit.com + keyword
    queries = []
    for keyword in KEYWORDS:
        queries.append(f"site:reddit.com {keyword}")

    freshness = "pd" if lookback_hours <= 24 else "pw" if lookback_hours <= 168 else "pm"

    async with httpx.AsyncClient(timeout=30.0) as client:
        for query in queries:
            try:
                params: dict = {"q": query, "count": 20, "freshness": freshness}
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

                for result in data.get("web", {}).get("results", []):
                    post = _parse_brave_reddit_result(result, lookback_hours)
                    if post and post["url"] not in seen_urls:
                        seen_urls.add(post["url"])
                        all_posts.append(post)

                logger.info(f"Brave [{query[:40]}...]: {len(data.get('web', {}).get('results', []))} results")
            except Exception:
                logger.exception(f"Failed Brave search: {query[:40]}")
            await asyncio.sleep(1.0)  # Brave rate limit

    return all_posts


def _parse_brave_reddit_result(result: dict, lookback_hours: int) -> dict | None:
    """Parse a Brave search result for a Reddit post."""
    import re

    url = result.get("url", "")

    # Only keep reddit.com post URLs (not subreddit pages, wiki, etc.)
    if not re.search(r"reddit\.com/r/\w+/comments/\w+", url):
        return None

    title = result.get("title", "")
    description = result.get("description", "")
    text = f"{title} {description}".strip()

    # Filters
    if is_too_short(text):
        return None
    if not mentions_brand(text):
        return None

    # Extract author from description if available (Reddit format often includes "Posted by u/...")
    author = ""
    author_match = re.search(r"(?:u/|by )(\w+)", description)
    if author_match:
        author = author_match.group(1)
    if is_official_account(author):
        return None

    # Extract post_id from URL
    post_id = ""
    id_match = re.search(r"/comments/(\w+)", url)
    if id_match:
        post_id = id_match.group(1)
    if not post_id:
        return None

    # Parse date
    from backend.services.crawler_twitter import _parse_brave_date
    age = result.get("age", "")
    page_age = result.get("page_age", "")
    created = _parse_brave_date(page_age or age)

    return {
        "platform": "reddit",
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
    }


# ── Direct path (free, no credentials) ─────────────────────


async def _crawl_direct(lookback_hours: int) -> list[dict]:
    """Direct Reddit search.json API — free, no API key required.

    Performs both a global Reddit search (all subreddits) and targeted
    per-subreddit searches for comprehensive Atome coverage.
    Note: Reddit may rate-limit datacenter IPs; requests are spaced 2s apart.
    """
    all_posts: list[dict] = []
    seen_urls: set[str] = set()

    async with httpx.AsyncClient(
        headers={"User-Agent": settings.reddit_user_agent},
        timeout=30.0,
    ) as client:
        # 1. Global Reddit search for each keyword (searches all subreddits)
        for keyword in KEYWORDS:
            try:
                posts = await _search_reddit_global(client, lookback_hours, keyword)
                for p in posts:
                    if p["url"] not in seen_urls:
                        seen_urls.add(p["url"])
                        all_posts.append(p)
                logger.info(f"Global r/all [{keyword}]: found {len(posts)} posts")
            except Exception:
                logger.exception(f"Failed global search [{keyword}]")
            await asyncio.sleep(RATE_LIMIT_DELAY)

        # 2. Targeted per-subreddit search for broader coverage
        for sub in SUBREDDITS:
            try:
                posts = await _search_subreddit(client, sub, lookback_hours, "Atome")
                for p in posts:
                    if p["url"] not in seen_urls:
                        seen_urls.add(p["url"])
                        all_posts.append(p)
                logger.info(f"r/{sub} [Atome]: found {len(posts)} posts")
            except Exception:
                logger.exception(f"Failed to crawl r/{sub}")
            await asyncio.sleep(RATE_LIMIT_DELAY)

    logger.info(f"Direct Reddit API: {len(all_posts)} posts total")
    return all_posts


async def _search_reddit_global(
    client: httpx.AsyncClient, lookback_hours: int, keyword: str = "Atome"
) -> list[dict]:
    """Search all of Reddit (not restricted to a subreddit) via the free JSON API."""
    url = "https://www.reddit.com/search.json"
    params = {
        "q": keyword,
        "sort": "new",
        "t": _reddit_time_filter(lookback_hours),
        "limit": 100,
    }

    resp = await client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()

    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
    posts = []

    for child in data.get("data", {}).get("children", []):
        item = child.get("data", {})
        created = datetime.utcfromtimestamp(item.get("created_utc", 0))
        if created < cutoff:
            continue

        text = f"{item.get('title', '')} {item.get('selftext', '')}".strip()

        if is_too_short(text):
            continue
        if not mentions_brand(text):
            continue
        author = item.get("author", "")
        if is_official_account(author):
            continue

        permalink = item.get("permalink", "")
        post_url = f"https://reddit.com{permalink}" if permalink else ""
        if not post_url:
            continue

        posts.append({
            "platform": "reddit",
            "brand": "atome_ph",
            "post_id": item.get("id", ""),
            "url": post_url,
            "author_handle": author,
            "content_text": text,
            "created_at": created,
            "engagement_likes": item.get("score", 0),
            "engagement_replies": item.get("num_comments", 0),
            "engagement_reposts": 0,
            "raw_json": item,
        })

    return posts


async def _search_subreddit(
    client: httpx.AsyncClient, subreddit: str, lookback_hours: int, keyword: str = "Atome"
) -> list[dict]:
    """Search a subreddit for Atome mentions."""
    url = f"https://www.reddit.com/r/{subreddit}/search.json"
    params = {
        "q": keyword,
        "restrict_sr": "on",
        "sort": "new",
        "t": _reddit_time_filter(lookback_hours),
        "limit": 100,
    }

    resp = await client.get(url, params=params)
    resp.raise_for_status()
    data = resp.json()

    cutoff = datetime.utcnow() - timedelta(hours=lookback_hours)
    posts = []

    for child in data.get("data", {}).get("children", []):
        item = child.get("data", {})
        created = datetime.utcfromtimestamp(item.get("created_utc", 0))
        if created < cutoff:
            continue

        text = f"{item.get('title', '')} {item.get('selftext', '')}".strip()

        # Filters
        if is_too_short(text):
            continue
        if not mentions_brand(text):
            continue
        author = item.get("author", "")
        if is_official_account(author):
            continue

        posts.append({
            "platform": "reddit",
            "brand": "atome_ph",
            "post_id": item.get("id", ""),
            "url": f"https://reddit.com{item.get('permalink', '')}",
            "author_handle": author,
            "content_text": text,
            "created_at": created,
            "engagement_likes": item.get("score", 0),
            "engagement_replies": item.get("num_comments", 0),
            "engagement_reposts": 0,
            "raw_json": item,
        })

    return posts


# ── Shared ───────────────────────────────────────────────────


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


def _reddit_time_filter(lookback_hours: int) -> str:
    if lookback_hours <= 24:
        return "day"
    if lookback_hours <= 168:
        return "week"
    if lookback_hours <= 730:
        return "month"
    return "year"
