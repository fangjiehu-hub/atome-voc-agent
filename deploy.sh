#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Atome VoC Early Warning Agent — Fly.io Deployment Script
# ─────────────────────────────────────────────────────────
# Prerequisites:
#   1. Install Fly CLI:  curl -L https://fly.io/install.sh | sh
#   2. Sign up & login:  fly auth signup   (or: fly auth login)
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh          # First-time: creates apps, DB, sets secrets, deploys
#   ./deploy.sh update   # Subsequent: just re-deploys both apps
# ─────────────────────────────────────────────────────────

BACKEND_APP="atome-voc-backend"
FRONTEND_APP="atome-voc-frontend"
REGION="sin"  # Singapore — closest to Philippines

# ─── Helper ──────────────────────────────────────────────
info()  { echo "▸ $*"; }
ok()    { echo "✓ $*"; }
fail()  { echo "✗ $*" >&2; exit 1; }

check_fly() {
  command -v fly >/dev/null 2>&1 || fail "Fly CLI not found. Install: curl -L https://fly.io/install.sh | sh"
  fly auth whoami >/dev/null 2>&1 || fail "Not logged in. Run: fly auth login"
  ok "Fly CLI authenticated as $(fly auth whoami)"
}

# ─── Create Apps (idempotent) ────────────────────────────
create_apps() {
  for app in "$BACKEND_APP" "$FRONTEND_APP"; do
    if fly apps list | grep -q "$app"; then
      ok "App $app already exists"
    else
      info "Creating app: $app"
      fly apps create "$app" --region "$REGION"
      ok "Created $app"
    fi
  done
}

# ─── Provision Postgres ──────────────────────────────────
create_db() {
  local pg_app="${BACKEND_APP}-db"
  if fly apps list | grep -q "$pg_app"; then
    ok "Postgres cluster $pg_app already exists"
  else
    info "Creating Fly Postgres cluster: $pg_app"
    fly postgres create \
      --name "$pg_app" \
      --region "$REGION" \
      --vm-size shared-cpu-1x \
      --initial-cluster-size 1 \
      --volume-size 1
    ok "Postgres cluster created"

    info "Attaching Postgres to backend app..."
    fly postgres attach "$pg_app" --app "$BACKEND_APP"
    ok "DATABASE_URL secret set on $BACKEND_APP"
  fi
}

# ─── Set Secrets ─────────────────────────────────────────
set_secrets() {
  info "Setting backend secrets..."
  echo ""
  echo "  You need to provide secrets for the backend."
  echo "  The DATABASE_URL was set automatically by Fly Postgres."
  echo "  Press Enter to skip any optional secret."
  echo ""

  # DATABASE_URL is set by fly postgres attach — but we need the async variant
  # Fly sets DATABASE_URL=postgres://..., we need postgresql+asyncpg://...
  local db_url
  db_url=$(fly secrets list --app "$BACKEND_APP" 2>/dev/null | grep DATABASE_URL || true)
  if [ -n "$db_url" ]; then
    ok "DATABASE_URL already set (will derive async URL at boot)"
  fi

  read -rp "  ANTHROPIC_API_KEY (required for LLM): " anthropic_key
  read -rp "  JWT_SECRET (random string for auth): " jwt_secret
  read -rp "  LARK_WEBHOOK_URL (global fallback, optional): " lark_url
  read -rp "  SLACK_WEBHOOK_URL (optional): " slack_url
  read -rp "  APIFY_API_TOKEN (optional, for crawlers): " apify_token
  read -rp "  BRAVE_API_KEY (optional, for crawlers): " brave_key

  # Build secrets string — only include non-empty values
  local secrets=""
  [ -n "$anthropic_key" ] && secrets+="ANTHROPIC_API_KEY=$anthropic_key "
  [ -n "$jwt_secret" ] && secrets+="JWT_SECRET=$jwt_secret "
  [ -n "$lark_url" ] && secrets+="LARK_WEBHOOK_URL=$lark_url "
  [ -n "$slack_url" ] && secrets+="SLACK_WEBHOOK_URL=$slack_url "
  [ -n "$apify_token" ] && secrets+="APIFY_API_TOKEN=$apify_token "
  [ -n "$brave_key" ] && secrets+="BRAVE_API_KEY=$brave_key "

  if [ -n "$secrets" ]; then
    fly secrets set $secrets --app "$BACKEND_APP"
    ok "Secrets set on $BACKEND_APP"
  else
    info "No secrets provided, skipping"
  fi
}

# ─── Deploy ──────────────────────────────────────────────
deploy_backend() {
  info "Deploying backend..."
  fly deploy --config fly.backend.toml --app "$BACKEND_APP"
  ok "Backend deployed: https://$BACKEND_APP.fly.dev"
}

deploy_frontend() {
  info "Deploying frontend..."
  fly deploy --config fly.frontend.toml --app "$FRONTEND_APP" --build-arg "NEXT_PUBLIC_API_URL=https://$BACKEND_APP.fly.dev"
  ok "Frontend deployed: https://$FRONTEND_APP.fly.dev"
}

# ─── Main ────────────────────────────────────────────────
main() {
  check_fly

  if [ "${1:-}" = "update" ]; then
    info "Re-deploying (update mode)..."
    deploy_backend
    deploy_frontend
  else
    info "Full deployment (first-time setup)..."
    create_apps
    create_db
    set_secrets
    deploy_backend
    deploy_frontend
  fi

  echo ""
  echo "═══════════════════════════════════════════════════"
  echo "  Deployment complete!"
  echo ""
  echo "  Backend:  https://$BACKEND_APP.fly.dev"
  echo "  Frontend: https://$FRONTEND_APP.fly.dev"
  echo "  Health:   https://$BACKEND_APP.fly.dev/health"
  echo ""
  echo "  Useful commands:"
  echo "    fly logs --app $BACKEND_APP        # Backend logs"
  echo "    fly logs --app $FRONTEND_APP       # Frontend logs"
  echo "    fly ssh console --app $BACKEND_APP # SSH into backend"
  echo "    fly postgres connect $BACKEND_APP-db  # psql"
  echo "═══════════════════════════════════════════════════"
}

main "$@"
