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
  echo "::warning::Cloudflare application image/version snapshot has not changed yet; exact baked runtime SHA remains the hard gate"
fi
if ! jq -e --arg n "$expected_name" '.[] | select(.name==$n)' <<<"$instances" >/dev/null; then echo "::warning::Release-scoped identity is not visible before first readiness request"; fi
echo "Cloudflare application=$app_id deploymentVersion=$current image=$image"
jq -c '.[] | {name,state,version:(.version? // null),created}' <<<"$instances"
if jq -e --arg n "$expected_name" '.[] | select(.name==$n and ((.version? // null)==null or (.state=="inactive")))' <<<"$instances" >/dev/null; then
  echo "::warning::Release identity exists but Cloudflare reports an inactive/null-version instance; runtime readiness decides convergence"
fi

. "$(dirname "$0")/poll-cloudflare-readiness.sh"

set +e; poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA"; result=$?; set -e
if [ "$result" -eq 0 ]; then
  instances=$(npx wrangler containers instances "$app_id" --json)
  jq -e --arg n "$expected_name" '.[] | select(.name==$n)' <<<"$instances" >/dev/null || { echo "::error::Exact runtime SHA is ready but release-scoped identity $expected_name is absent"; exit 1; }
  echo "RUNTIME CONVERGED: exact release $EXPECTED_SHA is ready after bounded reconciliation"; exit 0
fi
instances=$(npx wrangler containers instances "$app_id" --json)
echo "Final Cloudflare application=$app_id deploymentVersion=$current image=$image"
jq -c '.[] | {name,state,version:(.version? // null),created}' <<<"$instances"
exit "$result"
