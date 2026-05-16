# Atome VoC Early Warning Agent — Code Handoff Report for Fangjie

> Generated from repo analysis on 2026-05-15. Only contains facts verifiable from code, git history, and config files.

---

## 1. System Overview

### Pipeline Description

The system is a social media monitoring agent for Atome PH (Philippines market). The pipeline runs as follows:

1. **Crawl** — APScheduler triggers `crawl_reddit()` and `crawl_twitter()` at configured hours. Each crawler tries Apify first, falls back to Brave Search, then direct API scraping. Posts mentioning "Atome" and related Filipino/English keywords are collected from 4 subreddits and X/Twitter.
2. **Save** — Crawled posts are batch-inserted into the `posts` table via `POST /api/monitor/save` with `ON CONFLICT DO NOTHING` deduplication on `(platform, brand, post_id)`.
3. **Annotate** — `llm_annotator.py` sends unannotated posts to Claude Sonnet in batches of 8. The LLM returns `is_negative`, `category`, `sub_issues`, `severity`, `language`, and `summary` per post.
4. **Severity Override** — `severity_calculator.py` applies 9 rule-based overrides (engagement thresholds, category risk floors, cluster size) on top of LLM severity.
5. **Cluster** — `clustering.py` groups negative posts by `(category, platform)` within the lookback window into incidents. Existing open incidents are matched; new ones are created with auto-generated `INC-YYYY-MMDD-##` codes.
6. **Alert** — `alerting.py` looks up routing rules for each incident's category, then creates alerts per channel (Slack, Lark, Email). Severity determines cadence: critical/high → immediate push, medium → queued, low/none → daily digest.

### What's Actually Running vs What's in README/PRD

| Capability | Status |
|---|---|
| X/Twitter crawler (Apify + Brave fallback) | Running |
| Reddit crawler (Apify + Brave + direct fallback) | Running |
| LLM annotation (Claude Sonnet) | Running |
| Severity calculator (rule-based overrides) | Running |
| Clustering (category + platform) | Running |
| Alert routing (per routing_rules table) | Running |
| Lark webhook delivery | Running |
| Slack webhook delivery | Code exists, not confirmed active <需 Dong 人工回答: Slack webhook是否配置了?> |
| Email (SMTP) delivery | Code exists, SMTP not configured on Fly.io |
| Daily digest email | Code exists, skips at runtime ("SMTP not configured") |
| Facebook / Google Play / App Store crawlers | Not implemented (PRD mentions them) |
| Semantic similarity clustering | Not implemented (current clustering is by exact category+platform, not embeddings) |
| Weighted severity formula (10 dimensions from PRD) | Partially — uses engagement + category risk + cluster size, not all 10 dimensions |
| Human feedback → model retraining | Feedback is stored but not fed back to the LLM |
| Weekly trend report | Not implemented |
| JIRA integration | Not implemented |
| Multi-market support | Hardcoded to Philippines only |
| WhatsApp alerts | Not implemented |

### Top-Level Documents

| File | Coverage |
|---|---|
| `README.md` | System overview, architecture, features, quick start, API endpoints, database schema, tech stack, cost estimates |
| `atome_social_media_monitoring_agent_prd.md` | 789-line PRD with background, vision, business goals, users, use cases, FR1–FR10, non-functional requirements, data model, severity framework, alert rules, MVP phases |
| `Atome Customer Voice Agent Building - A Step by Step Tutorial.md` | Brief intro directing to the PRD for design details |

No `ARCHITECTURE.md`, `CONTRIBUTING.md`, or `CHANGELOG.md` exists.

---

## 2. Code Module Inventory

### backend/services/ — Every File

| File | Purpose | Key Functions |
|---|---|---|
| `crawler_reddit.py` | Reddit crawling via Apify → Brave → direct API | `crawl_reddit(lookback_hours=24)`, `_crawl_via_apify()`, `_crawl_via_brave()`, `_crawl_direct()`, `_search_subreddit()`, `_save_posts()` |
| `crawler_twitter.py` | X/Twitter crawling via Apify → Brave | `crawl_twitter(lookback_hours=24)`, `_crawl_via_apify()`, `_crawl_via_brave()`, `_brave_search()`, `_save_posts()` |
| `llm_annotator.py` | Batch Claude annotation of posts | `annotate_unannotated_posts(limit=100)`, `_classify_batch(posts)`, `_apply_results(db, posts, results)` |
| `llm_prompts.py` | System prompt + user template for LLM | `SYSTEM_PROMPT`, `BATCH_USER_TEMPLATE`, `format_posts_block(posts)` |
| `severity_calculator.py` | Rule-based severity overrides | `apply_severity_overrides(llm_severity, category, likes, replies, reposts, cluster_count)`, `severity_index(sev)` |
| `clustering.py` | Groups posts into incidents by (category, platform) | `cluster_posts(lookback_hours=48)`, `_generate_title()`, `_update_incident_severity()` |
| `alerting.py` | Dispatches alerts to Slack/Lark/Email | `check_and_send_alerts()`, `send_daily_digest()`, `_resolve_lark_webhooks()`, `_send_slack()`, `_send_lark()`, `_send_email()` |
| `dedup.py` | Dedup, brand-mention check, noise filtering | `content_hash(text)`, `is_too_short(text, min=30)`, `mentions_brand(text)`, `is_official_account(handle)`, `is_noise_account(handle)`, `is_ph_relevant(text)` |

