# Bug Inventory & Fix Log — 2026-09-03

Method: adversarial review by an independent reviewer across 7 scan areas
(payment routing, Chargebee config, admin refunds, empty states, server
validation, SPA/API overlap, stale branding). Full suite was green before
the hunt; scans of empty/null states and POST validation returned zero bugs.

## Fixed (6 bugs — 0 HIGH, 2 MEDIUM, 4 LOW)

| ID | Severity | Bug | Root cause | Fix |
|----|----------|-----|-----------|-----|
| BUG-1 | MEDIUM | Payment labels claim Razorpay/PayPal but checkout is Chargebee-hosted | Labels hardcoded "Razorpay Domestic"/"PayPal" while both pages call /api/chargebee/checkout | Renamed to "Razorpay (INR)"/"PayPal (USD)" + descriptor "Secure hosted checkout via Chargebee"; rendered as secondary line |
| BUG-2 | LOW | Unconfigured Chargebee → 502 | resolveChargebeeRuntime throws but catch maps all errors to 502 | isChargebeeNotConfigured() → 503 "Chargebee is not configured" before generic 502 |
| BUG-3 | LOW | Refund button shows on non-credited rows | Condition was `!== "refunded"` instead of `=== "credited"` | Explicit `status === "credited"` guard |
| BUG-4 | LOW | Claim route collapses all failures to 409 | catch always 409 | Classified: 403 (email verify), 409 (race), 404 (missing), 500 (server) |
| BUG-5 | MEDIUM | Unmatched /api/* returns 200 HTML | SPA catch-all `app.use("*")` after API routes | `app.use("/api", 404 JSON)` before SPA fallback (both dev+prod) |
| BUG-6 | LOW | Dead component with stale "Login with Manus" branding | ManusDialog.tsx exported but zero imports | Deleted component |

## Scanned clean (verified, no bugs)

- Empty/null states: MyRequests, MyCompanyInbox coalesce with `|| []` + dedicated empty states
- Server POST validation: withdraw/claim/otp-send + all reviewed POST routes validate identity/params/body
- No user-facing "Clerk"/"Stripe" strings remain

## Known remaining (low priority, not user-facing)

- Server-internal comments reference the legacy "Manus Forge" host
  (server/_core/llm.ts, modelRouter.ts, notification.ts, map.ts) — internal
  fallback code only, no UI impact.
- 4 test files flake under full-suite parallel load (pass in isolation) —
  timeout-sensitive, not code bugs.

## Verification

- Full suite: 261 passed / 5 skipped (82 files) — green after fixes
- pnpm check: clean · pnpm build: exit 0
- Commit: 94cb16f (pushed; CI deploys + self-verifies)
