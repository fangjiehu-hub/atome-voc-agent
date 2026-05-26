"""API routes for Alert Delivery Configuration.

Provides CRUD + test endpoints under /api/v2/alert-delivery-configs.
One config per taxonomy category; controls which channels receive VoC alerts
when a post crosses the configured priority threshold.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert_delivery_config import AlertDeliveryConfig
from backend.schemas.alert_delivery_config import (
    AlertDeliveryConfigCreate,
    AlertDeliveryConfigListResponse,
    AlertDeliveryConfigOut,
    AlertDeliveryConfigUpdate,
)

router = APIRouter(prefix="/api/v2/alert-delivery-configs", tags=["alert-delivery"])


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


@router.get("", response_model=AlertDeliveryConfigListResponse)
async def list_configs(db: AsyncSession = Depends(get_db)):
    total = (
        await db.execute(select(func.count()).select_from(AlertDeliveryConfig))
    ).scalar() or 0
    rows = (
        await db.execute(
            select(AlertDeliveryConfig).order_by(AlertDeliveryConfig.taxonomy)
        )
    ).scalars().all()
    return AlertDeliveryConfigListResponse(
        items=[AlertDeliveryConfigOut.model_validate(r) for r in rows],
        total=total,
    )


@router.post("", response_model=AlertDeliveryConfigOut, status_code=status.HTTP_201_CREATED)
async def create_config(body: AlertDeliveryConfigCreate, db: AsyncSession = Depends(get_db)):
    existing = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.taxonomy == body.taxonomy)
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Config for taxonomy '{body.taxonomy}' already exists")

    config = AlertDeliveryConfig(**body.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return AlertDeliveryConfigOut.model_validate(config)


@router.put("/{config_id}", response_model=AlertDeliveryConfigOut)
async def update_config(
    config_id: int, body: AlertDeliveryConfigUpdate, db: AsyncSession = Depends(get_db)
):
    config = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.id == config_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config not found")

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return AlertDeliveryConfigOut.model_validate(config)


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.id == config_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config not found")
    await db.delete(config)
    await db.commit()


# ---------------------------------------------------------------------------
# Toggle
# ---------------------------------------------------------------------------


@router.patch("/{config_id}/toggle", response_model=AlertDeliveryConfigOut)
async def toggle_config(config_id: int, db: AsyncSession = Depends(get_db)):
    config = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.id == config_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config not found")
    config.enabled = not config.enabled
    await db.commit()
    await db.refresh(config)
    return AlertDeliveryConfigOut.model_validate(config)


# ---------------------------------------------------------------------------
# Test delivery
# ---------------------------------------------------------------------------


@router.post("/{config_id}/test-group")
async def test_group_delivery(config_id: int, db: AsyncSession = Depends(get_db)):
    """Send a test message to the configured Lark group webhook."""
    config = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.id == config_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config not found")
    if not config.lark_group_webhook:
        raise HTTPException(400, "No Lark group webhook configured for this category")

    import httpx

    payload = {
        "msg_type": "text",
        "content": {
            "text": (
                f"[Atome VoC] 🔔 Test alert — category: {config.taxonomy}\n"
                "This is a test message from the Atome VoC Early Warning Agent. "
                "If you received this, the Lark group delivery channel is working correctly."
            )
        },
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(config.lark_group_webhook, json=payload)
            resp.raise_for_status()
        return {"success": True, "message": "Test message sent to Lark group successfully."}
    except Exception as exc:
        raise HTTPException(502, f"Lark delivery failed: {exc}") from exc


@router.post("/{config_id}/test-owner-dm")
async def test_owner_dm(config_id: int, db: AsyncSession = Depends(get_db)):
    """Test owner DM delivery (graceful placeholder until bot credentials are configured)."""
    config = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.id == config_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config not found")

    if not config.primary_owner_lark_open_id:
        return {
            "success": False,
            "message": (
                "Owner DM not configured — no Lark Open ID set for this category's "
                "primary owner. Add it in the config to enable personal DM delivery."
            ),
        }

    # Graceful placeholder: DM requires Lark bot credentials in environment
    from backend.config import settings as app_settings

    has_bot_creds = bool(
        getattr(app_settings, "lark_bot_app_id", None)
        and getattr(app_settings, "lark_bot_app_secret", None)
    )
    if not has_bot_creds:
        return {
            "success": False,
            "message": (
                "Owner DM delivery is not yet enabled on this server — "
                "Lark bot credentials (LARK_BOT_APP_ID / LARK_BOT_APP_SECRET) "
                "are not configured. Lark group webhook delivery is available now."
            ),
        }

    # TODO: implement actual Lark DM via bot API once credentials are available
    return {
        "success": False,
        "message": "Owner DM delivery is under development. Use Lark group delivery for now.",
    }


@router.post("/{config_id}/test-all")
async def test_all_channels(config_id: int, db: AsyncSession = Depends(get_db)):
    """Test all configured delivery channels and return per-channel results."""
    config = (
        await db.execute(
            select(AlertDeliveryConfig).where(AlertDeliveryConfig.id == config_id)
        )
    ).scalar_one_or_none()
    if not config:
        raise HTTPException(404, "Config not found")

    channels = config.delivery_channels or []
    results: dict[str, dict] = {}

    if "lark_group" in channels and config.lark_group_webhook:
        import httpx

        payload = {
            "msg_type": "text",
            "content": {
                "text": (
                    f"[Atome VoC] 🔔 All-channel test — {config.taxonomy}\n"
                    "Testing all delivery channels."
                )
            },
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(config.lark_group_webhook, json=payload)
                resp.raise_for_status()
            results["lark_group"] = {"success": True, "message": "Sent successfully"}
        except Exception as exc:
            results["lark_group"] = {"success": False, "message": str(exc)}
    elif "lark_group" in channels:
        results["lark_group"] = {"success": False, "message": "No webhook URL configured"}

    if "owner_dm" in channels:
        results["owner_dm"] = {
            "success": False,
            "message": "Owner DM delivery is under development.",
        }

    return {"taxonomy": config.taxonomy, "results": results}
