# Atome Voice of Customer (VoC) Early Warning Agent

An AI-powered social media monitoring system that crawls X/Twitter and Reddit for customer complaints about **Atome PH** (Buy Now Pay Later), classifies them using Claude AI, clusters related posts into incidents, and routes alerts to stakeholders via Slack, Lark, and email.

Built for the Philippines market. Designed for CS, Product, Compliance, and executive teams.

---

## System Architecture

```
┌─────────────────────────────────────────────┐
│           Frontend (Next.js + Tailwind)      │
│           localhost:3000                     │
│                                             │
│  Overview · Incidents · Alerts · Analytics  │
│  Feedback · Taxonomy · Routing · Settings   │
└──────────────────┬──────────────────────────┘
                   │ REST API (/api/*)
┌──────────────────▼──────────────────────────┐
│           Backend (FastAPI)                  │
│           localhost:8000                     │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Crawlers │ │ LLM      │ │ Clustering  │ │
│  │ Reddit   │ │ Annotator│ │ & Alerting  │ │
│  │ Twitter  │ │ (Claude) │ │             │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
│                                             │
│  APScheduler: 2x daily (8 AM, 8 PM PHT)    │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│           PostgreSQL 16                      │
│           localhost:5432                     │
│                                             │
│  posts · incidents · alerts · feedback      │
│  taxonomy · routing_rules · lark_bots · users│
└─────────────────────────────────────────────┘
```

## Data Pipeline

Each crawl triggers a full end-to-end pipeline:

```
Crawl (Reddit + X/Twitter)
  → Deduplicate & filter (brand mention, length, official accounts)
    → Save to PostgreSQL (ON CONFLICT DO NOTHING)
      → LLM Annotation (Claude Sonnet, batch of 8)
        → Classify: is_negative, category, sub_issues, severity, language, summary
          → Severity Override (rule-based: engagement, topic risk, cluster size)
            → Clustering (category + platform + time window → incident)
              → Alert Routing (Slack / Lark / Email based on severity)
```

## Features

### Crawlers
- **Reddit**: Public `search.json` API (no API key needed). Monitors r/PHCreditCards, r/Philippines, r/phinvest, r/phfinance for "Atome" keyword
- **X/Twitter**: Brave Search API with `site:x.com` queries. 7 keyword variations covering fraud, refunds, payments, credit limits
- **Scheduling**: APScheduler cron jobs at 8 AM and 8 PM PHT. Manual trigger via `POST /api/crawler/run`
- **Deduplication**: Unique constraint on `(platform, brand, post_id)`. Filters out official accounts, short posts (<30 chars), and non-brand mentions

### AI Classification (Claude Sonnet)
- **Batch processing**: 8 posts per LLM call for cost efficiency (~$0.002/post)
- **11 categories**: fraud, transaction, refund, spend_limit, account, security, app_bug, customer_service, debt_collection, interest_rate, not_negative
- **19 sub-issue tags**: duplicate_charge, payment_declined, gcash_issue, phishing, etc.
- **5 severity levels**: none → low → medium → high → critical
- **Language detection**: English (en), Tagalog (tl), mixed
- **One-line summary**: Human-readable summary per post
- **Severity overrides**: Rule-based calculator bumps severity for high-engagement posts (>1K likes), risky topics (fraud, debt_collection), and growing clusters (>10 posts)

### Incident Clustering
- Groups posts by `category + platform` within a configurable time window
- Auto-generates incident codes (e.g., `INC-2026-0421-02`)
- Tracks `first_seen`, `last_seen`, `post_count`
- Status workflow: New → Acknowledged → In Review → Actioned → Resolved / Ignored

### Alert Routing
| Severity | Cadence | Channel |
|---|---|---|
| Critical / High | Immediate push | Slack + Lark (per-team) + Email |
| Medium | Queued for review | Team channel |
| Low / None | Daily digest | Morning brief email |

Category-to-department routing is configurable via the UI (e.g., fraud → Risk + Security + CEO, app_bug → Product + Engineering).

### Lark Bot Fan-Out
Each team (Collections, Product, Engineering, Compliance, Risk, Security, CS, CS Head, CS Ops, CEO Office, PR, Ops) can have its own Lark group chat bot. When an alert fires:

1. The alerting service resolves which recipients have active Lark bots via the `lark_bots` registry
2. Creates **one alert per team** with the team-specific webhook URL stored in the alert payload
3. Sends each alert to the correct Lark group — Product alerts go to the Product group, Compliance to Compliance, etc.
4. Falls back to the global `LARK_WEBHOOK_URL` if no per-team bots are configured (backward compatible)

