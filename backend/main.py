"""FastAPI entry point for Atome VoC Early Warning Agent."""

from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import alert_delivery, alert_messages, alert_recipients, alerts, analytics, auth, crawler, feedback, incidents, lark_bots, monitor, routing, taxonomy, v2
from backend.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Refuse to start with a weak/default JWT secret (audit H-1).
    if settings.jwt_secret in ("", "change-me-in-production") or len(settings.jwt_secret) < 32:
        raise RuntimeError(
            "JWT_SECRET is missing, default, or too short (need ≥32 chars). "
            "Set a strong random JWT_SECRET before starting."
        )

    # Start APScheduler for crawl cron jobs
    scheduler = AsyncIOScheduler(timezone=settings.tz)

    hours = [int(h) for h in settings.crawl_schedule_hours.split(",")]
    for hour in hours:
        scheduler.add_job(
            _scheduled_crawl,
            "cron",
            hour=hour,
            minute=settings.crawl_schedule_minute,
            id=f"crawl_{hour}",
            replace_existing=True,
        )

    # Alert schedule checker — runs every 30 minutes, service functions handle time-matching
    scheduler.add_job(
        _check_alert_schedules,
        IntervalTrigger(minutes=30),
        id="alert_schedule_check",
        replace_existing=True,
    )

    scheduler.start()
    yield
    scheduler.shutdown()


async def _scheduled_crawl():
    """Daily data refresh: Lark Bitable sync (Octo Agent) → annotate → cluster → alert.

    Octo refreshes the Bitable ~09:00-10:00; we run after that (default 10:30).
    The direct Apify crawlers are off by default (Octo/Bitable is the source); set
    ENABLE_APIFY_CRAWLERS=true to also run them.
    """
    from backend.services.crawler_lark_bitable import crawl_lark_bitable

    if settings.enable_apify_crawlers:
        from backend.services.crawler_reddit import crawl_reddit
        from backend.services.crawler_twitter import crawl_twitter
        await crawl_reddit(lookback_hours=12)
        await crawl_twitter(lookback_hours=12)

    await crawl_lark_bitable()


async def _check_alert_schedules():
    """Fire the daily high-engagement alert if there are new high-engagement posts."""
    from backend.services.daily_alert_v2 import generate_and_send_daily_alert

    await generate_and_send_daily_alert()
    # Weekly summary is disabled: alerting is now exclusively the daily
    # high-engagement push (Alert History records only high-engagement sends).


app = FastAPI(
    title="Atome VoC Early Warning Agent",
    version="0.1.0",
    lifespan=lifespan,
)

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


_cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip() and o.strip() != "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Auth: Lark SSO endpoints stay open (login/callback/me/logout).
from backend.api import auth_sso
from backend.api.auth_sso import require_admin, require_auth

app.include_router(auth.router)
app.include_router(auth_sso.router)

# Any authenticated user (viewer+): read/monitoring routers.
_auth = [Depends(require_auth)]
# Admin only: configuration / management / cost-bearing operational routers.
_admin = [Depends(require_admin)]

app.include_router(monitor.router, dependencies=_auth)
app.include_router(incidents.router, dependencies=_auth)
app.include_router(alerts.router, dependencies=_auth)
app.include_router(feedback.router, dependencies=_auth)
app.include_router(taxonomy.router, dependencies=_auth)
app.include_router(analytics.router, dependencies=_auth)
app.include_router(alert_messages.router, dependencies=_auth)
# v2 — design-aligned endpoints. Mostly read; PATCH /settings is admin-gated
# at the route level inside v2.py.
app.include_router(v2.router, dependencies=_auth)
# Admin-only management surfaces:
app.include_router(crawler.router, dependencies=_admin)
app.include_router(lark_bots.router, dependencies=_admin)
app.include_router(routing.router, dependencies=_admin)
app.include_router(alert_delivery.router, dependencies=_admin)
app.include_router(alert_recipients.router, dependencies=_admin)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "atome-voc-agent"}
