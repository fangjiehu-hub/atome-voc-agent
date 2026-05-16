"""Seed the lark_bots table with placeholder entries for each team.

Usage:
    python scripts/seed_lark_bots.py

Each team gets a placeholder webhook URL. Replace with real URLs via the
Settings page or PATCH /api/lark-bots/{id}.
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from backend.database import async_session
from backend.models.lark_bot import LarkBot

BOTS = [
    {"team_name": "Collections", "description": "Collections team alerts"},
    {"team_name": "Product", "description": "Product team alerts"},
    {"team_name": "Engineering", "description": "Engineering team alerts"},
    {"team_name": "Compliance", "description": "Compliance team alerts"},
    {"team_name": "Risk", "description": "Risk team alerts"},
    {"team_name": "Security", "description": "Security team alerts"},
    {"team_name": "CS", "description": "Customer Service alerts"},
    {"team_name": "CS Head", "description": "CS Head escalations"},
    {"team_name": "CS Ops", "description": "CS Operations alerts"},
    {"team_name": "CEO Office", "description": "CEO Office escalations"},
    {"team_name": "PR", "description": "PR/Comms alerts"},
    {"team_name": "Ops", "description": "Operations alerts"},
]

PLACEHOLDER_URL = "https://open.larksuite.com/open-apis/bot/v2/hook/REPLACE_ME"


async def seed():
    async with async_session() as db:
        for bot in BOTS:
            existing = (
                await db.execute(
                    select(LarkBot).where(LarkBot.team_name == bot["team_name"])
                )
            ).scalar_one_or_none()
            if not existing:
                db.add(LarkBot(
                    team_name=bot["team_name"],
                    webhook_url=PLACEHOLDER_URL,
                    description=bot["description"],
                    is_active=False,  # inactive until real URL is configured
                ))
                print(f"  + Lark bot: {bot['team_name']} (inactive, needs real webhook URL)")
            else:
                print(f"  ~ Lark bot: {bot['team_name']} already exists, skipping")

        await db.commit()
        print("Lark bots seeding complete.")


if __name__ == "__main__":
    asyncio.run(seed())
