#!/bin/bash
# D-174 .search local captures: switch flipped by an UNCOMMITTED patch, reverted at the end.
export PLAYWRIGHT_BROWSERS_PATH=/workspace/work/ms-playwright
export LD_LIBRARY_PATH=/workspace/work/e2e/pwlibs
cd /workspace/work/skipwaitmanus-2-wt/d174-journey-search
echo "HEAD=$(git rev-parse HEAD)"; git status --porcelain
sed -i 's/^export const COMPANY_TYPEAHEAD_ENABLED = false;/export const COMPANY_TYPEAHEAD_ENABLED = true; \/\/ LOCAL CAPTURE ONLY - never committed/' client/src/pages/explore/useCompanySearch.ts
git diff --stat
VITE_GOAL_SURFACES=discovery node node_modules/vite/bin/vite.js --port 5199 --strictPort > /workspace/work/d174-vite.log 2>&1 &
VP=$!
for i in $(seq 1 90); do curl -s -o /dev/null http://localhost:5199/ && break; sleep 1; done
echo "vite up after $i s"
curl -s -o /dev/null http://localhost:5199/explore
F=/workspace/work/d174-search-fixtures
timeout 100 node scripts/kit-screens/capture.mjs --goal discovery --route /explore --viewport web --base http://localhost:5199 --fixture $F/explore__typing.json > /dev/null 2>&1; echo "warm $?"
for s in typing suggestions no-match error function-query alias; do
  timeout 150 node scripts/kit-screens/capture.mjs --goal discovery --route /explore --viewport both --base http://localhost:5199 --fixture $F/explore__$s.json > /workspace/work/d174-cap-$s.json 2>&1; echo "$s $?"
done
kill $VP; wait $VP 2>/dev/null
git checkout client/src/pages/explore/useCompanySearch.ts
mkdir -p /workspace/work/d174-search-captures
for s in typing suggestions no-match error function-query alias; do for w in 1280 390; do mv design/goal-ui/captures/discovery/$s-$w.png /workspace/work/d174-search-captures/explore-search-$s-$w.png; done; done
git status --porcelain
echo CAPDONE