### backend/api/ — Every Endpoint

| Method | Path | Function | Description |
|---|---|---|---|
| GET | `/api/analytics/overview` | `overview()` | KPI metrics with period-over-period deltas |
| GET | `/api/analytics/trend` | `trend()` | Daily severity counts with zero-fill |
| GET | `/api/analytics/categories` | `categories()` | Category distribution with percentages |
| GET | `/api/analytics/channels` | `channels()` | Platform breakdown (twitter vs reddit) |
| GET | `/api/analytics/severity-distribution` | `severity_distribution()` | Severity counts + percentages |
| GET | `/api/analytics/drilldown` | `drilldown(date)` | Date deep-dive: categories, severity, top posts |
| GET | `/api/incidents` | `list_incidents()` | Paginated incidents with severity/status/category filters |
| GET | `/api/incidents/{id}` | `get_incident()` | Single incident + all related posts |
| PATCH | `/api/incidents/{id}` | `update_incident()` | Update status/assigned_to/etc |
| GET | `/api/alerts` | `list_alerts()` | Paginated alerts with channel/severity filters |
| POST | `/api/alerts/{id}/ack` | `acknowledge_alert()` | Set acknowledged_at timestamp |
| GET | `/api/monitor/query` | `query_posts()` | Filter posts by platform/category/severity/search |
| POST | `/api/monitor/save` | `save_posts()` | Upsert crawled posts (ON CONFLICT DO NOTHING) |
| POST | `/api/crawler/run` | `trigger_crawl()` | Background crawl for twitter/reddit/all |
| POST | `/api/crawler/recluster` | `trigger_recluster()` | Re-cluster existing posts (default 720h lookback) |
| POST | `/api/crawler/realert` | `trigger_realert()` | Reset acknowledged incidents → re-run alerting |
| GET | `/api/taxonomy/categories` | `list_categories()` | List categories (auto-seeds 11 defaults if empty) |
| POST | `/api/taxonomy/categories` | `create_category()` | Create new category |
| PATCH | `/api/taxonomy/categories/{id}` | `update_category()` | Update category |
| GET | `/api/taxonomy/sub-issues` | `list_sub_issues()` | List sub-issues (auto-seeds 28 defaults if empty) |
| POST | `/api/taxonomy/sub-issues` | `create_sub_issue()` | Create sub-issue |
| GET | `/api/routing` | `list_routing_rules()` | List rules (auto-seeds 10 defaults if empty) |
| POST | `/api/routing` | `create_routing_rule()` | Create rule |
| PATCH | `/api/routing/{id}` | `update_routing_rule()` | Update rule |
| DELETE | `/api/routing/{id}` | `delete_routing_rule()` | Delete rule |
| GET | `/api/lark-bots` | `list_lark_bots()` | List Lark bot configs |
| POST | `/api/lark-bots` | `create_lark_bot()` | Create Lark bot |
| PATCH | `/api/lark-bots/{id}` | `update_lark_bot()` | Update bot |
| DELETE | `/api/lark-bots/{id}` | `delete_lark_bot()` | Delete bot |
| POST | `/api/lark-bots/{id}/test` | `test_lark_bot()` | Send test message to webhook |
| GET | `/api/feedback` | `list_feedback()` | List human corrections |
| POST | `/api/feedback` | `create_feedback()` | Submit correction |
| POST | `/api/auth/login` | `login()` | JWT auth (email + password) |
| POST | `/api/auth/register` | `register()` | Create user (default role: viewer) |
| GET | `/api/auth/me` | `me()` | **STUB** — function body is `pass` |
| GET | `/health` | `health()` | Returns `{"status": "ok"}` |

**Total: 35 endpoints across 10 router prefixes + 1 health check.**

### backend/models/ — Every Table

#### `users` (8 columns)
| Column | Type | Constraints |
|---|---|---|
| id | BigInteger | PK, autoincrement |
| email | String(255) | UNIQUE, NOT NULL |
| hashed_password | String(255) | NOT NULL |
| full_name | String(255) | NOT NULL |
| department | String(100) | nullable |
| role | String(50) | default "viewer" |
| is_active | Boolean | default True |
| created_at | DateTime(tz) | server_default now() |

#### `posts` (23 columns)
| Column | Type | Constraints |
|---|---|---|
| id | BigInteger | PK |
| platform | String(20) | NOT NULL |
| brand | String(50) | default "atome_ph" |
| post_id | String(255) | NOT NULL |
| url | Text | nullable |
| author_handle | String(255) | nullable |
| content_text | Text | nullable |
| created_at | DateTime(tz) | nullable |
| collected_at | DateTime(tz) | default now() |
| engagement_likes | Integer | default 0 |
| engagement_replies | Integer | default 0 |
| engagement_reposts | Integer | default 0 |
| raw_json | JSONB | nullable |
| is_negative | Boolean | nullable (AI) |
| category | String(50) | nullable (AI) |
| sub_issues | ARRAY(String) | nullable (AI) |
| severity | String(20) | nullable (AI) |
| language | String(5) | nullable (AI) |
| summary | Text | nullable (AI) |
| ai_explanation | Text | nullable (AI) |
| annotated_at | DateTime(tz) | nullable |
| incident_id | BigInteger | FK → incidents.id |
| is_reviewed | Boolean | default False |

