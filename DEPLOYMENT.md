# Atome VoC Agent — Internal-Network Deployment Guide

A self-contained handoff for deploying the Atome Voice-of-Customer Early Warning
Agent on an internal network. Hand this file to the deploying team.

---

## 1. Components

| Component | Tech | Port (internal) | Notes |
|-----------|------|-----------------|-------|
| Backend API | FastAPI (Python 3.12) | 8000 | `Dockerfile.backend`; runs as non-root `appuser` |
| Frontend | Next.js 14 standalone (Node 20) | 3000 | `frontend/Dockerfile`; runs as non-root `node`; proxies `/api/*` to backend |
| Database | PostgreSQL 17 | 5432 | Initialize with `scripts/init_db.sql` |

**Request flow:** browser → frontend (443) → Next.js rewrites `/api/*` → backend (8000) → PostgreSQL (5432). Only 443 should be publicly reachable; 8000 and 5432 stay on the internal network.

---

## 2. Prerequisites

- Docker (or a container runtime) for backend + frontend images.
- A PostgreSQL 17 server reachable from the backend on the internal network.
- A Lark (Feishu) self-built app for SSO login + Bitable sync (see §6).
- TLS termination (reverse proxy / load balancer) in front of the frontend on 443.

---

## 3. Database setup

```bash
# 1. Create the database and a dedicated app user with a STRONG password
createdb atome_voc
psql -d atome_voc -c "CREATE USER atome_app WITH PASSWORD '<STRONG_RANDOM_PASSWORD>';"
psql -d atome_voc -c "GRANT ALL PRIVILEGES ON DATABASE atome_voc TO atome_app;"

# 2. Load schema + reference seed data
psql -d atome_voc -f scripts/init_db.sql

# 3. Grant table privileges to the app user
psql -d atome_voc -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO atome_app;"
psql -d atome_voc -c "GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO atome_app;"
```

`scripts/init_db.sql` contains: all 14 tables, indexes, constraints; the 13 taxonomy
categories; the `app_settings` config singleton; and the `alembic_version` stamp
(`010`). It contains **no** runtime/PII data. The backend also runs
`alembic upgrade head` on boot — at rev 010 this is a no-op, and any future
migrations apply incrementally.

---

## 4. Environment variables

Inject via the orchestrator's secret mechanism (env injection / secrets manager).
**Do not hardcode secrets into images or commit them.**

### Required

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql+asyncpg://atome_app:<pw>@db-host:5432/atome_voc` | async driver for the app |
| `JWT_SECRET` | 48+ random chars | **must be ≥32 chars**; app refuses to boot otherwise |
| `AUTH_ENFORCED` | `true` | enforce Lark SSO on all data endpoints |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | LLM annotation + translation |
| `LARK_APP_ID` | `cli_xxx` | Lark SSO + Bitable sync |
| `LARK_APP_SECRET` | `xxx` | |
| `LARK_OAUTH_REDIRECT_URI` | `https://voc.internal.example.com/api/auth/lark/callback` | must match the URL registered in the Lark app console |
| `FRONTEND_BASE_URL` | `https://voc.internal.example.com` | where users land after login |
| `CORS_ORIGINS` | `https://voc.internal.example.com` | comma-separated; never `*` |
| `ALLOWED_EMAIL_DOMAINS` | `advancegroup.com` | only these email domains may log in |
| `ADMIN_EMAILS` | `fangjie.hu@advancegroup.com` | comma-separated admins; everyone else is view-only |
| `SERVICE_API_KEY` | 32+ random chars (optional) | machine/ops access via `X-Service-Key` header; empty = disabled |

### Data sources (optional — enable what you use)

| Variable | Purpose |
|----------|---------|
| `APIFY_API_TOKEN` | Reddit/X crawling via Apify |
| `X_TWITTER_COOKIES` | JSON array of x.com cookies (authenticated X scraping) |
| `TWITTER_BEARER_TOKEN` | Twitter API v2 fallback |
| `LARK_BITABLE_BASE_TOKEN` / `LARK_BITABLE_TABLE_ID` / `LARK_BITABLE_VIEW_ID` | Octo Agent Bitable sync (FB/TikTok). Defaults point at the current shared table |

### Alerting (optional)

| Variable | Purpose |
|----------|---------|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` | email alerts (e.g. `smtp.larksuite.com` / `465`) |
| `ALERT_EMAIL_FROM` / `ALERT_EMAIL_TO` | default sender / fallback recipient |
| `LARK_ALERT_WEBHOOK_URL` | default Lark group webhook |

### Schedule / misc (have sane defaults)

| Variable | Default |
|----------|---------|
| `CRAWL_SCHEDULE_HOURS` / `CRAWL_SCHEDULE_MINUTE` | `10` / `30` → daily sync at 10:30 |
| `ENABLE_APIFY_CRAWLERS` | `false` (Octo/Bitable is the source) |
| `TZ` | `Asia/Manila` |
| `API_HOST` / `API_PORT` | `0.0.0.0` / `8000` |

### Frontend build args (non-secret, baked at build)

- `BACKEND_URL` — internal backend hostname, e.g. `http://backend:8000`
- `NEXT_PUBLIC_API_URL` — public backend URL (only used by code that bypasses the rewrite)

---

## 5. Build & run

