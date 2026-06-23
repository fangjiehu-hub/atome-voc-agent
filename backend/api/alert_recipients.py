"""Admin → Alert Setting: manage alert recipients (email + Lark group lists).

CRUD over the two global lists that high-engagement alerts are pushed to.
All routes are admin-gated (mounted with require_admin in main.py).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.alert_recipient import AlertRecipient
from backend.schemas.alert_recipient import (
    AlertRecipientCreate,
    AlertRecipientListResponse,
    AlertRecipientOut,
    AlertRecipientUpdate,
)

router = APIRouter(prefix="/api/v2/alert-recipients", tags=["alert-recipients"])


@router.get("", response_model=AlertRecipientListResponse)
async def list_recipients(
    channel: str | None = Query(None, pattern="^(email|lark_group)$"),
    db: AsyncSession = Depends(get_db),
):
    q = select(AlertRecipient)
    if channel:
        q = q.where(AlertRecipient.channel == channel)
    q = q.order_by(AlertRecipient.channel, AlertRecipient.id)
    rows = (await db.execute(q)).scalars().all()
    return AlertRecipientListResponse(
        items=[AlertRecipientOut.model_validate(r) for r in rows], total=len(rows)
    )


@router.post("", response_model=AlertRecipientOut, status_code=status.HTTP_201_CREATED)
async def create_recipient(body: AlertRecipientCreate, db: AsyncSession = Depends(get_db)):
    target = body.target.strip()
    if not target:
        raise HTTPException(400, "target is required")
    if body.channel == "lark_group" and not target.lower().startswith("https://"):
        raise HTTPException(400, "Lark group webhook must be an https URL")
    if body.channel == "email" and "@" not in target:
        raise HTTPException(400, "email must be a valid address")
    r = AlertRecipient(channel=body.channel, target=target, label=(body.label or None), enabled=body.enabled)
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return AlertRecipientOut.model_validate(r)


async def _get(db: AsyncSession, rid: int) -> AlertRecipient:
    r = (await db.execute(select(AlertRecipient).where(AlertRecipient.id == rid))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Recipient not found")
    return r


@router.put("/{rid}", response_model=AlertRecipientOut)
async def update_recipient(rid: int, body: AlertRecipientUpdate, db: AsyncSession = Depends(get_db)):
    r = await _get(db, rid)
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(r, field, value)
    await db.commit()
    await db.refresh(r)
    return AlertRecipientOut.model_validate(r)


@router.patch("/{rid}/toggle", response_model=AlertRecipientOut)
async def toggle_recipient(rid: int, db: AsyncSession = Depends(get_db)):
    r = await _get(db, rid)
    r.enabled = not r.enabled
    await db.commit()
    await db.refresh(r)
    return AlertRecipientOut.model_validate(r)


@router.delete("/{rid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recipient(rid: int, db: AsyncSession = Depends(get_db)):
    r = await _get(db, rid)
    await db.delete(r)
    await db.commit()


@router.post("/{rid}/test")
async def test_recipient(rid: int, db: AsyncSession = Depends(get_db)):
    """Send a test message to this recipient."""
    r = await _get(db, rid)
    if r.channel == "lark_group":
        from backend.services.safe_http import safe_webhook_post
        ok, msg = await safe_webhook_post(
            r.target,
            json={"msg_type": "text", "content": {"text": "[Atome VoC] 🔔 Test — alert recipient is working."}},
        )
    else:
        from backend.services.email_sender import build_alert_html, send_alert_email
        body = "This is a test message from the Atome VoC Early Warning Agent. Email delivery is working."
        ok, msg = await send_alert_email(
            to_address=r.target,
            subject="[Atome VoC] Test alert",
            body_text=body,
            body_html=build_alert_html(title="Test Alert", taxonomy_label="test", body=body),
        )
    if not ok:
        raise HTTPException(502, msg)
    return {"success": True, "message": "Test sent successfully."}
