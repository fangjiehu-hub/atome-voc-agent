"""Seed the routing_rules table with default category-to-department routing."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from backend.database import async_session
from backend.models.routing import RoutingRule

RULES = [
    {
        "category": "debt_collection",
        "severity_min": "low",
        "primary_owner": "Collections",
        "departments": ["Compliance"],
        "escalate_to": ["CEO Office"],
        "channels": ["slack", "lark"],
    },
    {
        "category": "transaction",
        "severity_min": "low",
        "primary_owner": "Product",
        "departments": ["CS", "Ops"],
        "escalate_to": None,
        "channels": ["slack"],
    },
    {
        "category": "app_bug",
        "severity_min": "low",
        "primary_owner": "Engineering",
        "departments": ["Product"],
        "escalate_to": None,
        "channels": ["slack"],
    },
    {
        "category": "interest_rate",
        "severity_min": "low",
        "primary_owner": "Compliance",
        "departments": ["CEO Office", "PR"],
        "escalate_to": ["CEO Office"],
        "channels": ["slack", "email"],
    },
    {
        "category": "fraud",
        "severity_min": "medium",
        "primary_owner": "Risk",
        "departments": ["Security"],
        "escalate_to": ["CEO Office"],
        "channels": ["slack", "lark", "email"],
    },
    {
        "category": "security",
        "severity_min": "medium",
        "primary_owner": "Security",
        "departments": ["Risk"],
        "escalate_to": ["CEO Office"],
        "channels": ["slack", "lark", "email"],
    },
    {
        "category": "customer_service",
        "severity_min": "low",
        "primary_owner": "CS Head",
        "departments": ["CS Ops"],
        "escalate_to": None,
        "channels": ["slack"],
    },
    {
        "category": "refund",
        "severity_min": "low",
        "primary_owner": "CS",
        "departments": ["Product"],
        "escalate_to": None,
        "channels": ["slack"],
    },
    {
        "category": "spend_limit",
        "severity_min": "low",
        "primary_owner": "Product",
        "departments": ["Risk"],
        "escalate_to": None,
        "channels": ["slack"],
    },
    {
        "category": "account",
        "severity_min": "low",
        "primary_owner": "CS",
        "departments": ["Product"],
        "escalate_to": None,
        "channels": ["slack"],
    },
]


async def seed():
    async with async_session() as db:
        for rule in RULES:
            existing = (
                await db.execute(
                    select(RoutingRule).where(RoutingRule.category == rule["category"])
                )
            ).scalar_one_or_none()
            if not existing:
                db.add(RoutingRule(**rule))
                print(f"  + Routing rule: {rule['category']} -> {rule['primary_owner']} (+ {rule['departments']})")

        await db.commit()
        print("Routing rules seeding complete.")


if __name__ == "__main__":
    asyncio.run(seed())
