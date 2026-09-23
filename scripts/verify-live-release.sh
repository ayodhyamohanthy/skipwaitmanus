#!/usr/bin/env bash
# Live-release drift verifier: asserts the canonical API serves the exact HEAD
# of origin/main. Deploys converge late (worker activation + container cold
# start), so the deploy-time gate can miss; this is the async source of truth.
# Exit 0 when converged, 1 on drift, 2 on probe failure.
set -euo pipefail
EXPECTED_SHA="${EXPECTED_SHA:?set to origin/main HEAD}"
READY_URL="${READY_URL:-https://skipwait.me/api/health/ready}"
live=$(curl -sS --max-time 20 "$READY_URL" || exit 2)
sha=$(printf '%s' "$live" | jq -r .commitSha 2>/dev/null || echo "")
state=$(printf '%s' "$live" | jq -r .state 2>/dev/null || echo "")
echo "live sha=${sha:0:12} state=$state expected=${EXPECTED_SHA:0:12}"
if [[ "$sha" == "$EXPECTED_SHA" && "$state" == "ready" ]]; then
  echo "CONVERGED"
  exit 0
fi
echo "DRIFT: live does not match origin/main HEAD"
exit 1
