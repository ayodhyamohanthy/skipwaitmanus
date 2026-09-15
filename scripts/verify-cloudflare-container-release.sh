#!/usr/bin/env bash
set -euo pipefail
: "${EXPECTED_SHA:?}" "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"
APP_NAME=skipwaitmanus-api
READY_URL=https://skipwait.me/api/health/ready
apps=$(npx wrangler containers list --json)
app_id=$(jq -r --arg n "$APP_NAME" '.[] | select(.name==$n) | .id' <<<"$apps" | head -1)
[ -n "$app_id" ] || { echo "Cloudflare application $APP_NAME not found"; exit 1; }
info=$(npx wrangler containers info "$app_id" --json)
instances=$(npx wrangler containers instances "$app_id" --json)
current=$(jq -r '.current_version // .version // empty' <<<"$info")
image=$(jq -r '.configuration.image // .image // empty' <<<"$info")
expected_name="skipwaitmanus-api-${EXPECTED_SHA:0:12}"
[ -n "$current" ] && [ -n "$image" ] || { echo "::error::Cloudflare application omitted deployment version or image"; exit 1; }
if [ -n "${BEFORE_VERSION:-}" ] && [ "$current" = "$BEFORE_VERSION" ] && [ "$image" = "${BEFORE_IMAGE:-}" ]; then
  echo "::error::Cloudflare application image/version did not change during deploy"; exit 1
fi
jq -e --arg n "$expected_name" '.[] | select(.name==$n)' <<<"$instances" >/dev/null || { echo "::error::Release-scoped identity $expected_name is absent"; exit 1; }
echo "Cloudflare application=$app_id deploymentVersion=$current image=$image"
jq -c '.[] | {name,state,version:(.version? // null),created}' <<<"$instances"
if jq -e --arg n "$expected_name" '.[] | select(.name==$n and ((.version? // null)==null or (.state=="inactive")))' <<<"$instances" >/dev/null; then
  echo "::warning::Release identity exists but Cloudflare reports an inactive/null-version instance; runtime readiness decides convergence"
fi

check_ready() {
  local response body status parsed_sha state service
  response=$(curl -sS --max-time 90 -w $'\n%{http_code}' "$READY_URL") || return 2
  status=${response##*$'\n'}; body=${response%$'\n'*}
  jq -e . >/dev/null 2>&1 <<<"$body" || { echo "Readiness returned non-JSON (HTTP $status)"; return 3; }
  service=$(jq -r '.service // empty' <<<"$body"); parsed_sha=$(jq -r '.commitSha // empty' <<<"$body"); state=$(jq -r '.state // empty' <<<"$body")
  echo "Runtime readiness HTTP=$status service=$service sha=${parsed_sha:0:12} state=$state"
  [ "$service" = "skipwait-api" ] || return 3
  [ "$parsed_sha" = "$EXPECTED_SHA" ] || { echo "::error::Runtime SHA mismatch: got $parsed_sha expected $EXPECTED_SHA"; return 4; }
  if [ "$status" = 200 ] && [ "$state" = ready ]; then return 0; fi
  if [ "$status" = 503 ] && [ "$state" = reconciling ]; then return 5; fi
  return 3
}

set +e; check_ready; result=$?; set -e
if [ "$result" -eq 0 ]; then echo "RUNTIME CONVERGED: exact release $EXPECTED_SHA is ready"; exit 0; fi
if [ "$result" -eq 5 ]; then
  sleep 5
  set +e; check_ready; result=$?; set -e
  if [ "$result" -eq 0 ]; then echo "RUNTIME CONVERGED: exact release $EXPECTED_SHA is ready after reconciliation"; exit 0; fi
fi
[ "$result" -eq 4 ] && exit 1

echo "Runtime was unreachable or invalid; waiting one idle window without HTTP probes"
sleep 660
set +e; check_ready; result=$?; set -e
[ "$result" -eq 0 ] && { echo "RUNTIME CONVERGED: exact release $EXPECTED_SHA is ready after idle recycle"; exit 0; }
echo "::error::Cloudflare image=$image version=$current exists, but runtime did not converge to ready SHA $EXPECTED_SHA"
exit 1
