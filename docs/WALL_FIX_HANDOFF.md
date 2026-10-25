# /wall 500 fix — handoff (2026-09-04)

## Symptom
Live browser audit (scripts/live-flow-audit.mjs) found the /wall page broken:
`GET /api/opportunities` → HTTP 500 → console error "Failed to load resource
(500)" and the opportunity wall rendered empty.

## Root cause (confirmed by code + audit)
`listPublicCompanyOpportunities()` (and the owner list) SELECT
`companyOpportunities.compensation`. That column was added to `drizzle/schema.ts`
(compensation feature) and migration `0034`, but was never applied to the live
Azure MySQL DB. The earlier `9d383cb` fix added `jobs.compensation` +
`referralRequests.savedAt` to the live DB but MISSED `companyOpportunities.compensation`.

## Fix (two parts, committed `0ee1b37`)

1. **Code resilience** — `server/db.ts`: both opportunity list queries now catch
   the missing-column error and retry without `compensation`, so the wall and
   the post-opportunity owner view NEVER 500 again, even before the column exists.
2. **Permanent DB reconcile** — two artifacts:
   - `drizzle/0035_company_opportunities_compensation.sql` (MySQL 8.0 ALTER)
   - `scripts/apply-missing-columns.mjs` — idempotent reconciler (checks
     information_schema, ALTERs only missing columns) covering
     `companyOpportunities.compensation`, `jobs.compensation`,
     `referralRequests.savedAt`.

## How to apply the permanent DB fix (one command, needs your DB access)

```bash
cd ~/.openclaw-autoclaw/workspace/skipwaitmanus
DATABASE_URL='mysql://USER:PASS@HOST:3306/DB' node scripts/apply-missing-columns.mjs
```

(The tool also falls back to `.env`'s DATABASE_URL if you set it there. Your
`.env` currently has an empty DATABASE_URL, and the live value is a Cloudflare
Worker secret I cannot read — which is why I could not apply it myself.)

## Verification (as far as I can go autonomously)

| Check | Result |
|---|---|
| `pnpm check` | clean (tsc --noEmit, exit 0) |
| `pnpm build` | exit 0 |
| opportunityWall + postOpportunity + integration tests | 19/19 pass |
| Deploy API for `0ee1b37` | completed success (image built + pushed) |
| Full browser audit (pre-fix) | 19/19 checks, /wall was the only failure |
| Live /api/opportunities | still 500 until the warm container recycles OR the column is added |

## The one thing that needs your action
The live container instance is "warm" and recycles only after ~10 min idle
(Cloudflare `sleepAfter=10m`); my repeated health checks kept it warm. Two ways
to fully close this:

- **Option A (permanent, 30s):** run the one-command `apply-missing-columns.mjs`
  above with your DATABASE_URL — the column is added and /wall works immediately.
- **Option B (automatic):** do nothing for ~10 min (no traffic); the instance
  cold-starts on `0ee1b37` and the defensive fallback serves the wall without
  the pay range until the column is added.

## Rollback
`git revert 0ee1b37` reverts both the resilience fallback and the migration
tool. The DB column (if you add it) is additive and harmless to keep.
