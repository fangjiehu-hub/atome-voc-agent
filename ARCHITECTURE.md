# Atome VoC Agent — Architecture

A social-listening early-warning system for Atome (BNPL). It collects public posts
about Atome, classifies them with an LLM, groups them into issues, and routes
high-signal items to the right team via Lark and email.

## High-level data flow

```
            ┌─────────────── ingestion ───────────────┐
 Apify  ───▶│ crawler_reddit / crawler_twitter         │
 (Reddit/X) │                                          │
 Octo Agent │ crawler_lark_bitable  (FB/TikTok/X/RD)   │──┐
 (Bitable)  └──────────────────────────────────────────┘  │
                                                           ▼
                                        ┌──────────────────────────────┐
                                        │ posts table (PostgreSQL)      │
                                        │ dedup by (platform,brand,id)  │
                                        └──────────────┬────────────────┘
                                                       ▼
            ┌── llm_annotator ──┐   content_hash dedup → skip re-annotation
            │ category, sentiment, summary, cluster_topic (Claude)        │
            └──────────┬─────────┘   engagement scored deterministically
                       ▼
              clustering (group into issues)
                       ▼
       alerting / daily_alert_v2 / weekly_summary_v2
                       ▼
        Lark group webhook  +  Email (per-category routing)
                       ▼
              alert_messages table (history)
```

## Modules

| Area | Files | Responsibility |
|------|-------|----------------|
| Ingestion | `services/crawler_reddit.py`, `crawler_twitter.py`, `crawler_lark_bitable.py` | Pull posts from each source; normalize to the `Post` shape; dedup on insert |
| Annotation | `services/llm_annotator.py`, `llm_prompts.py`, `engagement_calculator.py` | Claude classifies; engagement is computed in code (not trusted from LLM). Content-hash cache skips re-annotating identical text |
| Clustering | `services/clustering.py` | Group related negative posts into issues |
| Alerting | `services/alerting.py`, `daily_alert_v2.py`, `weekly_summary_v2.py`, `lark_alert.py`, `email_sender.py` | Build + deliver alerts; record every send in `alert_messages` |
| API (design) | `api/v2.py` | Endpoints the dashboard consumes (`/api/v2/*`) |
| API (admin) | `api/alert_delivery.py`, `alert_messages.py`, `lark_bots.py`, `routing.py`, `taxonomy.py`, … | Config + management |
| Auth | `api/auth_sso.py`, `auth.py` | Lark SSO login + session; password auth disabled |
| Outbound safety | `services/safe_http.py` | SSRF-safe webhook POST (allowlist + private-IP block) |

## Key design decisions

- **Settings are server-global.** `app_settings` (singleton row) is the source of
  truth for thresholds, sensitive keywords, ownership, secondary (CC) teams,
  display defaults, and digest schedules. The frontend reads from the server; only
  per-reviewer `mentionOverrides` stay in browser localStorage.
- **Two ingestion sources, one pipeline.** Reddit/X come from Apify; Facebook/TikTok
  (and some X/Reddit) come from the Octo Agent's Lark Bitable. Bitable rows arrive
  pre-analyzed, so the sync stamps `annotated_at` to skip a redundant LLM pass.
- **Engagement is deterministic.** Scores/levels are computed from like/reply/repost
  counts in `engagement_calculator`, never taken from the LLM — limits prompt poisoning.
- **Alert delivery is per-category.** Each `alert_delivery_config` row maps a taxonomy
  category to a Lark group webhook and/or an email address, with a priority threshold
  and cooldown.

## Auth model (Lark SSO)

- `GET /api/auth/lark/login` → Lark authorize page → `GET /api/auth/lark/callback`
  exchanges the code, reads the user profile, checks the email domain
  (`ALLOWED_EMAIL_DOMAINS`), and sets an httpOnly session JWT cookie.
- `require_auth` is mounted on every data router; it enforces login only when
  `AUTH_ENFORCED=true`. Public routes: `/health`, `/api/auth/lark/*`.
- The dashboard is a static prototype under `/design`; on a `401` it redirects the
  browser to the Lark login. API calls reach the backend through the Next.js
  same-origin rewrite, so the session cookie is sent automatically.

## Security controls (see the audit report)

- All outbound webhooks go through `safe_http.safe_webhook_post` (https + host
  allowlist + private-IP block + no redirects; errors are not echoed to callers).
- JWT secret is validated at startup; weak/default/short values refuse to boot.
- Alert email fields are HTML-escaped; CORS is locked to explicit origins/methods;
  cost-bearing endpoints (`/translate`, `/crawler/run`) are length/range-capped.

## Deployment

- Backend: Fly.io app `atome-voc-v2-backend` (`fly.backend.toml`), Postgres via
  `DATABASE_URL`. Migrations: `alembic upgrade head`.
- Frontend: Fly.io app `atome-voc-v2-frontend` (deploy from `frontend/`); Next.js
  standalone, rewrites `/api/*` to the backend.
- Scheduler (APScheduler in `main.py`): crawl at the configured hours; a 30-min
  interval job fires the daily alert / weekly summary when their schedule matches.