**Unique constraint:** `uq_platform_brand_post(platform, brand, post_id)`
**Indexes:** platform_brand, category, severity, created_at, incident_id

#### `incidents` (15 columns)
| Column | Type | Constraints |
|---|---|---|
| id | BigInteger | PK |
| incident_code | String(30) | UNIQUE |
| title | String(500) | NOT NULL |
| summary | Text | nullable |
| category | String(50) | nullable |
| severity | String(20) | default "low" |
| platforms | ARRAY(String) | nullable |
| post_count | Integer | default 0 |
| first_seen | DateTime(tz) | nullable |
| last_seen | DateTime(tz) | nullable |
| trend_pct | Float | nullable |
| status | String(30) | default "new" |
| assigned_to | BigInteger | FK → users.id |
| assigned_dept | String(100) | nullable |
| created_at / updated_at | DateTime(tz) | auto timestamps |

#### `alerts` (14 columns)
| Column | Type | Constraints |
|---|---|---|
| id | BigInteger | PK |
| incident_id | BigInteger | FK → incidents.id |
| post_id | BigInteger | FK → posts.id |
| alert_type | String(30) | NOT NULL (immediate/queue/digest) |
| severity | String(20) | NOT NULL |
| channel | String(30) | NOT NULL (slack/lark/email) |
| recipients | ARRAY(String) | nullable |
| subject | String(500) | nullable |
| body | Text | nullable |
| payload | JSONB | nullable |
| delivery_status | String(30) | default "pending" |
| acknowledged_at | DateTime(tz) | nullable |
| acknowledged_by | BigInteger | FK → users.id |
| sent_at / created_at | DateTime(tz) | timestamps |

#### `feedback` (9 columns)
| Column | Type | Constraints |
|---|---|---|
| id | BigInteger | PK |
| object_type | String(30) | NOT NULL (post/incident) |
| object_id | BigInteger | NOT NULL |
| field_name | String(50) | NOT NULL |
| original_value | Text | nullable |
| corrected_value | Text | nullable |
| reason | Text | nullable |
| reviewer_id | BigInteger | FK → users.id |
| created_at | DateTime(tz) | default now() |

#### `taxonomy_categories` (8 columns)
key: String(50) UNIQUE — `fraud`, `transaction`, `refund`, `spend_limit`, `account`, `security`, `app_bug`, `customer_service`, `debt_collection`, `interest_rate`, `not_negative`

#### `taxonomy_sub_issues` (7 columns)
key: String(50) UNIQUE — 28 sub-issues mapped to parent categories

#### `routing_rules` (8 columns)
category → primary_owner + departments + escalate_to + channels

#### `lark_bots` (6 columns)
team_name: String(100) UNIQUE → webhook_url

**Foreign key summary:**
- posts.incident_id → incidents.id
- incidents.assigned_to → users.id
- alerts.incident_id → incidents.id
- alerts.post_id → posts.id
- alerts.acknowledged_by → users.id
- feedback.reviewer_id → users.id

### frontend/src/app/ — Page-to-API Mapping

| Route | Page File | API Calls |
|---|---|---|
| `/` | `page.tsx` | None (redirect to /overview) |
| `/overview` | `overview/page.tsx` | `getOverview`, `getTrend`, `getCategories`, `getSeverityDistribution`, `getIncidents`, `getChannels` |
| `/incidents` | `incidents/page.tsx` | `getIncidents` |
| `/incidents/[id]` | `incidents/[id]/page.tsx` | `getIncident` |
| `/alerts` | `alerts/page.tsx` | `getAlerts` |
| `/feedback` | `feedback/page.tsx` | `getFeedback` |
| `/taxonomy` | `taxonomy/page.tsx` | `getTaxonomyCategories`, `getTaxonomySubIssues` |
| `/routing` | `routing/page.tsx` | `getRoutingRules` |
| `/settings` | `settings/page.tsx` | `triggerCrawl`, `getLarkBots`, `createLarkBot`, `updateLarkBot`, `deleteLarkBot`, `testLarkBot` |
| `/methodology` | `methodology/page.tsx` | None (static content) |
| `/analytics` | `analytics/page.tsx` | `getTrend`, `getCategories`, `getSeverityDistribution` |

### Dead Code / Stubs

| Item | Location | Status |
|---|---|---|
| `GET /api/auth/me` | `backend/api/auth.py:99` | Stub — function body is `pass` |
| `IncidentCard` component | `frontend/src/components/IncidentCard.tsx` | Defined but not imported by any page |
| Topbar filter buttons | `frontend/src/components/Topbar.tsx` | Static/non-functional (just display text) |
| `getDrilldown` API function | `frontend/src/lib/api.ts` | Defined; only used from `DrilldownPanel` component on overview page |

---

## 3. Configuration & Dependencies

### .env.example — Every Variable

