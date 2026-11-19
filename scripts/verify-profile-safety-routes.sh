#!/usr/bin/env bash
# Live signed-out contract probe for the profile, work-items, referrer-preference
# and safety routes. Read-only: no cookies, no writes. Proves every member route
# rejects anonymous callers, every admin route rejects anonymous callers, and an
# unknown public profile handle returns the same 404 whether or not it exists.
# Signed-in and admin-role paths are covered by server/profileRoutes.test.ts and
# server/safetyRoutes.test.ts. Exit 0 on pass, 1 on any mismatch.
set -uo pipefail
BASE="${BASE_URL:-https://skipwait.me}"
fail=0
probe() { # method path expected_status
  local code
  code=$(curl -sS --max-time 20 -o /dev/null -w '%{http_code}' -X "$1" -H 'content-type: application/json' ${4:+-d "$4"} "$BASE$2") || code=000
  if [ "$code" = "$3" ]; then echo "ok   $1 $2 -> $code"; else echo "FAIL $1 $2 -> $code (want $3)"; fail=1; fi
}
for p in /api/profile/me /api/work-items /api/referrer-preferences /api/safety-reports/mine /api/company-suggestions/mine; do probe GET "$p" 401; done
probe PUT /api/profile/me 401 '{}'
probe POST /api/work-items 401 '{"title":"x"}'
probe PATCH /api/work-items/1 401 '{}'
probe DELETE /api/work-items/1 401
probe PUT /api/referrer-preferences 401 '{}'
probe POST /api/safety-reports 401 '{"reason":"Spam or repeated asks"}'
probe POST /api/company-suggestions 401 '{"companyName":"x"}'
for p in /api/admin/safety-reports /api/admin/company-suggestions; do probe GET "$p" 401; done
probe POST /api/admin/safety-reports/1/decision 401 '{"status":"resolved","note":"x"}'
probe POST /api/admin/company-suggestions/1/decision 401 '{"status":"approved"}'
probe GET /api/p/this-handle-does-not-exist-zz 404
probe GET '/api/p/BAD%20HANDLE' 404
exit $fail
