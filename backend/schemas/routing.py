from datetime import datetime

from pydantic import BaseModel


class RoutingRuleCreate(BaseModel):
    category: str
    severity_min: str = "low"
    primary_owner: str = ""
    departments: list[str] = []
    escalate_to: list[str] | None = None
    channels: list[str] = ["slack"]
    is_active: bool = True


class RoutingRuleUpdate(BaseModel):
    severity_min: str | None = None
    primary_owner: str | None = None
    departments: list[str] | None = None
    escalate_to: list[str] | None = None
    channels: list[str] | None = None
    is_active: bool | None = None


class RoutingRuleOut(BaseModel):
    id: int
    category: str
    severity_min: str
    primary_owner: str
    departments: list[str]
    escalate_to: list[str] | None
    channels: list[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RoutingRuleListResponse(BaseModel):
    items: list[RoutingRuleOut]
    total: int