| Variable | Purpose | Required | Default |
|---|---|---|---|
| `DATABASE_URL` | Async PostgreSQL connection string | Yes | `postgresql+asyncpg://atome:atome_secret@localhost:5432/atome_voc` |
| `DATABASE_URL_SYNC` | Sync PostgreSQL for Alembic | Yes | derived from DATABASE_URL |
| `API_HOST` | FastAPI bind address | Yes | `0.0.0.0` |
| `API_PORT` | FastAPI port | Yes | `8000` |
| `CORS_ORIGINS` | Allowed CORS origins | Yes | `http://localhost:3000` |
| `ANTHROPIC_API_KEY` | Claude API key | Yes | empty |
| `LLM_MODEL` | Claude model ID | Yes | `claude-sonnet-4-20250514` |
| `APIFY_API_TOKEN` | Apify crawler token | No (falls back to Brave) | empty |
| `BRAVE_API_KEY` | Brave Search fallback | No | empty |
| `REDDIT_USER_AGENT` | Reddit API user agent | Yes | `AtomeVoC/1.0` |
| `SLACK_WEBHOOK_URL` | Slack alert webhook | No | empty |
| `LARK_WEBHOOK_URL` | Lark global fallback webhook | No | empty |
| `SMTP_HOST` | Email server | No | `smtp.gmail.com` |
| `SMTP_PORT` | Email port | No | `587` |
| `SMTP_USER` | SMTP username | No | empty |
| `SMTP_PASSWORD` | SMTP password | No | empty |
| `ALERT_EMAIL_FROM` | Sender email | No | empty |
| `ALERT_EMAIL_TO` | Recipient emails (comma-separated) | No | empty |
| `CRAWL_SCHEDULE_HOURS` | Cron hours for crawl | Yes | `8,20` |
| `DIGEST_HOUR` | Daily digest hour | Yes | `9` |
| `TZ` | Timezone | Yes | `Asia/Manila` |
| `JWT_SECRET` | JWT signing secret | Yes | `change-me-in-production` |
| `JWT_ALGORITHM` | JWT algorithm | Yes | `HS256` |
| `JWT_EXPIRE_MINUTES` | Token expiry | Yes | `1440` (24h) |

### Key Dependencies

**Backend (pyproject.toml):**
- `fastapi>=0.115.0`, `uvicorn>=0.30.0`, `sqlalchemy[asyncio]>=2.0.30`, `asyncpg>=0.30.0`
- `anthropic>=0.30.0`, `httpx>=0.27.0`, `apscheduler>=3.10.0`
- `alembic>=1.13.0`, `python-jose[cryptography]>=3.3.0`, `passlib[bcrypt]>=1.7.4`
- `aiosmtplib>=3.0.0`, `pydantic>=2.7.0`, `pydantic-settings>=2.3.0`
- Python `>=3.11`

**Frontend (package.json):**
- `next@^14.2.0`, `react@^18.3.0`, `react-dom@^18.3.0`
- `tailwindcss@^3.4.0`, `typescript@^5.4.0`

### Infrastructure Files

| File | What It Defines |
|---|---|
| `docker-compose.yml` | 3 services: `db` (postgres:16-alpine on 5432), `backend` (FastAPI on 8000), `frontend` (Next.js on 3000). Volume `pgdata` for persistence. |
| `Dockerfile.backend` | Multi-stage Python 3.12-slim. Retries `alembic upgrade head` up to 5 times, then starts uvicorn. |
| `frontend/Dockerfile` | Multi-stage node:20-alpine. Builds Next.js standalone output. `NEXT_PUBLIC_API_URL` injected as build arg. |
| `fly.backend.toml` | App `atome-voc-backend`, region `sin`, 512MB/1cpu shared, port 8000, min_machines=1, auto_stop=stop |
| `fly.frontend.toml` | App `atome-voc-frontend`, region `sin`, 256MB/1cpu shared, port 3000, min_machines=1, auto_stop=stop. **Must deploy from `frontend/` directory.** |
| `deploy.sh` | Bash script: `check_fly()` → `create_apps()` → `create_db()` (Fly Postgres) → `set_secrets()` (prompts for 6 secrets) → `deploy_backend()` → `deploy_frontend()`. Pass `update` arg to skip setup and just redeploy. |

### deploy.sh Line-by-Line Summary

1. Sets `BACKEND_APP`, `FRONTEND_APP`, `REGION` variables
2. `check_fly()` — verifies `fly` CLI installed and authenticated
3. `create_apps()` — idempotently creates both Fly apps
4. `create_db()` — creates Fly Postgres cluster `atome-voc-backend-db` if missing (shared-cpu-1x, 1 node, 1GB volume), attaches to backend
5. `set_secrets()` — interactively prompts for ANTHROPIC_API_KEY, JWT_SECRET, LARK_WEBHOOK_URL, SLACK_WEBHOOK_URL, APIFY_API_TOKEN, BRAVE_API_KEY; sets non-empty values as Fly secrets
6. `deploy_backend()` — `fly deploy --config fly.backend.toml`
7. `deploy_frontend()` — `fly deploy --config fly.frontend.toml --build-arg NEXT_PUBLIC_API_URL=...`
8. Prints summary URLs

---

## 4. Data Flow & Scheduling

### APScheduler Configuration (from `backend/main.py`)

```
Timezone: settings.tz (default: Asia/Manila)
Crawl schedule: settings.crawl_schedule_hours (default: "8,20")
  → cron jobs at hour=8, minute=0 and hour=20, minute=0 PHT
  → calls _scheduled_crawl() which runs crawl_reddit(12h) then crawl_twitter(12h)

Digest schedule: settings.digest_hour (default: 9)
  → cron job at hour=9, minute=0 PHT
  → calls _scheduled_digest() which runs send_daily_digest()
```

### LLM Usage

