#!/usr/bin/env bash
set -euo pipefail
# macOS self-hosted runners have shasum, not GNU sha256sum; same digest either way.
sha256_portable(){ if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi; }
: "${EXPECTED_SHA:?}" "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"
READY_URL=https://skipwait.me/api/health/ready
. "$(dirname "$0")/poll-cloudflare-readiness.sh"
head=$(git rev-parse HEAD);[[ "$head" == "$EXPECTED_SHA" ]]||{ echo '::error::Checked-out HEAD differs from expected SHA';exit 3;}
[[ "$(node -e 'let s=require("fs").readFileSync("wrangler.jsonc","utf8");let m=s.match(/"API_RELEASE":\s*"([^"]+)"/);process.stdout.write(m?.[1]||"")')" == "$EXPECTED_SHA" ]]||{ echo '::error::Stamped API_RELEASE mismatch';exit 3;}
context_hash=$(git ls-files -s Dockerfile .dockerignore package.json pnpm-lock.yaml patches server shared src/worker.ts wrangler.jsonc|sha256_portable|cut -d' ' -f1)
deploy(){
  local phase="$1" log="/tmp/wrangler-deploy-$1.log" status
  set +e
  npx wrangler deploy 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  set -e
  if [[ $status -eq 0 ]]; then return 0; fi
  # A zone-scoped token can successfully create the one configured route and
  # disable workers.dev, then Wrangler fails while listing all zone routes.
  # Continue only for that exact partial-trigger error. The exact-SHA readiness
  # gate below proves the canonical route reached this release, and the final
  # direct-origin probe proves workers.dev stayed closed.
  if grep -q "Uploaded skipwaitmanus" "$log" \
    && grep -Eq "SUCCESS.*Modified application skipwaitmanus-api|no changes skipwaitmanus-api" "$log" \
    && grep -Eq "Applied changes|No changes to be made" "$log" \
    && grep -q "/workers/routes" "$log" \
    && grep -q "Authentication error \[code: 10000\]" "$log" \
    && grep -q '"workers_dev": false' wrangler.jsonc \
    && grep -q '"pattern": "skipwait.me/api/\*"' wrangler.jsonc; then
    echo "::warning::Wrangler could not list all zone routes after applying the configured trigger; deferring acceptance to canonical exact-SHA and direct-origin gates"
    return 0
  fi
  return "$status"
}
app_id="a0320ae6-5d50-43d5-9515-1f89bd74d069"
deploy 1
# Production DB cutover: after phase 1 the latest Worker version is the deployed one, so Cloudflare
# accepts a secret edit (it refuses while a PR preview version is latest). Fails the deploy loudly.
if [[ -n "${NEWDB_PASSWORD:-}" ]]; then
  : "${NEWDB_HOST:?}" "${NEWDB_USER:?}"
  enc=$(NEWDB_PASSWORD="$NEWDB_PASSWORD" node -e 'process.stdout.write(encodeURIComponent(process.env.NEWDB_PASSWORD))')
  # Cloudflare briefly refuses secret edits right after a version deploy
  # ("latest version isn't currently deployed"); retry until the version settles.
  secret_set=0
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if printf '%s' "mysql://${NEWDB_USER}:${enc}@${NEWDB_HOST}:3306/skipwait" | npx wrangler secret put DATABASE_URL >/dev/null 2>&1; then
      secret_set=1
      break
    fi
    echo "DATABASE_URL secret put attempt ${attempt} failed; retrying in 20s"
    sleep 20
  done
  if [[ "$secret_set" != "1" ]]; then
    # Cloudflare refuses secret edits while the newest Worker version is another branch's PR preview
    # upload (error 10215). The code already shipped in phase 1. If the secret already exists on the
    # Worker, the production database is already wired, so warn loudly and let the exact-SHA readiness
    # gate below decide. If it does not exist, fail: the Worker would have no database.
    if npx wrangler secret list 2>/dev/null | grep -q '"name": "DATABASE_URL"'; then
      echo "::warning::DATABASE_URL secret put was refused after 12 attempts (a PR preview upload was the newest Worker version). The secret already exists, so it was NOT refreshed this run. If the database password was rotated, re-run this workflow."
    else
      echo '::error::Could not set DATABASE_URL to the new database'; exit 5
    fi
  else
    echo "DATABASE_URL set to ${NEWDB_HOST}/skipwait (value not printed)"
  fi
fi
# Worker-version activation plus container cold start (edge image pull + node
# boot + first schema pass) takes 15-40 minutes to converge on live traffic;
# every recent release flipped late, after its gate had already timed out.
# Gate to 30 minutes so a healthy rollout can actually pass; a genuine failure
# still fails loudly instead of hanging the pipeline.
set +e;READY_TIMEOUT_SECONDS=1800 poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA";result=$?;set -e
if [[ $result == 0 ]]; then
  direct_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 https://skipwaitmanus.ayodhya-711.workers.dev/api/health/ready || true)
  [[ "$direct_status" == "404" ]] || { echo "::error::Public workers.dev origin returned $direct_status, expected 404"; exit 3; }
  exit 0
fi
exit "$result"
