#!/usr/bin/env bash
set -euo pipefail
: "${EXPECTED_SHA:?}"
READY_URL=https://skipwait.me/api/health/ready
. "$(dirname "$0")/poll-cloudflare-readiness.sh"
poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA"
direct_status=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 https://skipwaitmanus.ayodhya-711.workers.dev/api/health/ready || true)
[[ "$direct_status" == "404" ]] || { echo "::error::Public workers.dev origin returned $direct_status, expected 404"; exit 3; }
echo "RUNTIME CONVERGED: release=$EXPECTED_SHA state=ready direct_origin=closed"