| Parameter | Value |
|---|---|
| Model | `settings.llm_model` (default: `claude-sonnet-4-20250514`) |
| Batch size | 8 posts per API call |
| Max posts per run | 100 (`annotate_unannotated_posts(limit=100)`) |
| Max output tokens | 2048 per batch |
| System prompt | ~2000 chars (category list, severity rules, Taglish handling) |
| User template | Posts formatted as indexed blocks with platform/author/engagement/text |
| Estimated tokens per batch | ~500 system + ~200×8 posts + ~200×8 response ≈ ~4000 tokens |
| Calls per crawl cycle | ceil(new_posts / 8) batches |

### Severity Calculator — All Thresholds

```
SEVERITY_ORDER = ["none", "low", "medium", "high", "critical"]

HIGH_RISK_CATEGORIES = {debt_collection, fraud, security}       → floor: medium
MEDIUM_RISK_CATEGORIES = {interest_rate, refund}                 → floor: low

Rule 1: reposts >= 200                     → critical (immediate)
Rule 2: likes >= 1000                      → critical (immediate)
Rule 3: likes >= 500                       → min high
Rule 4: replies >= 50                      → min high
Rule 5: likes >= 100                       → min medium
Rule 6: category in HIGH_RISK_CATEGORIES   → min medium
Rule 7: category in MEDIUM_RISK_CATEGORIES → min low
Rule 8: cluster_post_count > 10            → min high
Rule 9: cluster_post_count > 25            → critical (immediate)

Priority: highest severity wins, never downgrades from LLM baseline.
```

### Clustering

| Parameter | Value |
|---|---|
| Default lookback | 48 hours (overridden by crawlers passing their own lookback_hours) |
| Clustering key | `(post.category, post.platform)` — groups by exact category + platform |
| Post filter | `is_negative == True` AND `incident_id IS NULL` AND `annotated_at IS NOT NULL` |
| Incident matching | Existing open incidents (status in new/acknowledged/in_review) with same category + platform |
| Severity bump | post_count > 10 → min "high"; post_count > 25 → auto "critical" |
| Incident code format | `INC-YYYY-MMDD-##` (date-prefixed with 2-digit sequence) |

### Alert Distribution Logic

| Severity | Cadence | Channels (from routing rules) |
|---|---|---|
| critical | immediate | Per routing rule: slack/lark/email + escalate_to recipients |
| high | immediate | Per routing rule: slack/lark/email |
| medium | queue | Per routing rule: typically slack only |
| low | digest | Aggregated in daily digest |
| none | digest | Aggregated in daily digest |

Lark fan-out: `_resolve_lark_webhooks()` looks up per-team webhooks from `lark_bots` table. If no bot found, falls back to `settings.lark_webhook_url`.

---

## 5. Seed Data

### scripts/seed_taxonomy.py — 11 Categories

| Key | Label | Color |
|---|---|---|
| fraud | Fraud / Scam | #DC2626 |
| transaction | Transaction | #F97316 |
| refund | Refund | #F59E0B |
| spend_limit | Spend Limit | #EAB308 |
| account | Account | #84CC16 |
| security | Security | #EF4444 |
| app_bug | App Bug | #8B5CF6 |
| customer_service | Customer Service | #06B6D4 |
| debt_collection | Debt Collection | #E11D48 |
| interest_rate | Interest Rate | #F97316 |
| not_negative | General Mentions | #9CA3AF |

### scripts/seed_taxonomy.py — 28 Sub-Issues

- **transaction:** duplicate_charge, payment_declined, gcash_issue, bank_transfer_fail
- **refund:** refund_delayed, merchant_dispute, cancellation_denied
- **spend_limit:** limit_too_low, limit_reduced, limit_increase_denied
- **account:** account_locked, login_fail, kyc_rejected
- **app_bug:** app_crash, slow_loading, ui_confusing
- **customer_service:** long_wait, unhelpful_agent, no_response
- **debt_collection:** harassment, threatening_calls, excessive_contact
- **interest_rate:** hidden_fees, overcharged, late_fee_dispute
- **fraud:** unauthorized_transaction, phishing, account_takeover

### scripts/seed_routing.py — 10 Routing Rules

| Category | Primary Owner | Departments | Escalate To | Channels |
|---|---|---|---|---|
| debt_collection | Collections | Compliance | CEO Office | slack, lark |
| transaction | Product | CS, Ops | — | slack |
| app_bug | Engineering | Product | — | slack |
| interest_rate | Compliance | CEO Office, PR | CEO Office | slack, email |
| fraud | Risk | Security | CEO Office | slack, lark, email |
| security | Security | Risk | CEO Office | slack, lark, email |
| customer_service | CS Head | CS Ops | — | slack |
| refund | CS | Product | — | slack |
| spend_limit | Product | Risk | — | slack |
| account | CS | Product | — | slack |

### scripts/seed_lark_bots.py — 12 Team Names

Collections, Product, Engineering, Compliance, Risk, Security, CS, CS Head, CS Ops, CEO Office, PR, Ops

All seeded with placeholder URL `https://open.larksuite.com/open-apis/bot/v2/hook/REPLACE_ME` and `is_active=False`.

---

## 6. Known Issues (from Code)

### TODO / FIXME / XXX Comments

**None found** across the entire codebase (backend/, frontend/src/, scripts/, tests/).

### Hardcoded Magic Numbers

