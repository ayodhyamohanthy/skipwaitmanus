# OPS-live-qa-journeys: signed-in live QA proves the money, privacy and transition rows with the two demo accounts (D-389)

Tier 1 · lane `live-qa-journeys` · branch `agent/queue/ops-live-qa-journeys` · epic D-212 · depends on `OPS-live-qa-hardening`

## Why

`LAUNCH-live-qa` (PR #1540, `docs/qa/launch-live-qa-2026-11-24.md` on `agent/queue/launch-live-qa-acceptance`)
proved every signed-in route loads at 1280 and 390 (run 45372954261), but the runner only navigates. Its open
items are: (1) the demo wallet before and after, (2) document isolation and cross-user denial on the live
release, (3) safe transitions (create, withdraw, claim, accept), (4) job-link previews. The owner chose, on
Nov 24 (D-389), to prove these **on skipwait.me with the two demo reviewer accounts**, not on the QA preview.

## The build

Add a `mode` input to `.github/workflows/live-qa.yml` (`navigate` default, `journeys`), and the journeys logic
in `scripts/live-qa-signed-in.mjs` or a sibling `scripts/live-qa-journeys.mjs`. Ordinary and automatic runs
stay navigation-only. **Read the server code for every endpoint, body and transition before writing a step**
(`server/privateReferralRoutes.ts`, `server/db.ts`, `server/referrerDocumentAccess.ts`,
`server/coverageDelivery.ts`, `shared/creditLedger.ts`); never guess a route.

Steps, each recording status code, the relevant redacted response fields and, for UI, captures at 1280 and 390:

1. Fail closed unless both signed-in identities are exactly `seeker@reviewer.skipwait.me` and
   `referrer@reviewer.skipwait.me`.
2. Read the seeker wallet (`GET /api/credits/summary`). If no free referral is available, stop and report
   (never buy, never open checkout).
3. Send one referral request from the demo seeker to the demo referrer's company using the free allowance.
4. As the referrer, confirm the request is visible with no seeker name and no file links before acceptance.
5. Claim and accept as the referrer; confirm name and files appear only after the referrer's own acceptance
   (D-019(e)).
6. Cross-user denial: the referrer requesting a document of a request it was not accepted on, and the seeker
   reading a request it does not own, both answer the no-access 404 (ids from the demo accounts only).
7. The withdrawal or decline path the money rules define, then read the wallet again and assert the ledger
   matches D-034 (charge at first visibility), D-147 (an employee decline keeps it spent) and the
   withdrawal-before-pickup return; record the keyed ledger rows.
8. One job-link preview (`/api/job-link/preview`) for a public URL already used by the e2e fixtures.
9. Clean up so the next run starts from the same state (withdraw or close whatever step 3 created).

## Hard limits (stop and report instead of working around any of them)

- Never a payment, checkout, hosted page, Chargebee or other provider call.
- Never any account other than the two demo accounts; never admin routes.
- Passwords only from the two repository secrets, masked; never in arguments, logs or artifacts.
- `workflow_dispatch` only (no schedule, no `workflow_run` trigger for `journeys`); one run at a time
  (concurrency group shared with `live-qa`).
- If any step would need a real payment, a non-demo account or a production setting change, stop and report.

## Tests (red first)

Unit tests with fixtures for: the identity fail-closed check, the no-free-referral stop, the ledger
assertion (D-034/D-147/withdrawal return), redaction of names/files before acceptance, and the workflow
contract (`journeys` only on dispatch, concurrency group).

## Acceptance

Focused tests and `pnpm check` green; required CI green. Then one dispatched `journeys` run, linked here,
and `LAUNCH-live-qa` updates its BUGFREE_GATE rows with that run's evidence.

## Status

- OPS-live-qa-journeys: in progress — DeepSeek V4.1 Flash · e9e1 — 2026-11-24 — branch agent/queue/ops-live-qa-journeys

### Build notes (DeepSeek V4.1 Flash · e9e1, 2026-11-24)

- `mode` input on `.github/workflows/live-qa.yml`: `navigate` (default) or `journeys`. The journeys step runs only on
  `workflow_dispatch`, shares the `live-qa` concurrency group, and the passwords are masked before either script.
- `scripts/live-qa-journeys.mjs` signs in both demo accounts, fails closed unless each session is exactly its demo
  email, stops before buying when the wallet has no free referral, and records every step in `live-qa/summary.json`.
- **Route to the demo referrer's company.** The demo referrer's verified domain is `reviewer.skipwait.me`, and no
  catalog job or job URL resolves to that subdomain (`directEmployerDomainFromTargetUrl` returns the registrable
  `skipwait.me`). The run therefore reuses the demo referrer's live walk-in post at that domain, or publishes one
  for the run and closes it again. The post is public on `/api/opportunities` for the minute or two the run takes;
  its role title says it is an automatic check removed after the run.
- **Money sequence (one credit net per run).** Ask A: create (spend at first visibility, D-034) → preview privacy →
  document denial → claim → accept → reveal → cross-role denial → referrer step-back → seeker withdraw (the
  step-back released the claim, so the credit returns). Ask B: create → withdraw before pickup (returns, D-034).
  Ask C: create → claim → decline → withdraw (the latest pickup is the claim, so the credit stays spent: D-147,
  D-021). The ledger asserts all three and the wallet ends one credit lower. The step-back route needs
  `REFERRED_DEADLINE_ENABLED`, which is `true` on `main`.
- **Job link.** `https://wellfound.com/jobs/3971835-account-executive` is a reviewed listing in
  `shared/referralUrl.ts`; the preview resolves it to `chatfin.ai` without fetching a page.
- Tests: `scripts/liveQaJourneys.test.ts` 19/19 (red first: the module did not exist, so the suite failed to
  resolve `./live-qa-journeys.mjs`); the existing `liveQaSignedIn` 21/21 and `liveQaWorkflows` 6/6 still pass;
  `tsc --noEmit` exits 0.
- Not yet run: the dispatched `journeys` run on skipwait.me (acceptance). It needs the two repository secrets and
  the review/landing stage; this build does not claim it.
