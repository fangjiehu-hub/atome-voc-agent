"""POST /crawler/run — trigger a crawl job."""

from fastapi import APIRouter, BackgroundTasks, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db

router = APIRouter(prefix="/api/crawler", tags=["crawler"])


class CrawlRequest(BaseModel):
    platform: str  # twitter | reddit | all
    lookback_hours: int = 24


class CrawlResponse(BaseModel):
    status: str
    message: str


@router.post("/run", response_model=CrawlResponse)
async def trigger_crawl(
    req: CrawlRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a crawl job for the specified platform."""
    from backend.services.crawler_reddit import crawl_reddit
    from backend.services.crawler_twitter import crawl_twitter

    if req.platform in ("reddit", "all"):
        background_tasks.add_task(crawl_reddit, req.lookback_hours)
    if req.platform in ("twitter", "all"):
        background_tasks.add_task(crawl_twitter, req.lookback_hours)

    return CrawlResponse(
        status="started",
        message=f"Crawl job started for {req.platform} (lookback={req.lookback_hours}h)",
    )


class ReclusterRequest(BaseModel):
    lookback_hours: int = 720


@router.post("/recluster", response_model=CrawlResponse)
async def trigger_recluster(
    req: ReclusterRequest,
    background_tasks: BackgroundTasks,
):
    """Re-cluster existing posts without re-crawling."""
    from backend.services.clustering import cluster_posts
    from backend.services.alerting import check_and_send_alerts

    async def _recluster(lookback_hours: int):
        await cluster_posts(lookback_hours)
        await check_and_send_alerts()

    background_tasks.add_task(_recluster, req.lookback_hours)

    return CrawlResponse(
        status="started",
        message=f"Recluster started (lookback={req.lookback_hours}h)",
    )


@router.post("/realert", response_model=CrawlResponse)
async def trigger_realert(background_tasks: BackgroundTasks):
    """Reset acknowledged incidents to 'new' and re-run alerting."""
    from sqlalchemy import and_, update
    from backend.database import async_session
    from backend.models.incident import Incident
    from backend.services.alerting import check_and_send_alerts

    async def _realert():
        async with async_session() as db:
            # Reset acknowledged incidents back to new so alerting picks them up
            await db.execute(
                update(Incident)
                .where(
                    and_(
                        Incident.status == "acknowledged",
                        Incident.severity.in_(["critical", "high", "medium"]),
                    )
                )
                .values(status="new")
            )
            await db.commit()
        await check_and_send_alerts()

    background_tasks.add_task(_realert)

    return CrawlResponse(
        status="started",
        message="Re-alerting started for acknowledged incidents",
    )