Manage bots via the Settings page or `CRUD /api/lark-bots`. Each bot has a test endpoint to verify the webhook.

### Executive Dashboard
- **KPI cards**: Total mentions, negative %, critical incidents, detect-to-alert latency, open incidents
- **Trend chart**: Complaint volume by severity over 7d/30d/90d with individual severity lines
- **Severity donut**: Distribution of all mentions by severity level
- **Incident cards**: Top incidents sorted by severity with source links for CS verification
- **Category bar chart**: Top complaint categories by volume
- **Channel breakdown**: X/Twitter vs Reddit with mention counts and negative %
- **Incident table**: Full list with severity, source link, category, channel, post count, status
- **Time range filter**: 24h / 7d / 30d / 90d — all widgets respect the selection

---

## Project Structure

```
├── backend/
│   ├── main.py                    # FastAPI app + APScheduler lifespan
│   ├── config.py                  # Pydantic Settings (.env loading)
│   ├── database.py                # SQLAlchemy async engine + session
│   ├── models/
│   │   ├── post.py                # posts table (raw + AI-enriched)
│   │   ├── incident.py            # incidents (clustered posts)
│   │   ├── alert.py               # alert delivery log
│   │   ├── feedback.py            # human correction queue
│   │   ├── taxonomy.py            # categories + sub_issues config
│   │   ├── routing.py             # category → department routing rules
│   │   ├── lark_bot.py            # per-team Lark webhook registry
│   │   └── user.py                # auth users
│   ├── schemas/                   # Pydantic request/response models
│   ├── api/
│   │   ├── monitor.py             # POST /save, GET /query
│   │   ├── crawler.py             # POST /crawler/run (manual trigger)
│   │   ├── incidents.py           # CRUD + severity-sorted listing
│   │   ├── alerts.py              # Alert feed + acknowledge
│   │   ├── analytics.py           # Overview, trend, categories, channels
│   │   ├── feedback.py            # Human feedback queue
│   │   ├── taxonomy.py            # Category/sub-issue config
│   │   ├── lark_bots.py           # Lark bot CRUD + test endpoint
│   │   └── auth.py                # JWT login/register
│   └── services/
│       ├── crawler_reddit.py      # Reddit public API crawler
│       ├── crawler_twitter.py     # Brave Search API crawler
│       ├── dedup.py               # Brand filter, spam filter, official acct filter
│       ├── llm_annotator.py       # Claude Sonnet batch annotation
│       ├── llm_prompts.py         # System prompt + category/severity rubric
│       ├── severity_calculator.py # Rule-based severity overrides
│       ├── clustering.py          # Category + platform + time window grouping
│       └── alerting.py            # Slack / Lark / Email dispatch
│
├── frontend/
│   ├── src/app/
│   │   ├── overview/page.tsx      # Executive dashboard
│   │   ├── incidents/page.tsx     # Incident list
│   │   ├── incidents/[id]/page.tsx# Incident detail + posts
│   │   ├── alerts/page.tsx        # Alert feed
│   │   ├── analytics/page.tsx     # Deep analytics
│   │   ├── feedback/page.tsx      # Human correction queue
│   │   ├── taxonomy/page.tsx      # Category/sub-issue config
│   │   ├── routing/page.tsx       # Alert routing matrix
│   │   ├── methodology/page.tsx   # Classification methodology
│   │   └── settings/page.tsx      # System settings + Lark bot management
│   ├── src/components/
│   │   ├── Sidebar.tsx            # Navigation sidebar
│   │   ├── KPICard.tsx            # Metric card with delta
│   │   ├── TrendChart.tsx         # SVG line chart with severity lines
│   │   ├── SeverityDonut.tsx      # SVG donut chart
│   │   ├── IncidentCard.tsx       # Incident summary card with source link
│   │   ├── IncidentTable.tsx      # Sortable incident table
│   │   ├── AlertFeedItem.tsx      # Alert card with source + routing info
│   │   ├── SeverityBadge.tsx      # S0-S4 severity pill
│   │   ├── CategoryTag.tsx        # Colored category label
│   │   ├── SubIssueTag.tsx        # Sub-issue pill
│   │   ├── DateRangeSelector.tsx  # Time range filter component
│   │   └── DrilldownPanel.tsx     # Date drilldown panel
│   └── src/lib/
│       ├── api.ts                 # API client functions
│       ├── types.ts               # TypeScript interfaces
│       └── constants.ts           # Severity/category/status mappings
│
├── scripts/
│   ├── seed_taxonomy.py           # Seed 11 categories + 28 sub-issues
│   ├── seed_routing.py            # Seed 10 routing rules
│   ├── seed_lark_bots.py          # Seed 12 team Lark bot placeholders
│   └── backfill_crawl.py          # Backfill historical data
│
├── alembic/                       # Database migrations
├── tests/                         # pytest test suite
├── docker-compose.yml             # PostgreSQL + backend + frontend
├── pyproject.toml                 # Python dependencies
└── .env.example                   # Environment variable template
```

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 16 (or Docker)

