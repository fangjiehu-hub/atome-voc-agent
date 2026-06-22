"""Lark SSO ("Login with Lark") + session auth for the VoC dashboard.

Flow:
  1. GET /api/auth/lark/login          → 302 to Lark authorize page
  2. GET /api/auth/lark/callback?code= → exchange code, fetch user info,
                                          verify org/email, set session cookie,
                                          302 back to the dashboard
  3. GET /api/auth/me                  → current session user (or 401)
  4. POST /api/auth/logout             → clear session cookie

`require_auth` is the dependency mounted on protected routers. While
settings.auth_enforced is False it allows anonymous traffic (so nothing breaks
during rollout); once True it requires a valid session cookie.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse

from backend.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])

LARK_API = "https://open.larksuite.com/open-apis"
_TOKEN_URL = f"{LARK_API}/authen/v2/oauth/token"
_USERINFO_URL = f"{LARK_API}/authen/v1/user_info"
_STATE_COOKIE = "voc_oauth_state"


# ── session token helpers ────────────────────────────────────────────────────

def _is_admin(email: str | None) -> bool:
    admins = [e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()]
    return bool(email) and email.lower() in admins


def issue_session_token(user: dict) -> str:
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": user.get("open_id") or user.get("user_id") or "",
        "name": user.get("name", ""),
        "email": user.get("email", ""),
        "role": "admin" if _is_admin(user.get("email")) else "viewer",
        "iss": "atome-voc",
        "aud": "atome-voc-dashboard",
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _decode_session(token: str) -> dict | None:
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            audience="atome-voc-dashboard",
            issuer="atome-voc",
        )
    except jwt.PyJWTError:
        return None


def current_user(request: Request) -> dict | None:
    """Return the session user from the cookie (or service-key header), or None."""
    # Machine/ops access: a valid X-Service-Key grants admin (bypasses SSO).
    svc = request.headers.get("X-Service-Key")
    if svc and settings.service_api_key and secrets.compare_digest(svc, settings.service_api_key):
        return {"sub": "service", "name": "service", "email": "service@internal", "role": "admin"}

    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        return None
    return _decode_session(token)


async def require_auth(request: Request) -> dict | None:
    """Router dependency. Enforces login only when settings.auth_enforced is True."""
    user = current_user(request)
    if settings.auth_enforced and not user:
        raise HTTPException(401, "Authentication required")
    return user


async def require_admin(request: Request) -> dict | None:
    """Router/route dependency. Requires an admin-role session (config & management).

    When auth is not enforced (local dev) it allows through for convenience.
    """
    user = current_user(request)
    if not settings.auth_enforced:
        return user
    if not user:
        raise HTTPException(401, "Authentication required")
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user


def _email_allowed(email: str | None) -> bool:
    domains = [d.strip().lower() for d in settings.allowed_email_domains.split(",") if d.strip()]
    if not domains:
        return True  # no restriction configured
    if not email:
        return False
    return any(email.lower().endswith("@" + d) for d in domains)


# ── routes ───────────────────────────────────────────────────────────────────

@router.get("/lark/login")
async def lark_login():
    """Redirect the browser to the Lark authorization page."""
    if not settings.lark_app_id:
        raise HTTPException(500, "Lark SSO not configured (LARK_APP_ID missing)")
    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.lark_app_id,
        "redirect_uri": settings.lark_oauth_redirect_uri,
        "response_type": "code",
        "state": state,
    }
    url = f"{settings.lark_oauth_authorize_base}?{urlencode(params)}"
    resp = RedirectResponse(url, status_code=302)
    # CSRF: remember the state in a short-lived cookie, verify on callback
    resp.set_cookie(_STATE_COOKIE, state, max_age=600, httponly=True, secure=True, samesite="lax")
    return resp


@router.get("/lark/callback")
async def lark_callback(request: Request, code: str | None = None, state: str | None = None):
    """Handle the Lark redirect: exchange code → user info → session cookie."""
    if not code:
        raise HTTPException(400, "Missing authorization code")
    expected_state = request.cookies.get(_STATE_COOKIE)
    if not expected_state or state != expected_state:
        raise HTTPException(400, "Invalid OAuth state")

    async with httpx.AsyncClient(timeout=15) as client:
        # 1. Exchange code for a user access token
        token_resp = await client.post(
            _TOKEN_URL,
            json={
                "grant_type": "authorization_code",
                "client_id": settings.lark_app_id,
                "client_secret": settings.lark_app_secret,
                "code": code,
                "redirect_uri": settings.lark_oauth_redirect_uri,
            },
            headers={"Content-Type": "application/json"},
        )
        token_data = token_resp.json()
        user_token = token_data.get("access_token")
        if not user_token:
            logger.error("Lark token exchange failed: %s", token_data)
            raise HTTPException(502, "Lark login failed (token exchange).")

        # 2. Fetch the user's profile
        info_resp = await client.get(
            _USERINFO_URL, headers={"Authorization": f"Bearer {user_token}"}
        )
        info = info_resp.json()
        if info.get("code", 0) != 0:
            logger.error("Lark user_info failed: %s", info)
            raise HTTPException(502, "Lark login failed (user info).")
        data = info.get("data", {})

    email = data.get("enterprise_email") or data.get("email") or ""
    if not _email_allowed(email):
        logger.warning("Login rejected for email domain: %s", email or "(none)")
        raise HTTPException(403, "Your account is not authorized for this application.")

    user = {"open_id": data.get("open_id"), "name": data.get("name"), "email": email}
    session = issue_session_token(user)

    resp = RedirectResponse(f"{settings.frontend_base_url}/design/atome-voc.html", status_code=302)
    resp.set_cookie(
        settings.session_cookie_name,
        session,
        max_age=settings.jwt_expire_minutes * 60,
        httponly=True,
        secure=True,
        samesite="lax",
    )
    resp.delete_cookie(_STATE_COOKIE)
    return resp


@router.get("/me")
async def me(request: Request):
    user = current_user(request)
    if not user:
        raise HTTPException(401, "Not authenticated")
    return {
        "name": user.get("name"),
        "email": user.get("email"),
        "sub": user.get("sub"),
        "role": user.get("role", "viewer"),
    }


@router.post("/logout")
async def logout():
    resp = JSONResponse({"ok": True})
    resp.delete_cookie(settings.session_cookie_name)
    return resp