```bash
# Backend
docker build -f Dockerfile.backend -t atome-voc-backend .
docker run -d --name voc-backend \
  --env-file backend.env \
  -p 127.0.0.1:8000:8000 \
  atome-voc-backend

# Frontend
docker build -f frontend/Dockerfile \
  --build-arg BACKEND_URL=http://voc-backend:8000 \
  --build-arg NEXT_PUBLIC_API_URL=https://voc.internal.example.com \
  -t atome-voc-frontend ./frontend
docker run -d --name voc-frontend \
  -e NODE_ENV=production \
  -p 127.0.0.1:3000:3000 \
  atome-voc-frontend
```

Put a TLS-terminating reverse proxy (nginx/Caddy/LB) in front of the frontend on
**443**. Keep 8000 and 5432 bound to the internal network only (note the
`127.0.0.1:` bind above keeps the container ports off external interfaces).

---

## 6. Lark app console configuration

In the Lark developer console for the self-built app:

1. **Permissions & Scopes** — enable: `bitable:app:readonly`, `contact:user.base:readonly`, `contact:user.email:readonly`. Publish.
2. **Security settings → Redirect URLs** — add `https://voc.internal.example.com/api/auth/lark/callback` (must equal `LARK_OAUTH_REDIRECT_URI`).
3. **Version Management & Release → Availability** — make the app available to the staff who should access the dashboard (all employees, or specific departments). Publish (may need a Lark admin to approve).
4. The Bitable being synced must have this app added as a viewer/collaborator (or be org-readable).

---

## 7. Security checklist (per internal security team)

- [x] `AUTH_ENFORCED=true` — all data endpoints require a Lark SSO session.
- [x] Access limited to `@advancegroup.com` accounts (`ALLOWED_EMAIL_DOMAINS`).
- [x] Only 443 exposed publicly; 8000 (app) and 5432 (DB) internal only.
- [x] All traffic over HTTPS; session cookie is `httponly` + `secure`; HSTS enabled.
- [x] Containers run as non-root (`appuser` / `node`).
- [x] Secrets via env injection / secrets manager — never in code or images.
- [x] Outbound webhooks are SSRF-guarded (https + provider allowlist + private-IP block).
- [ ] Set a strong PostgreSQL password (no default creds); do not expose 5432 externally.
- [ ] Restrict DB network access to the backend host only.

---

## 8. Post-deploy verification

```bash
# Backend health (public OK)
curl -s https://voc.internal.example.com/api/../health      # or hit backend:8000/health internally → {"status":"ok"}

# Data requires auth (expect 401 when anonymous)
curl -s -o /dev/null -w "%{http_code}\n" https://voc.internal.example.com/api/v2/settings   # 401

# SSO login redirects to Lark (expect 302)
curl -s -o /dev/null -w "%{http_code}\n" https://voc.internal.example.com/api/auth/lark/login  # 302
```

Then open `https://voc.internal.example.com/` in a browser → it should redirect to
Lark login → after authorizing with an `@advancegroup.com` account → land on the
dashboard with data loaded.

---

## 9. Operations

- **Schema upgrades:** the backend runs `alembic upgrade head` on boot. To run manually: `alembic upgrade head` (uses `DATABASE_URL`).
- **Data sync:** runs automatically once a day at `CRAWL_SCHEDULE_HOURS:CRAWL_SCHEDULE_MINUTE` (default **10:30**, after Octo refreshes the Bitable ~09:00–10:00). Pulls the Lark Bitable → annotate → cluster → alert. The direct Apify crawlers are off unless `ENABLE_APIFY_CRAWLERS=true`.
- **Alerts:** a 30-minute scheduler fires the daily alert / weekly summary when their configured time matches; history is recorded in `alert_messages` and visible under **Monitor → Alert History**.
- **Logs:** application logs to stdout (capture via the container runtime). PII is not logged.
- See `ARCHITECTURE.md` for the full data-flow and module breakdown.

### Authentication & calling protected endpoints

The API authenticates via a **Lark SSO session cookie** (`voc_session`), set after a
browser login. It does **not** read `Authorization: Bearer` — and `JWT_SECRET` is the
signing secret, not a token. So `curl -H "Authorization: Bearer ..."` returns
`401 Authentication required`.

Two ways to reach protected endpoints:

1. **Browser (people):** open the site → Lark SSO login → the cookie is set automatically.
   Only `@advancegroup.com` accounts; `ADMIN_EMAILS` get admin (config/management),
   everyone else is view-only.
2. **Machine / ops (scripts):** set a strong `SERVICE_API_KEY` in `.env`, then send it
   as the `X-Service-Key` header (treated as admin, bypasses SSO):

   ```bash
   curl -X POST http://<host>:8000/api/crawler/run \
     -H "Content-Type: application/json" \
     -H "X-Service-Key: $SERVICE_API_KEY" \
     -d '{"platform":"all","lookback_hours":24}'
   ```
   Leave `SERVICE_API_KEY` empty to disable this path (SSO only).

### Manually forcing a data sync (no HTTP / no auth)

On the server, run the pipeline function directly:

```bash
# bare-metal venv:
python -c "import asyncio; from backend.services.crawler_lark_bitable import crawl_lark_bitable; asyncio.run(crawl_lark_bitable())"

# docker:
docker compose -f docker-compose.prod.yml exec backend \
  python -c "import asyncio; from backend.services.crawler_lark_bitable import crawl_lark_bitable; asyncio.run(crawl_lark_bitable())"
```

### Historical data cleanup (only if pre-fix data was synced)

```bash
python -m scripts.cleanup_data --dry-run   # preview
python -m scripts.cleanup_data             # apply (relevance / X→twitter merge / ai_analysis backfill)
```
