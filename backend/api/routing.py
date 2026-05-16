from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.routing import RoutingRule
from backend.schemas.routing import (
    RoutingRuleCreate,
    RoutingRuleListResponse,
    RoutingRuleOut,
    RoutingRuleUpdate,
)

router = APIRouter(prefix="/api/routing", tags=["routing"])

# Default rules to seed when table is empty
DEFAULT_RULES = [
    {"category": "debt_collection", "severity_min": "low", "primary_owner": "Collections", "departments": ["Compliance"], "escalate_to": ["CEO Office"], "channels": ["slack", "lark"]},
    {"category": "transaction", "severity_min": "low", "primary_owner": "Product", "departments": ["CS", "Ops"], "escalate_to": None, "channels": ["slack"]},
    {"category": "app_bug", "severity_min": "low", "primary_owner": "Engineering", "departments": ["Product"], "escalate_to": None, "channels": ["slack"]},
    {"category": "interest_rate", "severity_min": "low", "primary_owner": "Compliance", "departments": ["CEO Office", "PR"], "escalate_to": ["CEO Office"], "channels": ["slack", "email"]},
    {"category": "fraud", "severity_min": "medium", "primary_owner": "Risk", "departments": ["Security"], "escalate_to": ["CEO Office"], "channels": ["slack", "lark", "email"]},
    {"category": "security", "severity_min": "medium", "primary_owner": "Security", "departments": ["Risk"], "escalate_to": ["CEO Office"], "channels": ["slack", "lark", "email"]},
    {"category": "customer_service", "severity_min": "low", "primary_owner": "CS Head", "departments": ["CS Ops"], "escalate_to": None, "channels": ["slack"]},
    {"category": "refund", "severity_min": "low", "primary_owner": "CS", "departments": ["Product"], "escalate_to": None, "channels": ["slack"]},
    {"category": "spend_limit", "severity_min": "low", "primary_owner": "Product", "departments": ["Risk"], "escalate_to": None, "channels": ["slack"]},
    {"category": "account", "severity_min": "low", "primary_owner": "CS", "departments": ["Product"], "escalate_to": None, "channels": ["slack"]},
]


@router.get("", response_model=RoutingRuleListResponse)
async def list_routing_rules(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(RoutingRule))).scalar() or 0

    # Auto-seed defaults if table is empty
    if total == 0:
        for rule_data in DEFAULT_RULES:
            db.add(RoutingRule(**rule_data))
        await db.commit()
        total = len(DEFAULT_RULES)

    rows = (
        await db.execute(
            select(RoutingRule).order_by(RoutingRule.category)
        )
    ).scalars().all()

    return RoutingRuleListResponse(
        items=[RoutingRuleOut.model_validate(r) for r in rows],
        total=total,
    )


@router.post("", response_model=RoutingRuleOut)
async def create_routing_rule(
    data: RoutingRuleCreate, db: AsyncSession = Depends(get_db)
):
    rule = RoutingRule(**data.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return RoutingRuleOut.model_validate(rule)


@router.patch("/{rule_id}", response_model=RoutingRuleOut)
async def update_routing_rule(
    rule_id: int, data: RoutingRuleUpdate, db: AsyncSession = Depends(get_db)
):
    rule = (
        await db.execute(select(RoutingRule).where(RoutingRule.id == rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Routing rule not found")

    for field, value in data.model_dump(exclude_none=True).items():
        setattr(rule, field, value)
    await db.commit()
    await db.refresh(rule)
    return RoutingRuleOut.model_validate(rule)


@router.delete("/{rule_id}")
async def delete_routing_rule(
    rule_id: int, db: AsyncSession = Depends(get_db)
):
    rule = (
        await db.execute(select(RoutingRule).where(RoutingRule.id == rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Routing rule not found")

    await db.delete(rule)
    await db.commit()
    return {"status": "deleted"}
