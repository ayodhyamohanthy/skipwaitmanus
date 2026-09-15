#!/usr/bin/env bash
set -euo pipefail
workflow=.github/workflows/deploy-api.yml
# The secret name may appear in code and workflow plumbing, but it must never
# become a checked-in Wrangler variable or a literal secret assignment.
if git grep -nE '"ADMIN_SMOKE_SECRET"[[:space:]]*:' -- wrangler.jsonc; then
  echo "ADMIN_SMOKE_SECRET must stay in the Cloudflare secret store" >&2
  exit 1
fi
if git grep -nE 'ADMIN_SMOKE_SECRET[[:space:]]*=[[:space:]]*[^$]' -- ':!server/adminSmokeFixture.test.ts'; then
  echo "A literal ADMIN_SMOKE_SECRET assignment is tracked" >&2
  exit 1
fi
block=$(sed -n '/name: Ensure admin smoke signing secret exists/,/name: Assert smoke secret hygiene/p' "$workflow")
grep -q 'set +x' <<<"$block"
grep -q 'wrangler secret list --json' <<<"$block"
grep -q 'openssl rand -base64 32 | npx wrangler secret put ADMIN_SMOKE_SECRET >/dev/null' <<<"$block"
if grep -Eq 'echo .*ADMIN_SMOKE_SECRET|set -x' <<<"$block"; then
  echo "Smoke secret provisioning must not echo values or enable tracing" >&2
  exit 1
fi
