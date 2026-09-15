#!/usr/bin/env bash
set -euo pipefail
workflow=.github/workflows/deploy-api.yml
grep -q 'workflow_dispatch:' "$workflow"
grep -q -- '- "server/\*\*"' "$workflow"
grep -q -- '- "shared/\*\*"' "$workflow"
grep -q -- '- "wrangler.jsonc"' "$workflow"
# API deploy reporting must name the API plane and retain the deployed SHA.
grep -q 'SYNC ACCEPTED: API commit \$EXPECTED_SHA' "$workflow"