| Location | Value | Purpose |
|---|---|---|
| `severity_calculator.py:10` | 1000 | Likes → auto critical |
| `severity_calculator.py:11` | 500 | Likes → min high |
| `severity_calculator.py:12` | 100 | Likes → min medium |
| `severity_calculator.py:15` | 50 | Replies → min high |
| `severity_calculator.py:16` | 200 | Reposts → auto critical |
| `clustering.py:150,153` | 10, 25 | Post count → high/critical escalation |
| `crawler_reddit.py:37` | 2.0 | Rate limit delay (seconds) |
| `crawler_*.py:42-43` | 10, 300 | Apify poll interval / timeout (seconds) |
| `llm_annotator.py:19` | 8 | LLM batch size |
| `llm_annotator.py:22` | 100 | Max posts per annotation run |
| `llm_annotator.py:87` | 2048 | Max output tokens |
| `dedup.py:16` | 30 | Minimum text length |
| `config.py:72` | 1440 | JWT expiry (minutes) |

### Hardcoded URLs

| Location | URL |
|---|---|
| `crawler_twitter.py:22` | `https://api.search.brave.com/res/v1/web/search` |
| `crawler_twitter.py:26` | `https://api.apify.com/v2` |
| `crawler_reddit.py:41,45` | Same Apify + Brave URLs |
| `seed_lark_bots.py:35` | `https://open.larksuite.com/open-apis/bot/v2/hook/REPLACE_ME` |
| `config.py:57` | `smtp.gmail.com` (default SMTP host) |

### Silent Exception Handling

| File | Line(s) | Pattern |
|---|---|---|
| `crawler_twitter.py` | 156, 159, 258 | `except Exception: logger.exception(...)` — logs but continues silently |
| `crawler_twitter.py` | 231, 236, 375 | `except: pass` — bare pass in date parsing fallbacks |
| `crawler_reddit.py` | 159, 162, 293, 378 | `except Exception: logger.exception(...)` — logs but continues |
| `llm_annotator.py` | 51, 58 | `except Exception:` — batch failure retries individually; individual failure skipped |
| `alerting.py` | 215, 340 | `except Exception:` — alert send failure returns False, doesn't re-raise |
| `auth.py` | 100 | `pass` — GET /api/auth/me is a stub |
| `clustering.py` | 65 | `except ValueError:` — incident code parsing fallback |
| `severity_calculator.py` | 20-23 | `except ValueError:` — unknown severity returns 0 |

### Alembic Migration History

| Revision | Down | Date | Description |
|---|---|---|---|
| `001` | None | 2026-04-20 | Initial schema: 8 tables (users, posts, incidents, alerts, feedback, taxonomy_categories, taxonomy_sub_issues, routing_rules) |
| `002` | `001` | 2026-04-21 | Add `lark_bots` table |
| `003` | `002` | 2026-04-22 | Add `primary_owner` column to `routing_rules` |

**Latest revision: `003`.** No pending migrations detected.

### GitHub Status

- **Open issues:** 0
- **Open PRs:** 0
- **Uncommitted changes:** None
- **Remote:** `https://github.com/shoudong/atome-voc-agent.git`
- **5 commits on main** (Initial → Lark bots → README update → Fly.io deployment → Taxonomy/latency fix)

---

## 7. Local Dev — Minimum Steps to Run

```bash
# 1. Clone
git clone https://github.com/shoudong/atome-voc-agent.git
cd atome-voc-agent

# 2. Copy env
cp .env.example .env
# Edit .env and fill in:
#   ANTHROPIC_API_KEY=<DONG_TO_PROVIDE: Claude API key for LLM annotation>
#   APIFY_API_TOKEN=<DONG_TO_PROVIDE: Apify token for crawlers, or leave empty for Brave fallback>
#   BRAVE_API_KEY=<DONG_TO_PROVIDE: Brave Search API key, fallback crawler>
# All other defaults work for local dev.

# 3. Start PostgreSQL + Backend + Frontend
docker compose up -d
# Expected: 3 containers running (db, backend on :8000, frontend on :3000)
# Verify: curl http://localhost:8000/health → {"status":"ok","service":"atome-voc-agent"}

# 4. Run migrations (auto-run by Dockerfile, but manually if needed)
docker compose exec backend alembic upgrade head
# Expected: "Running upgrade  -> 001", "Running upgrade 001 -> 002", "Running upgrade 002 -> 003"

# 5. Seed data (optional — auto-seeds on first API GET, but scripts are explicit)
docker compose exec backend python scripts/seed_taxonomy.py
docker compose exec backend python scripts/seed_routing.py
docker compose exec backend python scripts/seed_lark_bots.py

# 6. Trigger a manual crawl
curl -X POST http://localhost:8000/api/crawler/run \
  -H 'Content-Type: application/json' \
  -d '{"platform":"all","lookback_hours":168}'
# Expected: {"status":"started","message":"Crawl job started for all (lookback=168h)"}
# Wait ~2-5 min for crawl + annotation + clustering to complete

# 7. Verify data
curl http://localhost:8000/api/analytics/overview?days=7
# Expected: JSON with total_mentions > 0, negative_complaints > 0

# 8. Open dashboard
open http://localhost:3000
# Expected: Overview page with KPI cards, trend chart, incident table
```

### Secrets Dong Needs to Provide

