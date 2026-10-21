#!/usr/bin/env bash
# SkipWait QA preview - LOCAL fallback run (scratch DB, fictional data only).
# Usage:
#   1. cp .env.qa-local.example .env.qa-local
#   2. Fill DATABASE_URL in .env.qa-local (user + password from the vault entry
#      "skipwait-qa scratch DB (local QA)"; host and db name are prefilled).
#   3. bash scripts/qa-local-run.sh
#   4. Open http://localhost:3100  (stop with Ctrl-C)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.qa-local ]; then
  echo "Missing .env.qa-local - copy .env.qa-local.example and fill DATABASE_URL first." >&2
  exit 1
fi
set -a; . ./.env.qa-local; set +a

command -v node >/dev/null || { echo "Install Node 22 first: https://nodejs.org" >&2; exit 1; }
command -v pnpm >/dev/null || npm install -g pnpm@10.34.7

echo "== Preflight: can this machine reach the scratch database?"
if command -v mysql >/dev/null; then
  DBPW=$(printf '%s' "$DATABASE_URL" | sed -E 's#mysql://[^:]+:([^@]+)@.*#\1#')
  mysql -h skipwait-prod-db.mysql.database.azure.com -u skipwait_qa_local --ssl-mode=REQUIRED -p"$DBPW" \
    -e "SELECT COUNT(*) AS companies FROM skipwait_qa.companies;" skipwait_qa || {
      echo "Cannot reach the database from this network. The Azure firewall may block this machine - report this and stop." >&2; exit 1; }
else
  echo "(mysql client not found - skipping preflight; the app will tell us if the DB is unreachable)"
fi

echo "== Installing dependencies"
pnpm install --frozen-lockfile

echo "== Building (preview flags ON)"
VITE_COMPANY_RESPONSE_SIGNAL=true VITE_SHARE_WIN_CARD=true VITE_SHARE_IMPACT_CARD=true pnpm build

echo "== Starting on http://localhost:3100  (Ctrl-C to stop)"
NODE_ENV=test PORT=3100 QA_PREVIEW=true \
  BILLING_ENV=test CHARGEBEE_LIVE_ENABLED=false \
  CHARGEBEE_SITE=skipwait-test CHARGEBEE_API_KEY=qa-preview-dummy CHARGEBEE_WEBHOOK_SECRET=qa-preview-dummy \
  COMPANY_RESPONSE_SIGNAL_ENABLED=true SHARE_IMPACT_CARD_ENABLED=true \
  JWT_SECRET="${JWT_SECRET:-local-qa-not-a-secret}" \
  DATABASE_URL="$DATABASE_URL" \
  node dist/index.js
