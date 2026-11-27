# OPS-live-qa-journeys: signed-in live QA proves the money, privacy and transition rows with the two demo accounts (D-389)

Tier 1 · lane `live-qa-journeys` · implementation PR [#1697](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1697) · acceptance branch `agent/queue/ops-live-qa-journeys-proof-6155` · epic D-212 · depends on `OPS-live-qa-hardening`, `QA-sandbox-requests`, `P0-sandbox-isolation`

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
6. Cross-role denial: the demo seeker's referrer preview/detail reads answer 403 `work_email_code_required`;
   the demo referrer's withdrawal of the seeker's request answers 404. Referrer document reads answer 404
   before acceptance and after step-back (ids from the demo accounts only). These are the existing middleware
   and privacy contracts, not a weaker privacy requirement or a new policy.
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
   keyed rows: `<requestId>#1` for the one cycle debit and `<requestId>#refund#1` for its withdrawal refund.
   D-393's sandbox raises its free balance to three before each covered send without writing a grant row;
   an aggregate before/after delta cannot prove these transitions. Never spend a purchased referral, buy
   allowance or alter real-account rules to make the run pass.
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

- OPS-live-qa-journeys: make green — Claude Code · 3770 — 2026-11-27 — takeover of #1697 (red on test-integrity rule 4: the rewrite removed 86 assertion lines and added 85). Restored the three workflow pins and the mode parser verbatim, and re-added the run-level safety stops on the sandbox harness (missing secret, non-dispatch trigger, non-demo identity, no free referral: each before any POST); 89→116 assertion lines, 223 live-QA tests pass, two guard mutations go red. Unverified: the dispatched journeys run.
- OPS-live-qa-journeys: in progress — GPT-6.1 Sol · 6155 — 2026-11-28 — [#1697](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1697) repairs sandbox routing, keyed proof, cleanup and captures; four focused suites passed 215/215, Chromium adapter smoke and queue/scope checks passed; local typecheck timed out without diagnostics, required CI and dispatched live acceptance remain **UNVERIFIED**.

The implementation PR moves this existing `todo` row to the fresh acceptance branch above (D-373 (6)). Its merge is not launch acceptance: after the repaired runner reaches main, the same packet still requires one successful manual `mode=journeys` run, exact tested web/API SHAs, sanitized transition/ledger/cleanup results and inspected 1280/390 captures. `LAUNCH-live-qa` and PR #1540 continue to wait for that evidence (D-390). No production setting or product money/login rule changes.

### Current takeover and integration read receipt (November 26, 2026; GPT-6.1 Sol · 42fc)

- Official takeover HEAD is `ec3014d306812248a4803eeb3a24fd74790abe80`. Fetched `origin/main` is `d9c69998fed07f1fa619726ba545c2b2e337ba17`; `git merge --no-commit origin/main` produced one conflict, this row's decision stamp in `docs/plans/assignments.json`, resolved to D-407. The primary committed and pushed the integration as `bc4a61afd`. No source conflict occurred.
- This bounded integration worker read `docs/BRIEF.md`, `AGENTS.md` and the current bounded assignment, `docs/PRD.md`, `COLLABORATION.md`, `docs/BUILD_CONTINUITY.md`, this packet, its assignment row and the owning assignment validator. It checked D-389/D-390/D-393, the recent D-401–D-406 entries and the fetched instruction delta adding D-407. D-370 still requires green required CI without an independent-review gate. D-406 leaves the existing reviewer-password proof unchanged.
- Published PR #1558 (`f25eb09c7`) and PR #1672's helper-only state (`10ce5b5d3`) are preserved. The helper adds keyed-ledger and wallet contracts and fixtures; it does not establish repaired sandbox routing or a successful live journey. The goal remains L4 demo-only proof of privacy, transitions and keyed ledger behavior without public QA posts.
- D-407 clears the earlier unpublished-checkout block. No preservation, publication or acknowledgment from another checkout is a prerequisite for continuing from origin. The two named safety regressions and the remaining runner repair are unfinished work; prior-session test and live reports below are historical, not this worker's results.
- The existing row is stamped `syncedTo: "D-407"` while retaining the fresh acceptance carrier, `todo` status, helper/test/browser/harness scope, FIFO position and dependencies including `P0-sandbox-isolation`. `LAUNCH-live-qa` and PR #1540 still wait for the qualifying dispatched journey evidence (D-390).
- Local fixture proof: `LANG=en_US.UTF-8 pnpm vitest run scripts/liveQaJourneys.test.ts scripts/liveQaJourneyContracts.test.ts --maxWorkers=1` passed **132/132** before the two safety regressions (19 journey + 113 contract tests). After adding them, the same command exited 1: **132 passed / 2 failed**. The opportunity-call filter received three calls (`GET /api/opportunities/mine`, `POST /api/opportunities`, `POST /api/opportunities/77/close`) instead of none. On the preview-privacy leak, request `9001` was created but the withdrawn set was empty; the no-claim assertion passed.
- Contract checkpoint: `LANG=en_US.UTF-8 pnpm exec vitest run scripts/liveQaJourneyContracts.test.ts --maxWorkers=1` exited 0 with **123/123 passed** (the previous 113 retained plus 10 new tests), independently rerun for this receipt after the primary inspected the contract worker's exact diff. Strict directory, upload, create, claim and transition projections are produced in the contract helper; runner integration remains pending.
- This receipt update edits only this packet. No credentials, provider calls, live dispatch or other checkouts are used. Runner repair, required CI, protected landing, exact-release checks and one successful manual `mode=journeys` run with sanitized results, cleanup and inspected 1280/390 captures remain pending. Fixture results establish neither completed implementation nor live acceptance; both remain **UNVERIFIED**.

### Historical takeover status (November 26, 2026; GPT-6.1 Sol · f8bf; unpublished-work blocker superseded by D-407)

- OPS-live-qa-journeys: in progress — GPT-6.1 Sol · f8bf — 2026-11-26 — official takeover `f6c247b62ae559aa22981ef4617605740fb8433a` on `agent/queue/ops-live-qa-journeys-sandbox` (previous holder GPT-6.1 Sol · 65e9; prior receipts retained below). **Safe preservation/publication and an acknowledged handoff of unpublished work are required before source integration.** Implementation and dispatched live acceptance remain **UNVERIFIED**. Preserve `agent/queue/ops-live-qa-journeys-acceptance-2431` as the future acceptance carrier until the script repair merges; the task remains `todo` under D-373 (6), so the implementation merge cannot prematurely release `LAUNCH-live-qa`. No claim on the acceptance branch is asserted.

### Historical takeover receipt (November 26, 2026; GPT-6.1 Sol · f8bf; superseded by D-407)

This historical receipt records f8bf's checks and the handoff it required before source integration; D-407 supersedes that unpublished-work prerequisite. Every earlier receipt is retained below as historical evidence attributed to its session.

- Task HEAD and the origin task branch are `f6c247b62ae559aa22981ef4617605740fb8433a`; latest fetched `origin/main` is `c6c63a6274ee4f6b43195320e1d9961340c2d110`. The takeover worktree was clean before this packet-only update. This receipt does not claim that latest main has been integrated.
- Current holder's read receipt: `docs/BRIEF.md`, `AGENTS.md` and current owner instructions, `docs/PRD.md`, available decisions D-370–D-406 (no numbered D-397 or D-404 entry), `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, `docs/BUGFREE_GATE.md`, `docs/KIT_V4_BUILD_PLAN.md` §§3–6, `docs/PAYMENTS_TEST_RUNBOOK.md`, `docs/agents/TURN-CAPPED-CLIENTS.md`, this packet, the owning workflow and prior repository outcomes. D-389/D-390/D-393 govern the remaining demo-only sandbox proof; D-406 leaves the reviewer-password proof unchanged.
- Published PR #1558 (`f25eb09c7`) and implementation helper `10ce5b5d3` are retained. The goal remains L4 demo-only proof of privacy, transitions and keyed ledger behavior without public QA posts.
- Own fixture baseline, run exactly once at `f6c247b62`: `LANG=en_US.UTF-8 pnpm vitest run scripts/liveQaJourneys.test.ts scripts/liveQaJourneyContracts.test.ts --maxWorkers=1` — exit 0, **132 passed / 0 failed** (19 journey tests and 113 contract tests). The expected two failures were **not reproduced**. The published full-journey test expects public opportunity creation and closure; the preview-privacy failure test asserts no claim but does not assert withdrawal cleanup. This green baseline establishes neither sandbox routing nor acceptance, and makes no claim about when either defect arose.
- The earlier source repair and reported **193 focused tests** remain prior-session-reported, unpublished work. They have not been transferred or validated in this takeover and are not this session's evidence. The historical 19-pass/2-failure receipt below is also not the reproduced baseline at this HEAD.
- A separate writer's checkout contains unpublished work overlapping the runner, contract helpers, tests, browser adapter, fixture harness, packet and registry. No acknowledged safe handoff or publication is available. Before source integration, request bounded preservation/publication of that work and an explicit handoff through a draft coordination PR. The next action is that draft coordination PR only; this session will not make the legacy runner landable or dispatch it.
- The task stays `todo`; `agent/queue/ops-live-qa-journeys-acceptance-2431` remains the future acceptance carrier. `LAUNCH-live-qa` keeps this dependency and PR #1540 stays unlanded until the qualifying dispatched evidence exists (D-390). Script repair, required CI, protected landing, exact-release verification and successful manual sandbox journeys with sanitized results, cleanup and inspected 1280/390 captures remain pending.
- This update changes only this packet. No production, provider, authentication or sales setting, product behavior, source, test or registry is changed. No CI, release, live-journeys or completed-implementation result is claimed; implementation and live acceptance remain **UNVERIFIED**.

### Previous execution receipt (November 26, 2026; GPT-6.1 Sol · f5ee)

- OPS-live-qa-journeys: in progress — GPT-6.1 Sol · f5ee — 2026-11-26 — official takeover `71ef198b3` on `agent/queue/ops-live-qa-journeys-sandbox` (previous holder GPT-6.1 Sol · 930b; prior receipts retained below). Implementation and dispatched live acceptance remain **UNVERIFIED**. Preserve `agent/queue/ops-live-qa-journeys-acceptance-2431` as the future acceptance carrier until the script repair merges; the task remains `todo` under D-373 (6), so the implementation merge cannot prematurely release `LAUNCH-live-qa`. No claim on the acceptance branch is asserted.

These results record the parent session GPT-6.1 Sol · f5ee's checks; this bounded worker updates only this packet and its existing registry row.

- Fetched main `495d340351076f9ae4818b1948256473ad186144`, integrated and pushed as `78192f8a90f9f0e73f2c6b198a92c1f8d118242d`. Read `docs/BRIEF.md`, `AGENTS.md`, `docs/PRD.md`, `COLLABORATION.md`, `docs/BUILD_CONTINUITY.md`, `docs/BUGFREE_GATE.md`, `docs/KIT_V4_BUILD_PLAN.md` §§3–6, `docs/plans/README.md`, `docs/DELEGATION.md`, `docs/PAYMENTS_TEST_RUNBOOK.md`, `docs/agents/TURN-CAPPED-CLIENTS.md` and `.zcode/agents/worker.md`; checked available decisions D-370–D-406, including D-389/D-390/D-393.
- Prior PR #1558 (`f25eb09c7`) and implementation helper `10ce5b5d3` are preserved. The remaining goal is L4 demo-only proof of privacy, transitions and keyed ledger behavior without public QA posts; the script repair is pending.
- Real regression run on November 26 at `78192f8a9`: `LANG=en_US.UTF-8 pnpm vitest run scripts/liveQaJourneys.test.ts` — **19 passed / 2 failed**. The failures reproduce the public opportunity GET/create/close path and missing withdrawal after a preview-privacy failure. The test log remains local at `/tmp/live-qa-journeys-regressions-78192f8a9-20261126.log`; raw agent logs are not published. This failing run is the current repair baseline; the older fixture results below do not establish acceptance.
- Source-contract verification: deployed API `21d6a368d176bb4557a839465b021291c523df04` contains sandbox `eec0fddfd` and P0 isolation `755bc1d99`; the relevant server/shared source has no diff versus main `495d34035`. This source check does not prove a live journey.
- On November 26 the parent's live `GET /api/companies/wipro` returned the expected Wipro slug/name and `domains: ["wipro.com"]`. The parent also browser-verified Wipro's official search and the individual [Software Engineer posting](https://careers.wipro.com/job/Software-Engineer/213488-en_US) on **2026-11-26**: Singapore, posting start date displayed as `11/3/26`, with a job description and an application action. This is the real URL intended to replace the synthetic `product-designer-123` routing fixture recorded below; that replacement is in progress, not shipped.
- D-406 leaves this task's reviewer-password proof unchanged: use only the existing protected workflow secrets, with no authentication or sales-switch change. The existing row advances to `syncedTo: "D-406"` without changing its scope, position, dependencies, `todo` status or future acceptance carrier.
- No live journeys were dispatched by this session. Implementation and live acceptance remain **UNVERIFIED** pending script repair, protected landing, exact-release checks and a successful manual `mode=journeys` run with sanitized ledger/privacy/transition results, cleanup and inspected 1280/390 captures. `LAUNCH-live-qa` and PR #1540 still wait for that evidence (D-390).

### Previous takeover receipt (November 25, 2026)

- OPS-live-qa-journeys: in progress — GPT-6.1 Sol · 930b — 2026-11-25 — official takeover `f5dce085c51389ac57472361d083c23abb3a76eb` on `agent/queue/ops-live-qa-journeys-sandbox` (previous holder GPT-6.1 Sol · 2431; prior receipt retained below). Implementation and dispatched live acceptance remain **UNVERIFIED**. Preserve `agent/queue/ops-live-qa-journeys-acceptance-2431` as the future acceptance carrier until implementation merges; the task remains `todo` under D-373 (6), so the implementation merge cannot prematurely release `LAUNCH-live-qa`.

### Previous execution receipt (November 25, 2026)

- Read main `f7020bb3789e562f3e7b970da6d45469fc9fbc18`; official takeover `7cd23a49d`, integrated and pushed as `37cb59172`. Checked `BRIEF`, `AGENTS`, decisions through D-405 (including D-389/D-390/D-393 and D-398–D-403), `BUILD_CONTINUITY`, `COLLABORATION`, build plan §§3–6, `BUGFREE_GATE`, `DELEGATION` and `PAYMENTS_TEST_RUNBOOK`.
- Prior PR #1558 (`f25eb09c7`) is preserved. The outstanding goal is reliable demo-only proof of seeker/referrer privacy and transitions, supporting L4 without public QA posts. Initial regressions: `liveQaJourneys.test.ts`, 19 passed / 2 failed, proving public opportunity calls and missing withdrawal after a preview-privacy failure.
- The target directory read returned Wipro with `domains: ["wipro.com"]` on November 25. The URL `https://careers.wipro.com/job/product-designer-123` is a repository routing fixture (`server/planGateRoutes.test.ts:40`), not evidence of a current vacancy; the runner validates the directory entry before creating anything.
- Contract checks follow current endpoints: claim stays pending with locked files; approval opens access; accepted step-back revokes access and ends the latest pickup. Decline returns `passed` and keeps the debit spent. Cleanup releases a pending claim through decline before withdrawal; step-back alone does not release it.
- Targets: `scripts/live-qa-journeys.mjs`, `scripts/liveQaJourneys.test.ts`, `scripts/liveQaJourneyContracts.mjs`, `scripts/liveQaJourneyContracts.test.ts`, `scripts/liveQaJourneyBrowser.mjs`, `scripts/liveQaJourneyHarness.ts`, this packet and its existing registry row. No dependency, environment, schema, production setting, price or login-rule change. Live acceptance requires a successful manual journeys run, its release SHAs, sanitized results, cleanup and inspected captures at 1280/390.

### Previous read receipt (November 25, 2026)

- Read current main `8951b1518faa6089a86c29a2eaae78bb93d47951`; `.zcode/agents/worker.md`, `docs/BRIEF.md`, `AGENTS.md`, `docs/PRD.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, `docs/KIT_V4_BUILD_PLAN.md` §§3–6, `docs/BUGFREE_GATE.md`, and available decision entries D-388–D-396, D-398–D-403 and D-405 (D-397 and D-404 are absent).
- Inspected prior implementation helper `10ce5b5d3` and prior PR #1558 (`f25eb09c7`); PR #1558's public walk-in routing predates D-393. The goal remains L4 demo-only launch proof. The implementation targets listed in the previous receipt remain unchanged; this handoff edits only this packet.
- Fixture baseline `LANG=en_US.UTF-8 pnpm vitest run scripts/liveQaJourneys.test.ts scripts/liveQaJourneyContracts.test.ts scripts/liveQaSignedIn.test.ts scripts/liveQaWorkflows.test.ts`: 4 files and 159 tests passed in 5.49s. No live network or browser was used; live acceptance remains **UNVERIFIED**.

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
