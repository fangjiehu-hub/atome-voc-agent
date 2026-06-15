#!/usr/bin/env bash
# =============================================================================
# Atome VoC Agent — internal-network deploy script (Docker Compose)
#
# Pulls the latest code, rebuilds the images, restarts the services, and waits
# for the backend to become healthy. DB migrations run automatically when the
# backend container starts (`alembic upgrade head`).
#
# Usage:   ./scripts/deploy.sh
# Config:  override via env vars, e.g.  BRANCH=main REPO_DIR=/opt/atome-voc-agent ./scripts/deploy.sh
#
# Prerequisites on the machine:
#   - Docker + Docker Compose v2 (`docker compose`)
#   - A populated .env at the repo root (NOT in git — maintained on the machine)
#   - Outbound HTTPS to GitHub + api.anthropic.com / api.apify.com / open.larksuite.com
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BRANCH="${BRANCH:-main}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8000/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

cd "$REPO_DIR"
echo "==> Repo: $REPO_DIR   Branch: $BRANCH   Compose: $COMPOSE_FILE"

# 1. Sanity: .env must exist (holds secrets; never committed)
if [[ ! -f .env ]]; then
  echo "!! .env not found at $REPO_DIR/.env — create it first (see .env.example)." >&2
  exit 1
fi

# 2. Pull latest code (fast-forward only — fails loudly on local divergence)
echo "==> git pull"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"
echo "    now at: $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s)"

# 3. Build images
echo "==> docker compose build"
docker compose -f "$COMPOSE_FILE" build

# 4. Start / update services (backend runs migrations on boot)
echo "==> docker compose up -d"
docker compose -f "$COMPOSE_FILE" up -d

# 5. Wait for the backend to report healthy
echo "==> waiting for backend health ($HEALTH_URL)"
for i in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "    backend healthy ✓"
    docker compose -f "$COMPOSE_FILE" ps
    echo "==> Deploy complete."
    exit 0
  fi
  sleep 2
done

echo "!! backend did not become healthy in time — recent logs:" >&2
docker compose -f "$COMPOSE_FILE" logs --tail=60 backend >&2
exit 1
