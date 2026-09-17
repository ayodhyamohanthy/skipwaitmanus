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
  # Re-read every control-plane fact after readiness. A pre-poll snapshot can
  # be stale while Cloudflare activates a new image.
  info=$(npx wrangler containers info "$app_id" --json)
  instances=$(npx wrangler containers instances "$app_id" --json)
  current=$(jq -r '.current_version // .version // empty' <<<"$info")
  image=$(jq -r '.configuration.image // .image // empty' <<<"$info")
  [ -n "$current" ] && [ -n "$image" ] || { echo "::error::Cloudflare omitted active version or image after readiness"; exit 1; }
  # Containers may report `stopped` immediately after serving readiness because
  # sleepAfter scales the release down and control-plane state lags. Do not
  # weaken the running-instance gate: wake the exact SHA and poll control-plane
  # state for bounded convergence.
  deadline=$((SECONDS + ${RELEASE_CONVERGENCE_TIMEOUT_SECONDS:-90}))
  until jq -e --arg n "$expected_name" --argjson v "$current" \
    '.[] | select(.name==$n and .state=="running" and .version==$v)' \
    <<<"$instances" >/dev/null; do
      if (( SECONDS >= deadline )); then
        echo "::error::Exact SHA is ready, but release identity $expected_name did not converge to running on active version $current"
        jq -c '.[] | {name,state,version:(.version? // null),created}' <<<"$instances"
        exit 1
      fi
      curl -fsS --max-time 20 "$READY_URL" >/dev/null || true
      sleep "${RELEASE_CONVERGENCE_INTERVAL_SECONDS:-5}"
      instances=$(npx wrangler containers instances "$app_id" --json)
      info=$(npx wrangler containers info "$app_id" --json)
      current=$(jq -r '.current_version // .version // empty' <<<"$info")
    done
  echo "RUNTIME CONVERGED: release=$EXPECTED_SHA version=$current image=$image state=ready"
  exit 0
fi
instances=$(npx wrangler containers instances "$app_id" --json)
echo "Final Cloudflare application=$app_id deploymentVersion=$current image=$image"
jq -c '.[] | {name,state,version:(.version? // null),created}' <<<"$instances"
exit "$result"
