"""Legacy password auth — DISABLED.

The application now authenticates exclusively via Lark SSO (see auth_sso.py).
Password login and open self-registration are disabled to close the
open-registration / brute-force surface (audit H-1, M-4). The routes remain
mounted only to return a clear 403 for any stale client.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/auth", tags=["auth"])

_SSO_ONLY = "Password authentication is disabled. Sign in with Lark SSO at /api/auth/lark/login."


class LoginRequest(BaseModel):
    email: str
    password: str


class RegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    department: str | None = None


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    department: str | None
    role: str

    model_config = {"from_attributes": True}


@router.post("/login")
async def login(req: LoginRequest):
    raise HTTPException(403, _SSO_ONLY)


@router.post("/register")
async def register(req: RegisterRequest):
    raise HTTPException(403, _SSO_ONLY)

# NOTE: GET /api/auth/me is served by auth_sso.py (Lark SSO session).
