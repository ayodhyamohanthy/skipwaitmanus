#!/usr/bin/env bash
set -euo pipefail
workflow=.github/workflows/deploy-api.yml
grep -q 'workflow_dispatch:' "$workflow"
grep -q -- '- "server/\*\*"' "$workflow"
grep -q -- '- "shared/\*\*"' "$workflow"
grep -q -- '- "wrangler.jsonc"' "$workflow"
# API deploy reporting must name the API plane and retain the deployed SHA.
grep -q 'Verify active Cloudflare container release' "$workflow"
# Release verification must run for every runtime deployment and precede the
# runtime marker. A disabled or reordered acceptance gate makes the marker lie.
verify_line=$(grep -n 'name: Verify active Cloudflare container release' "$workflow" | cut -d: -f1)
marker_line=$(grep -n 'name: Update deployed runtime marker' "$workflow" | cut -d: -f1)
test -n "$verify_line" -a -n "$marker_line" -a "$verify_line" -lt "$marker_line"
sed -n "$verify_line,$((verify_line+6))p" "$workflow" | grep -q "if: steps.changes.outputs.classification == 'runtime'"
! sed -n "$verify_line,$((verify_line+6))p" "$workflow" | grep -Eq 'if:.*false'
