#!/usr/bin/env bash
set -euo pipefail
: "${EXPECTED_SHA:?}" "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"
APP_NAME=skipwaitmanus-api
apps=$(npx wrangler containers list --json)
app_id=$(jq -r --arg n "$APP_NAME" '.[] | select(.name==$n) | .id' <<<"$apps" | head -1)
[ -n "$app_id" ] || { echo "Cloudflare application $APP_NAME not found"; exit 1; }
info=$(npx wrangler containers info "$app_id" --json)
instances=$(npx wrangler containers instances "$app_id" --json)
current=$(jq -r '.current_version // .version // empty' <<<"$info")
image=$(jq -r '.configuration.image // .image // empty' <<<"$info")
expected_name="skipwaitmanus-api-${EXPECTED_SHA:0:12}"
echo "Cloudflare application=$app_id deploymentVersion=$current image=$image"
jq -c '.[] | {name,state,version,created}' <<<"$instances"
# A current-version instance with the release-scoped name proves Cloudflare is
# running the application version whose image was built with EXPECTED_SHA.
if jq -e --arg n "$expected_name" --argjson v "$current" '.[] | select(.name==$n and (.version|tonumber)==$v and (.state=="running" or .state=="ready"))' <<<"$instances" >/dev/null; then
  echo "RUNTIME CONVERGED: $expected_name is running application version $current ($image)"; exit 0
fi
# Never wake the HTTP service while checking. Give stale instances one full
# 10-minute idle window, then re-read Cloudflare control-plane state.
echo "Current release is not running yet; waiting one idle window without HTTP probes"
sleep 660
info=$(npx wrangler containers info "$app_id" --json)
instances=$(npx wrangler containers instances "$app_id" --json)
current=$(jq -r '.current_version // .version // empty' <<<"$info")
image=$(jq -r '.configuration.image // .image // empty' <<<"$info")
jq -c '.[] | {name,state,version,created}' <<<"$instances"
if jq -e --arg n "$expected_name" --argjson v "$current" '.[] | select(.name==$n and (.version|tonumber)==$v and (.state=="running" or .state=="ready"))' <<<"$instances" >/dev/null; then
  echo "RUNTIME CONVERGED: $expected_name is running application version $current ($image)"; exit 0
fi
echo "::error::Cloudflare uploaded/configured image $image at version $current, but release $EXPECTED_SHA has no running current-version instance after the idle window"
exit 1
