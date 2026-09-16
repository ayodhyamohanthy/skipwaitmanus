#!/usr/bin/env bash
set -euo pipefail
: "${EXPECTED_SHA:?}" "${CLOUDFLARE_API_TOKEN:?}" "${CLOUDFLARE_ACCOUNT_ID:?}"
READY_URL=https://skipwait.me/api/health/ready
. "$(dirname "$0")/poll-cloudflare-readiness.sh"
head=$(git rev-parse HEAD);[[ "$head" == "$EXPECTED_SHA" ]]||{ echo '::error::Checked-out HEAD differs from expected SHA';exit 3;}
[[ "$(node -e 'let s=require("fs").readFileSync("wrangler.jsonc","utf8");let m=s.match(/"API_RELEASE":\s*"([^"]+)"/);process.stdout.write(m?.[1]||"")')" == "$EXPECTED_SHA" ]]||{ echo '::error::Stamped API_RELEASE mismatch';exit 3;}
context_hash=$(git ls-files -s Dockerfile .dockerignore package.json pnpm-lock.yaml patches server shared src/worker.ts wrangler.jsonc|sha256sum|cut -d' ' -f1)
deploy(){ npx wrangler deploy 2>&1|tee "/tmp/wrangler-deploy-$1.log";}
app_id=$(npx wrangler containers list --json|jq -r '.[]|select(.name=="skipwaitmanus-api")|.id'|head -1)
deploy 1
first_info=$(npx wrangler containers info "$app_id" --json);first_version=$(jq -r '.current_version//.version//empty'<<<"$first_info");first_image=$(jq -r '.configuration.image//.image//empty'<<<"$first_info");echo "deploy_phase=1 version=$first_version image=$first_image"
set +e;READY_TIMEOUT_SECONDS=120 poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA";result=$?;set -e
[[ $result == 0 ]]&&exit 0;[[ $result == 1 ]]||exit "$result"
instances=$(npx wrangler containers instances "$app_id" --json);expected_name="skipwaitmanus-api-${EXPECTED_SHA:0:12}";jq -e --arg n "$expected_name" '.[]|select(.name==$n)'<<<"$instances">/dev/null||{ echo '::error::Expected release identity absent; refusing activation retry';exit 3;}
[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]]&&[[ "$(git ls-files -s Dockerfile .dockerignore package.json pnpm-lock.yaml patches server shared src/worker.ts wrangler.jsonc|sha256sum|cut -d' ' -f1)" == "$context_hash" ]]||{ echo '::error::Artifact inputs changed; refusing activation retry';exit 3;}
echo 'activation_retry=1';deploy 2
second_info=$(npx wrangler containers info "$app_id" --json);second_version=$(jq -r '.current_version//.version//empty'<<<"$second_info");second_image=$(jq -r '.configuration.image//.image//empty'<<<"$second_info");echo "deploy_phase=2 version=$second_version image=$second_image"
set +e;READY_TIMEOUT_SECONDS=240 poll_cloudflare_readiness "$READY_URL" "$EXPECTED_SHA";result=$?;set -e
if [[ $result != 0 ]];then echo "Final Cloudflare application=$app_id";npx wrangler containers instances "$app_id" --json|jq -c '.[]|{name,state,version:(.version? // null),created}';fi
exit "$result"