- `<DONG_TO_PROVIDE: ANTHROPIC_API_KEY — Claude API key for LLM annotation>`
- `<DONG_TO_PROVIDE: APIFY_API_TOKEN — Apify token for Reddit/Twitter crawlers>`
- `<DONG_TO_PROVIDE: BRAVE_API_KEY — Brave Search API key (crawler fallback)>`
- `<DONG_TO_PROVIDE: LARK_WEBHOOK_URL — Global fallback Lark webhook for alerts>`
- `<DONG_TO_PROVIDE: SLACK_WEBHOOK_URL — Slack incoming webhook (if Slack alerts are wanted)>`
- `<DONG_TO_PROVIDE: JWT_SECRET — Production JWT signing secret>`
- <需 Dong 人工回答: Fly.io production secrets — which account owns them, how to access>
- <需 Dong 人工回答: SMTP credentials for email alerts, if needed>

---

## 8. PRD vs Implementation Gap Analysis

### FR1. Source Ingestion

| Requirement | Status |
|---|---|
| Configurable connector per platform | ✅ Reddit + Twitter implemented as separate modules |
| Configurable keyword dictionary | ⚠️ Keywords hardcoded in crawler files (8 Reddit, 19 Twitter), not configurable via UI/config |
| Collect post content, comments, author, timestamp, URL, engagement | ✅ All stored in `posts` table |
| Market/language tagging | ⚠️ Language detected by LLM (en/tl/mixed), but market hardcoded to "atome_ph" (Philippines only) |
| Backfill capability for N days | ✅ `scripts/backfill_crawl.py` + `POST /api/crawler/run` with `lookback_hours` |
| Keyword logic: exact, fuzzy, context-based | ⚠️ Exact keyword matching only (hardcoded lists). No fuzzy or context-based matching. |
| Facebook, Google Play, App Store, forums | ❌ Not implemented. Only Twitter + Reddit. |

### FR2. Relevance Filtering

| Requirement | Status |
|---|---|
| Binary relevance classifier | ⚠️ `dedup.py` provides `mentions_brand()`, `is_ph_relevant()`, `is_noise_account()` filtering. LLM `is_negative` is used for complaint relevance, but there's no explicit binary "relevant/irrelevant" classifier. |
| Confidence score | ❌ Not implemented |
| Human override | ⚠️ Feedback system exists but doesn't have a "mark irrelevant" workflow |
| False positive review queue | ❌ Not implemented as a dedicated queue |

### FR3. Sentiment and Complaint Detection

| Requirement | Status |
|---|---|
| Sentiment score | ⚠️ LLM returns binary `is_negative` (true/false), not a continuous score |
| Complaint intent detection | ✅ LLM classifies category + sub-issues |
| Sarcasm/frustration heuristics | ⚠️ Covered in LLM system prompt (Taglish/Filipino handling), but no explicit heuristic code |
| Flag: negative complaint | ✅ `is_negative` field |
| Flag: reputational risk | ⚠️ Implicitly via severity (high/critical), no explicit flag |
| Flag: regulatory-sensitive | ⚠️ Implicitly via category (debt_collection, interest_rate), no explicit flag |
| Flag: fraud allegation | ✅ `fraud` category |
| Flag: harassment/collection abuse | ✅ `debt_collection` category + `harassment`/`threatening_calls` sub-issues |

### FR4. Topic Categorization

| Requirement | Status |
|---|---|
| Categorize into predefined buckets | ✅ 11 categories implemented (PRD listed 14; "repayment", "compliance", "brand dissatisfaction" collapsed into existing categories) |
| Multi-label tagging | ⚠️ Single category per post, but `sub_issues` is an array (partial multi-label) |
| Taxonomy versioning | ❌ Not implemented (no version field) |
| Admin-editable without code deployment | ✅ Taxonomy CRUD API + Settings page |

### FR5. Severity Scoring

| Requirement | Status |
|---|---|
| 5 severity levels (S0–S4) | ✅ none/low/medium/high/critical mapped to S0–S4 in UI |
| Scoring dimension: Sentiment intensity | ✅ LLM assigns initial severity |
| Scoring dimension: Topic sensitivity | ✅ HIGH_RISK_CATEGORIES floor to medium |
| Scoring dimension: User impact claim | ⚠️ Implicitly via LLM prompt, no explicit scoring |
| Scoring dimension: Virality/reach | ✅ Engagement thresholds (likes, replies, reposts) |
| Scoring dimension: Recurrence | ✅ Cluster post_count escalation (>10→high, >25→critical) |
| Scoring dimension: Market sensitivity | ❌ Single-market only |
| Scoring dimension: Regulatory/legal exposure | ⚠️ Category risk floor only, no explicit regulatory flag |
| Scoring dimension: Executive sensitivity | ❌ No influencer/press detection |
| Scoring dimension: Trend acceleration | ❌ Not implemented (trend_pct field exists but not used in scoring) |
| Scoring dimension: Credibility | ❌ No screenshot/evidence detection |
| Weighted composite formula | ❌ Uses rule-based max() logic, not a weighted formula |
| Explainability fields | ⚠️ `ai_explanation` field exists in post model but not populated by current LLM prompt |

### FR6. Clustering and Deduplication

| Requirement | Status |
|---|---|
| Detect duplicate reposts/screenshots | ⚠️ `content_hash()` exists for dedup, but screenshot detection not implemented |
| Cluster by semantic similarity | ❌ Clusters by exact (category, platform) key, not semantic embeddings |
| Incident-level view: title, summary, count, trend, examples | ✅ Incident model has all fields; incident detail page shows related posts |
| Affected market | ⚠️ Single market only (PH) |
| Dynamic severity updates | ✅ `_update_incident_severity()` bumps on cluster growth |

