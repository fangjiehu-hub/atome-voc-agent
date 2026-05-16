import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.lark_bot import LarkBot
from backend.schemas.lark_bot import LarkBotCreate, LarkBotOut, LarkBotUpdate

router = APIRouter(prefix="/api/lark-bots", tags=["lark-bots"])


@router.get("", response_model=list[LarkBotOut])
@router.get("/", response_model=list[LarkBotOut], include_in_schema=False)
async def list_lark_bots(db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(select(LarkBot).order_by(LarkBot.team_name))
    ).scalars().all()
    return [LarkBotOut.model_validate(r) for r in rows]


@router.post("", response_model=LarkBotOut)
@router.post("/", response_model=LarkBotOut, include_in_schema=False)
async def create_lark_bot(body: LarkBotCreate, db: AsyncSession = Depends(get_db)):
    existing = (
        await db.execute(select(LarkBot).where(LarkBot.team_name == body.team_name))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(409, f"Bot for team '{body.team_name}' already exists")

    record = LarkBot(**body.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return LarkBotOut.model_validate(record)


@router.patch("/{bot_id}", response_model=LarkBotOut)
async def update_lark_bot(
    bot_id: int, body: LarkBotUpdate, db: AsyncSession = Depends(get_db)
):
    bot = (
        await db.execute(select(LarkBot).where(LarkBot.id == bot_id))
    ).scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Lark bot not found")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(bot, field, value)
    await db.commit()
    await db.refresh(bot)
    return LarkBotOut.model_validate(bot)


@router.delete("/{bot_id}")
async def delete_lark_bot(bot_id: int, db: AsyncSession = Depends(get_db)):
    bot = (
        await db.execute(select(LarkBot).where(LarkBot.id == bot_id))
    ).scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Lark bot not found")
    await db.delete(bot)
    await db.commit()
    return {"ok": True}


@router.post("/{bot_id}/test")
async def test_lark_bot(bot_id: int, db: AsyncSession = Depends(get_db)):
    bot = (
        await db.execute(select(LarkBot).where(LarkBot.id == bot_id))
    ).scalar_one_or_none()
    if not bot:
        raise HTTPException(404, "Lark bot not found")

    payload = {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {"tag": "plain_text", "content": "Atome VoC Test Message"},
                "template": "blue",
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": (
                            f"**Team:** {bot.team_name}\n"
                            "**Status:** This bot is connected and working.\n"
                            "**Source:** Atome VoC Early Warning Agent"
                        ),
                    },
                }
            ],
        },
    }

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(bot.webhook_url, json=payload, timeout=10)
        if resp.status_code == 200:
            return {"ok": True, "message": "Test message sent successfully"}
        return {"ok": False, "message": f"Lark returned HTTP {resp.status_code}"}
    except httpx.RequestError as exc:
        return {"ok": False, "message": f"Request failed: {exc}"}