### 1. Clone and configure

```bash
git clone https://github.com/shoudong/atome-voc-agent.git
cd atome-voc-agent
cp .env.example .env
```

Edit `.env` with your actual keys:

```env
# Required
DATABASE_URL=postgresql+asyncpg://atome:atome_secret@localhost:5432/atome_voc
DATABASE_URL_SYNC=postgresql://atome:atome_secret@localhost:5432/atome_voc
ANTHROPIC_API_KEY=sk-ant-...       # For AI classification
BRAVE_API_KEY=BSA...               # For X/Twitter crawling

# Optional (alerting)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
LARK_WEBHOOK_URL=https://open.larksuite.com/open-apis/bot/v2/hook/...
SMTP_HOST=smtp.gmail.com
SMTP_USER=alerts@yourcompany.com
SMTP_PASSWORD=...
```

### 2. Start PostgreSQL

**Option A — Docker:**
```bash
docker compose up db -d
```

**Option B — Local PostgreSQL:**
```bash
createdb atome_voc
```

### 3. Set up the backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pip install psycopg2-binary    # needed for Alembic migrations

# Run migrations
alembic upgrade head

# Seed taxonomy, routing rules, and Lark bot placeholders
python scripts/seed_taxonomy.py
python scripts/seed_routing.py
python scripts/seed_lark_bots.py    # optional: creates inactive bots for all 12 teams
```

### 4. Set up the frontend

```bash
cd frontend
npm install
cd ..
```

### 5. Start both servers

```bash
# Terminal 1: Backend
source .venv/bin/activate
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open **http://localhost:3000** to view the dashboard.

### 6. Trigger your first crawl

```bash
# Crawl Reddit + Twitter for the last 24 hours
curl -X POST http://localhost:8000/api/crawler/run \
  -H "Content-Type: application/json" \
  -d '{"platform": "all", "lookback_hours": 24}'

# Backfill 90 days of data
curl -X POST http://localhost:8000/api/crawler/run \
  -H "Content-Type: application/json" \
  -d '{"platform": "all", "lookback_hours": 2160}'
```

---

## Cron Schedule

Configured via environment variables in `.env`:

| Job | Schedule | Config |
|---|---|---|
| Full crawl (Reddit + Twitter) | 8:00 AM, 8:00 PM PHT | `CRAWL_SCHEDULE_HOURS=8,20` |
| Daily digest email | 9:00 AM PHT | `DIGEST_HOUR=9` |

The APScheduler runs inside the FastAPI process — no external cron daemon needed.

---

## API Endpoints

### Core Pipeline
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/monitor/save` | Upsert crawled posts |
| `GET` | `/api/monitor/query` | Filter posts by platform, category, severity, date |
| `POST` | `/api/crawler/run` | Trigger crawl (platform: reddit/twitter/all, lookback_hours) |

### Incidents
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/incidents` | List incidents (filter by status, severity, category, days) |
| `GET` | `/api/incidents/{id}` | Incident detail + associated posts |
| `PATCH` | `/api/incidents/{id}` | Update status, assignment |

### Alerts
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/alerts` | Alert feed (filter by channel, severity) |
| `POST` | `/api/alerts/{id}/ack` | Acknowledge an alert |

### Analytics
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/analytics/overview` | KPI summary (total, negative %, critical count) |
| `GET` | `/api/analytics/trend` | Daily trend with severity breakdown |
| `GET` | `/api/analytics/categories` | Category distribution |
| `GET` | `/api/analytics/channels` | Platform breakdown (Twitter vs Reddit) |
| `GET` | `/api/analytics/severity-distribution` | Severity donut data |

All analytics endpoints accept `?days=7|30|90` and filter by post creation date.

### Lark Bots
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/lark-bots` | List all Lark bots |
| `POST` | `/api/lark-bots` | Create a bot (team_name, webhook_url, description) |
| `PATCH` | `/api/lark-bots/{id}` | Update webhook URL, description, or active status |
| `DELETE` | `/api/lark-bots/{id}` | Delete a bot |
| `POST` | `/api/lark-bots/{id}/test` | Send a test card to verify the webhook |

### Config
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/taxonomy/categories` | Manage complaint categories |
| `GET/POST` | `/api/taxonomy/sub-issues` | Manage sub-issue tags |
| `GET/POST` | `/api/feedback` | Human correction queue |
| `POST` | `/api/auth/login` | JWT authentication |

