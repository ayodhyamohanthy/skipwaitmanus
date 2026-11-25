# OPS-live-qa-journeys: signed-in live QA proves the money, privacy and transition rows with the two demo accounts (D-389)

Tier 1 · lane `live-qa-journeys` · branch `agent/queue/ops-live-qa-journeys-sandbox` · epic D-212 · depends on `OPS-live-qa-hardening`, `QA-sandbox-requests` (D-393)

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
3. Send one referral request from the demo seeker using the free allowance. Since D-393 it is a sandbox
   request (`QA-sandbox-requests`): any company, reaching only the demo referrer, never a real employee.
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

## Remaining work after PR #1558 (November 25, D-373 (6))

[PR #1558](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1558) merged as
`f25eb09c7cc66a9dec83bae6c0b1d614f77d2173`, but its own description and the conflict record below say its
public walk-in routing predates D-393 and the dispatched acceptance has not run. On checked main `5a076a29a`,
`runJourneys` still reads `/api/opportunities/mine`, publishes a walk-in with `POST /api/opportunities`, and
routes creations by `opportunityId` (`scripts/live-qa-journeys.mjs:188-209`). That is not sandbox-only QA.
Do not dispatch that version as proof of this packet.

The merged work is retained. D-373 (6) restores this existing row to the fresh branch above, with the same
tier, lane, dependencies, scope and FIFO position, so the picker no longer mistakes the implementation merge
for completed acceptance. The normally claimed builder finishes these existing D-389/D-393 requirements:

1. Route the demo seeker's requests through the deployed sandbox using a validated directory company and job
   link. Remove the public opportunity lookup, publish and close paths. Keep the identity checks before every
   mutation, and add a fixture assertion that no `/api/opportunities` write is possible.
2. Read the actual request, claim, accept, decline, withdrawal, document and ledger contracts before adapting
   the steps. Preserve the privacy and cross-user denials. Check each response status before taking its ids;
   do not infer success from an HTTP 200 alone or replace runtime responses with fixture values.
3. Assert first-visibility spend, pre-pickup return and the retained charge on an employee decline through the
   keyed rows. D-393's unlimited sandbox may top up its free allowance, so explain any such grant from the
   ledger instead of assuming the aggregate wallet must decrease by exactly one. Never spend a purchased
   referral, buy allowance or alter real-account rules to make the run pass.
4. Withdraw or close only the requests the run created, including on a failed intermediate step; report any
   cleanup failure. Preserve the manual-only trigger, shared concurrency group, redaction and two demo accounts.
5. After protected landing and exact-release checks, dispatch `live-qa.yml` with `mode=journeys`. Record the
   successful run, tested web/API SHAs, sanitized step/ledger results, cleanup and inspected 1280/390 captures
   here. A navigation-only run or green fixture suite leaves this acceptance **UNVERIFIED**. If a live step
   fails, report it and preserve the evidence before considering another attempt.

`LAUNCH-live-qa` keeps this row as its dependency. Its PR #1540 stays unlanded until the qualifying run is
recorded, as D-390 already requires. This reconciliation authorizes no production setting, new account,
payment, public post, price or login change.

## Status

- OPS-live-qa-journeys: in progress — Claude Code · 43c8 — 2026-11-25 — branch agent/queue/ops-live-qa-journeys-sandbox

### Historical build notes (DeepSeek V4.1 Flash · e9e1, 2026-11-24; routing superseded by D-393)

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

### D-393 conflict (DeepSeek V4.1 Flash · e9e1, 2026-11-24)

The picker handed this row from `main` `3b483adfe`, before D-393. The merged `main` `8053818db` changes step 3:
"Since D-393 it is a sandbox request (`QA-sandbox-requests`): any company, reaching only the demo referrer, never
a real employee", and adds `QA-sandbox-requests` to this row's dependencies. `QA-sandbox-requests` is `todo`, so
the sandbox route does not exist yet.

The branch implements the pre-D-393 route (the demo referrer's own walk-in post at `reviewer.skipwait.me`), which
is safe today but is not what the current packet says. Sending to a real company's job link before the sandbox
lands would notify that company's real employees, which D-393 forbids, so this branch must not land as-is. The
rest of the journey (identity, wallet, privacy, claim/accept, cross-user denial, the three money paths, the job
link, cleanup) is built and tested; only step 3's routing changes once `QA-sandbox-requests` lands. Reported
`blocked` on that conflict; the row stays `todo`.
