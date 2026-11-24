# SEEKER-requests-no-samples: My asks shows no fabricated sample asks and no expiry or credit promise (D-387)

Tier 2 · lane `seeker-requests-samples` · branch `agent/queue/seeker-requests-no-samples` · CDO

## The defect, seen live

Signed-in live QA run 45364628436 (Nov 24, demo seeker, `/requests` at 1280 and 390) shows three
sample rows under "SAMPLE · NOT REAL ASKS" (`client/src/pages/MyRequests.tsx`, `sampleAskRows` and
the `GoalSampleRows` render near line 292). The first says "Expires in 7 days if nobody picks it up.
The credit comes back." That contradicts D-174 (ask expiry suspended as launch direction) and shows
the internal word "credit" (D-173/D-180). AGENTS.md: never ship sample data. The referrer side
already removed its samples for the same reason (D-371, `LAUNCH-qa-fixes`).

## The fix

1. Remove `sampleAskRows` and the `GoalSampleRows` render from `MyRequests.tsx`. The empty state
   keeps the goal line and the one "Your next step" block with its single black commit (D-150).
2. If `client/src/components/goal/GoalSampleRows.tsx` then has no importer, delete it and its test
   references; leave `ReferrerSampleRows.tsx` alone.
3. No new copy beyond what the empty state needs; if a line is needed, it states the action plainly
   (D-153) and never mentions credits, expiry or refunds.

## Tests (red first)

Update `client/src/pages/myRequests.sampleStates.test.tsx` and `myRequests.empty.test.tsx`: an empty
account renders no "SAMPLE" text, no "Expires", no "credit", and still renders the next-step block.
`node scripts/design-token-audit.mjs` passes. Captures of the empty `/requests` at 1280 and 390.

## Acceptance

Focused tests, token audit and `pnpm check` green; required CI green; the next signed-in live QA
run's `/requests` captures show no sample rows (link them in the Status section).

## Status

- SEEKER-requests-no-samples: todo