### FR7. Alerting and Routing

| Requirement | Status |
|---|---|
| Route by category, severity, market | ✅ Routing rules table maps category → teams/channels (market is single) |
| Email alerts | ⚠️ Code exists but SMTP not configured in production |
| Slack alerts | ✅ Webhook code implemented |
| Lark alerts | ✅ Per-team fan-out via lark_bots table |
| WhatsApp alerts | ❌ Not implemented |
| Dashboard notifications | ❌ No in-app notification system |
| Immediate alert (S3/S4) | ✅ Implemented |
| Daily digest | ⚠️ Code exists, skips if SMTP not configured |
| Weekly trend report | ❌ Not implemented |
| Alert payload: "why flagged", trend vs previous, recommended next step | ⚠️ Alert includes severity/category/summary/posts but not "why flagged" or "recommended next step" |

### FR8. Dashboard and Case Management

| Requirement | Status |
|---|---|
| Executive overview | ✅ `/overview` page with KPIs, trends, severity donut, categories, incidents |
| Operations triage view | ✅ `/incidents` page with severity/status filters |
| Drill-down detail page | ✅ `/incidents/[id]` with all related posts |
| Workflow: status (new/acknowledged/in_review/actioned/resolved/ignored) | ✅ Implemented in Incident model |
| Workflow: owner | ✅ `assigned_to` + `assigned_dept` fields |
| Workflow: due date | ❌ Not implemented |
| Workflow: internal notes | ❌ Not implemented |
| Workflow: escalation history | ❌ Not implemented |
| Workflow: linked JIRA | ❌ Not implemented |

### FR9. Human Feedback Loop

| Requirement | Status |
|---|---|
| Mark false positive | ⚠️ Can submit feedback correction, but no explicit "false positive" button |
| Change category | ✅ Via feedback API |
| Change severity | ✅ Via feedback API |
| Merge/split clusters | ❌ Not implemented |
| Mark resolved | ✅ Via incident status update |
| Add root cause notes | ❌ No notes field on incidents |
| Corrections logged for model improvement | ⚠️ Stored in feedback table but not fed back to LLM |

### FR10. Reporting and Analytics

| Requirement | Status |
|---|---|
| Daily complaint summary | ⚠️ Daily digest email code exists but SMTP not configured |
| Weekly trend report | ❌ Not implemented |
| Monthly root-cause summary | ❌ Not implemented |
| Incident leaderboard by category | ✅ `/api/analytics/categories` |
| Market comparison | ❌ Single market only |
| Platform comparison | ✅ `/api/analytics/channels` |
| Severity distribution | ✅ `/api/analytics/severity-distribution` |
| Time-to-detection | ✅ `avg_detect_to_alert_min` in overview KPI |
| Time-to-acknowledgement | ❌ Not computed |
| Time-to-resolution | ❌ Not computed |

### Summary Scorecard

| FR | Status | Score |
|---|---|---|
| FR1. Source Ingestion | ⚠️ Partial | Twitter + Reddit only; 5 platforms missing |
| FR2. Relevance Filtering | ⚠️ Partial | Basic dedup + LLM, no confidence score or FP queue |
| FR3. Sentiment & Complaint | ⚠️ Partial | Binary is_negative, not granular sentiment score |
| FR4. Topic Categorization | ✅ Mostly done | 11 categories, CRUD API, sub-issues; missing versioning |
| FR5. Severity Scoring | ⚠️ Partial | 5 of 10 scoring dimensions; rule-based, not weighted formula |
| FR6. Clustering & Dedup | ⚠️ Partial | By exact key, not semantic; no screenshot detection |
| FR7. Alerting & Routing | ⚠️ Partial | Slack + Lark working; email not configured; no weekly report |
| FR8. Dashboard & Case Mgmt | ⚠️ Partial | Core views done; missing due date, notes, JIRA, escalation history |
| FR9. Human Feedback | ⚠️ Partial | Feedback API exists; no merge/split, no model retraining |
| FR10. Reporting & Analytics | ⚠️ Partial | Core dashboards; missing weekly/monthly reports, time-to-resolution |

---

## Items Requiring Dong's Human Input

The following were marked `<需 Dong 人工回答>` and intentionally skipped:

1. **Production secrets ownership** — Who owns the Fly.io account? Who has access to set secrets?
2. **Slack webhook** — Is a Slack webhook configured in production? Which Slack workspace/channel?
3. **SMTP credentials** — Are email alerts needed? If so, which SMTP service/account?
4. **Apify account** — Whose Apify account is the `APIFY_API_TOKEN` from? What's the monthly credit budget?
5. **Brave API** — Whose Brave Search account? Rate limits?
6. **Anthropic API** — Whose Claude API key? What's the billing org?
7. **Production database size** — How many posts/incidents/alerts exist in production currently?
8. **Who is actively using the dashboard** — Which teams/people are checking the dashboard?
9. **Lark bot webhooks** — Are any of the 12 team bots configured with real webhook URLs, or all still placeholder?
10. **Domain/DNS** — Is there a custom domain planned beyond `*.fly.dev`?
11. **GitHub repo access** — Who else has push access to `shoudong/atome-voc-agent`?
12. **Monitoring/observability** — Is there any external monitoring (Datadog, Sentry, etc.) set up beyond Fly.io logs?
