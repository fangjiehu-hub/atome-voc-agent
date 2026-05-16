"""FastAPI entry point for Atome VoC Early Warning Agent."""

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import alerts, analytics, auth, crawler, feedback, incidents, lark_bots, monitor, routing, taxonomy
from backend.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start APScheduler for crawl cron jobs
    scheduler = AsyncIOScheduler(timezone=settings.tz)

    hours = [int(h) for h in settings.crawl_schedule_hours.split(",")]
    for hour in hours:
        scheduler.add_job(
            _scheduled_crawl,
            "cron",
            hour=hour,
            minute=0,
            id=f"crawl_{hour}",
            replace_existing=True,
        )

    # Daily digest at configured hour
    scheduler.add_job(
        _scheduled_digest,
        "cron",
        hour=settings.digest_hour,
        minute=0,
        id="daily_digest",
        replace_existing=True,
    )

    scheduler.start()
    yield
    scheduler.shutdown()


async def _scheduled_crawl():
    """Run full crawl pipeline: crawl -> save -> annotate -> cluster -> alert."""
    from backend.services.crawler_reddit import crawl_reddit
    from backend.services.crawler_twitter import crawl_twitter

    await crawl_reddit(lookback_hours=12)
    await crawl_twitter(lookback_hours=12)


async def _scheduled_digest():
    """Send daily digest email."""
    from backend.services.alerting import send_daily_digest

    await send_daily_digest()


app = FastAPI(
    title="Atome VoC Early Warning Agent",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(monitor.router)
app.include_router(crawler.router)
app.include_router(incidents.router)
app.include_router(alerts.router)
app.include_router(feedback.router)
app.include_router(taxonomy.router)
app.include_router(analytics.router)
app.include_router(auth.router)
app.include_router(lark_bots.router)
app.include_router(routing.router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "atome-voc-agent"}