---

## Database Schema

### posts (core table)
Raw social media posts enriched with AI classification fields.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL | Primary key |
| `platform` | VARCHAR | `twitter` or `reddit` |
| `brand` | VARCHAR | `atome_ph` |
| `post_id` | VARCHAR | Platform-native ID |
| `url` | TEXT | Link to original post |
| `author_handle` | VARCHAR | `@username` |
| `content_text` | TEXT | Full post text |
| `created_at` | TIMESTAMPTZ | When posted on platform |
| `collected_at` | TIMESTAMPTZ | When we crawled it |
| `engagement_likes` | INT | Like/upvote count |
| `engagement_replies` | INT | Reply/comment count |
| `is_negative` | BOOLEAN | AI: is this a complaint? |
| `category` | VARCHAR | AI: one of 11 categories |
| `sub_issues` | TEXT[] | AI: array of sub-issue tags |
| `severity` | VARCHAR | AI: none/low/medium/high/critical |
| `language` | VARCHAR | AI: en/tl/mixed |
| `summary` | TEXT | AI: one-line summary |
| `incident_id` | BIGINT FK | Linked incident cluster |
| **UNIQUE** | | `(platform, brand, post_id)` |

### incidents (clusters)
Groups of related posts forming a single incident.

| Column | Type | Description |
|---|---|---|
| `incident_code` | VARCHAR | e.g. `INC-2026-0421-02` |
| `title` | VARCHAR | Auto-generated: `[REDDIT] Fraud/Scam Reports (4 posts)` |
| `category` | VARCHAR | Shared category of clustered posts |
| `severity` | VARCHAR | Highest severity in cluster |
| `platforms` | TEXT[] | Platforms involved |
| `post_count` | INT | Number of posts in cluster |
| `first_seen` | TIMESTAMPTZ | Earliest post date |
| `last_seen` | TIMESTAMPTZ | Latest post date |
| `status` | VARCHAR | new / acknowledged / in_review / actioned / resolved / ignored |

### lark_bots (per-team webhook registry)
Maps each team to its own Lark group chat bot for fan-out alerts.

| Column | Type | Description |
|---|---|---|
| `id` | BIGSERIAL | Primary key |
| `team_name` | VARCHAR(100) | Team name (unique), matches routing rule strings |
| `webhook_url` | VARCHAR(500) | Lark custom bot webhook URL |
| `description` | VARCHAR(300) | Optional description |
| `is_active` | BOOLEAN | Enable/disable without deleting |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

## Severity Framework

The system uses dual labels — backend stores lowercase, UI displays S-codes:

| Backend | UI Label | Criteria |
|---|---|---|
| `critical` | S4 CRITICAL | Regulatory risk, viral thread (>1K engagement), mass outage |
| `high` | S3 HIGH | Financial loss, fraud, >10 posts in cluster |
| `medium` | S2 MEDIUM | Service disruption, app bugs, repeated complaints |
| `low` | S1 LOW | Minor UX issues, single complaint |
| `none` | S0 INFO | Neutral mention, not a complaint |

### Severity Override Rules
LLM severity is adjusted by rule-based calculator:
- **Engagement > 1,000**: Auto-escalate to critical
- **Topic = fraud/debt_collection**: Minimum severity = medium
- **Cluster > 10 posts**: Minimum severity = high
- **Cluster > 25 posts**: Auto-escalate to critical

---

## Cost Estimates

| Component | Cost | Notes |
|---|---|---|
| Claude Sonnet (LLM) | ~$6/month | 100 posts/day, $0.002/post |
| Brave Search API | Free tier | 2,000 queries/month |
| Reddit API | Free | Public search.json, no key needed |
| PostgreSQL | Free | Local or Docker |
| **Total** | **~$6/month** | |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, Tailwind CSS, TypeScript |
| Backend | FastAPI, SQLAlchemy 2.0 (async), Pydantic v2 |
| Database | PostgreSQL 16, asyncpg, Alembic |
| AI | Claude Sonnet (Anthropic API) |
| Crawlers | Reddit public API, Brave Search API |
| Scheduling | APScheduler (in-process cron) |
| Alerting | Slack webhooks, Lark webhooks, SMTP email |
| Auth | JWT (python-jose + passlib/bcrypt) |

---

## Development

```bash
# Run tests
pytest

# Lint
ruff check backend/

# Format
ruff format backend/
```

---

## License

Internal project — Atome Philippines.
