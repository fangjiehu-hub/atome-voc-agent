"""Backfill crawl: run a one-time crawl with extended lookback."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.services.crawler_reddit import crawl_reddit
from backend.services.crawler_twitter import crawl_twitter


async def backfill(lookback_hours: int = 168):
    """Backfill last 7 days (168 hours) of posts."""
    print(f"Starting backfill crawl (lookback={lookback_hours}h)")
    await crawl_reddit(lookback_hours=lookback_hours)
    await crawl_twitter(lookback_hours=lookback_hours)
    print("Backfill complete.")


if __name__ == "__main__":
    hours = int(sys.argv[1]) if len(sys.argv) > 1 else 168
    asyncio.run(backfill(hours))
