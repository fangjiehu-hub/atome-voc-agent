from datetime import datetime

from pydantic import BaseModel


class LarkBotCreate(BaseModel):
    team_name: str
    webhook_url: str
    description: str = ""


class LarkBotUpdate(BaseModel):
    webhook_url: str | None = None
    description: str | None = None
    is_active: bool | None = None


class LarkBotOut(BaseModel):
    id: int
    team_name: str
    webhook_url: str
    description: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
