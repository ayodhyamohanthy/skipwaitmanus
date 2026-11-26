# Packet LAUNCH-oct25: the launch batch (truthful legal text, live signed-in QA, marker branches out of CI)

> Read `docs/BRIEF.md` first, then this packet. Each section below is one queue row; build only the row the picker hands you.

| Field | Value |
|---|---|
| Queue rows | `LAUNCH-legal-copy`, `LAUNCH-live-qa`, `LAUNCH-marker-ci-skip` in `docs/plans/assignments.json` (status lives there) |
| Decisions | D-200 (speed first), D-173 (the unit is "referral"), D-147 (any decline keeps the referral spent), D-034/D-061 (withdraw before pickup returns it), AGENTS.md rule 8 (proof before "done"), the lasting D-001 rule (Terms/Privacy keep live legal text; legal wording is the owner's) |
| Verified against | `main` `badad4d6` on 2026-10-25 |
| Source | The Oct 25 launch audit (Claude Code session): eight read-only investigators, a strategist and a critic, checked against the live site |

## Why these three
The launch audit found the product deployed and current, with packs on sale. The audit's other launch blockers are owner work: referrer supply (2 of 39 companies covered) and a live paid round trip. This batch covers the blockers an agent can remove:
1. **Public legal text says things that are no longer true** while referral packs are sold for money.
2. **No signed-in check of the current release.** The last one ran Oct 14-16, before `/ask`, `/explore`, `/queue`, `/requests` and `/conversation` were rebuilt in place, so rule 8 leaves the launch unverified.
3. **Marker branches flood CI.** About 40 of the newest 100 CI runs are marker-branch PRs (`agent/reports/log` #455 and the review, heartbeat and landing locks), which are never merged. The picker reads CI from the newest 100 runs only, so real pull requests show "unknown".

Two rows already on `main` complete the batch and are moved to the top of the queue with it:
- `SEC-deps-oct24`: 1 critical and 4 high production advisories. Dependabot's own security-update run failed with `security_update_not_possible` because of the version overrides.
- `D-174-sample-job-removal`: the live `/api/jobs` serves an acme.com "Test role for loop verification". It is removed by a guarded data migration that owns only new files.

## Owner confirmations recorded here (2026-10-25)
- ZeptoMail delivers work-email codes to corporate inboxes (owner, in a Claude Code session). The referrer sign-in path needs no email work before outreach.

## Row LAUNCH-legal-copy (Tier 2; market-standard wording pre-approved by D-345)
**Goal.** Make three public statements true. **D-345 (owner, Nov 16):** the owner approved market-standard wording in advance, within D-345 (1)'s limits, so no approval comment is needed. The row lands on green required CI with 1280/390 captures. Anything outside those limits (a price, a new refund right, a new data use) still goes to the owner.

**October 25 audit baseline (historical; superseded by the November 16 redraft below):**
1. `client/src/pages/Terms.tsx:23` (summary bullet): "Referrals are always free. Plans and credit packs buy preparation tools and monthly allowances — never priority or outcomes." Asks cost referrals (D-173), and packs are sold for money. Section 03 of the same page is already correct.
2. `client/src/pages/CancellationPolicy.tsx:25`: "The reserved credit is returned to your balance immediately. No money is charged for a request, so there is nothing to refund."
   - A withdraw before pickup returns the referral once.
   - Free monthly referrals from a month that has ended do not come back. The reversal row records 0 for an ended cycle (AGENTS.md, living map, kit credit ledger).
   - Paid referrals are bought with money, so "no money is charged" needs care.
3. `client/src/pages/TrustPrivacy.tsx:58` names only Chargebee, Razorpay and PayPal. WorkOS (sign-in), ZeptoMail (email codes), Sentry (error reports; its DSN is in the live bundle) and Cloudflare (hosting) also process personal data.

**October 25 proposal (historical; superseded by D-345 and the November 16 runtime audit):**
1. Terms bullet: "Each ask uses one referral from your balance, taken only when a verified employee can see it. Free accounts get 3 referrals a month; referral packs add more. Plans and packs never buy priority or outcomes."
2. Cancellation bullet: "The referral comes back to your balance at once, except a free monthly referral from a month that has already ended. After a verified employee claims or declines the request, the referral stays used."
3. Privacy: one sentence that names WorkOS (sign-in), ZeptoMail (email), Sentry (error reports), Cloudflare (hosting) and Chargebee with Razorpay and PayPal (payments), and what each receives.

**Current redraft, November 16 (D-345).** State paused legacy-pack and new-plan sales; 3 referral requests per calendar month, no carry-forward and card verification when required; no return after a claimed request is declined, even if withdrawn after reopening; conditional pre-pickup returns; resume access only on acceptance. Name existing processors, including Microsoft Clarity's interaction/replay and storage-choice behavior. State the Indian sole proprietorship and no GST registration or GST charge. Retain existing purchase refund rights and add only the permitted standard clauses. This supports trust across L1-L4 without a new service behavior, funnel event or data use.

**Files:**
- In scope: `client/src/pages/Terms.tsx`, `client/src/pages/CancellationPolicy.tsx`, `client/src/pages/TrustPrivacy.tsx`, `client/src/pages/policyPages.test.tsx`, `client/src/pages/trustPrivacy.test.tsx`.
- Out of scope: `shared/moneyCopy.ts`, owned by `D-132-audit`. The "credits" to "referrals" wording elsewhere is a follow-up after that audit lands.

**Tests first:**
- `policyPages.test.tsx` asserts the Terms page no longer contains "Referrals are always free", and that the cancellation bullet names the ended-month exception.
- `trustPrivacy.test.tsx` asserts each processor name appears.
- Each is red on today's code.

**Done:** wording within D-345 (1), green required CI, the gate (`pnpm check`, the two test files, `pnpm build`), 1280 and 390 captures of the three pages, and the row set to `done`. No per-PR owner approval comment is required.

**Stop and ask if** the owner changes the money meaning of a sentence (for example, refunds on a decline). That is D-147's territory: report it `blocked` with the question.

## Row LAUNCH-live-qa (Tier 2; needs a session with a headed browser)
**Goal.** Rule-8 proof that the current release works signed in, with no money moving. Any capable session with a supported browser may run the approved demo-account checks (D-346, D-348, D-366); a model label is not browser or account-access evidence.

**Current prerequisite (D-059, D-366, D-369 and D-370, November 20).** [Reset run 44696345516](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44696345516) failed with Cloudflare 10215. [A later reset](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44709862016) succeeded, and the canonical readiness response at `73be7b313` matches the release in the [reported demo sign-in results](https://github.com/ayodhyamohanthy/skipwaitmanus/commit/cd01bb1af). The deploying run is [44757175398](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44757175398). These are separate observations. The later OPS source merge [#1382](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1382) at `38b9a44e6` passed [pipeline validation](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44758926866) with the rollout and readiness steps skipped. The release-time reset still needs separate live verification. `LAUNCH-live-qa` stays `todo` with its existing dependency. Continue with the approved demo sessions already available. A fresh reset needs the protected path in `OPS-reviewer-credential-transport` and exact release verification.

**Steps (D-346, D-353, D-366 and D-369 replace the October access/checkout instructions):**
1. Use the existing approved reviewer sign-in with the demo seeker and referrer accounts. Keep plaintext only in the authorized session's private storage (D-366). Keep passwords, hashes, session cookies and raw authenticated responses out of public evidence. Use only the demo accounts allowed by D-214 and D-346. Referrer-facing product sign-in stays work-email OTP only.
2. Seeker:
    - sign in and record the actual demo-account state, without inventing an allowance or treating historical fixtures as fresh data;
    - inspect the current plans and paused-sale presentation; do not open archived legacy-pack checkout or activate banded sales (D-219, D-366, D-367);
    - inspect referral request, withdrawal and cross-user denial screens within the demo-account/no-money scope; state-changing requests remain unexecuted unless their exact no-wallet-risk scope is established;
    - record any unexecuted transition as a gap, never as a pass. In particular, no checkout POST is authorized by this packet merely because sales are paused.
3. Referrer:
    - inspect the demo queue and request states; execute claim/accept only within the established demo/no-money scope, and otherwise record the missing transition proof.
4. Exercise current job-link previews without sending real referral requests, paid email or notifications. Use current source-backed links, not the October list as evidence of current coverage.
5. Capture the tested screens at 1280 and 390. Update `docs/BUGFREE_GATE.md` sections 1-4 with the exact web/API release identity, date and sanitized evidence. No fresh signed-in pass is claimed before this run. Retain dated prior evidence as history, not current truth. Include one full e2e journeys run on the release candidate (D-353 (4)).

**Files:**
- In scope: `docs/BUGFREE_GATE.md` and `docs/qa/` (new evidence files only).
- Out of scope: any code. File each defect found as its own row through a docs-only pull request (D-200 (2)).

**Recoverability-only exception, October 31, 2026.** The additive `docs/qa/launch-live-qa-harness/` folder may persist the reviewed non-secret rebuilt anonymous `/plans` scripts, dependency lock, README and hash manifest, with a separate recovery guide. This exception permits local reconstruction, dependency installation with scripts disabled, hash and syntax checks only. It grants no new production probe, sign-in, OTP, account, checkout, payment, settings or data action. Do not run the scripts merely because they are now persisted: they make live website requests and need an applicable current test scope. No application code, existing evidence or row ownership/status changes. `LAUNCH-live-qa` stays `owner`, #710 stays draft, and D-216 / #709 and every missing signed-in, crawl, API and E2E leg remain open. This is a rebuilt subset, not an identical restoration or QA pass.

The October 31 recoverability exception still governs what the repository may retain. D-346 and D-366 govern use of the approved demo accounts. The current prerequisite above governs fresh resets. Keep #710 draft until the current acceptance evidence is attached.

**Never:**
- pay, or pass the hosted payment form (D-065);
- request a code for an inbox you cannot read.

## Row LAUNCH-marker-ci-skip (Tier 2)
**Goal.** CI runs only for pull requests that can merge.

**Current behaviour (verified):**
- `.github/workflows/ci.yml` runs on every `pull_request`.
- The open PRs from `agent/reports/log` (#455), `agent/queue/landing` (#625) and `agent/review/*` (#545, #546, #555, #556, #558) re-run the full suite on every marker push.
- The picker reads the newest 100 workflow runs (`scripts/next-task.mjs`, CI lookup).

**Target:**
1. Each job in `ci.yml` gets a job-level condition that skips it when `github.head_ref` starts with `agent/reports/`, `agent/review/`, `agent/heartbeat/` or `agent/architect/`, or equals `agent/queue/landing`. A skipped job reports as skipped, so nothing waits on it, and those branches never merge.
2. Never skip on `push` to `main`, and never skip for task branches (`agent/queue/<task>`, `agent/<model>/<task>`).
3. No other workflow changes.

**Tests first:** add a test beside `scripts/check-deploy-triggers.mjs` (or a new `scripts/ciMarkerSkip.test.ts`) that reads `ci.yml`. It asserts that each of the three required jobs (`typecheck`, `unit + component + route tests`, `production build`) carries the skip condition for exactly those prefixes, and that no condition mentions `main` or `push`. It is red on today's file.

**Files:**
- In scope: `.github/workflows/ci.yml` and the new test file.
- Out of scope: deleting any marker branch (the picker reads them), and closing the marker PRs. Closing is the owner's call, and merging one would delete its branch because "Automatically delete head branches" is on.

## Not in this batch (and why)
- **Pack-return recovery on `/plans`.** The pack path already recovers on `/premium` (`client/src/components/plans/PendingCheckoutReturn.tsx:1-5`), and the hourly `chargebee-pending-reconcile` job is a backup. Revisit only if the owner's live round trip shows a stuck pack.
- **The "credits" to "referrals" copy in `shared/moneyCopy.ts`.** That file is owned by `D-132-audit`, which edits it (#547). This follows the audit.
- **Owner decisions this packet does not make:**
  - an invite-only soft launch (D-102);
  - "launch on Free + packs; plans, passes, passwords and Skippy after";
  - switching off the reviewer password login after the Razorpay review.

## Status

- **2026-11-26, LAUNCH-live-qa refresh — GPT-6.1 Sol · b810.** Official takeover `356793881e33d73e73492fbd0deae650707106d3`; `origin/main` `eac7b8e4c544aef10ef7857a3369dea1e7cac50d` integrated conflict-free; this branch's changes versus main are documentation-only. Parent preflight checked `docs/BRIEF.md`, `docs/PRD.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, `docs/DECISIONS.md` through D-409, this packet, `docs/BUGFREE_GATE.md`, the QA evidence and current assignments. Earlier `c0f2` and `32d8` handoffs remain below. The assignment remains `todo`, `syncedTo: D-390`, with the same three dependencies: `OPS-deploy-secrets-file`, `OPS-live-qa-runner` and `OPS-live-qa-journeys`. The journey dependency now has a fresh carrier on `agent/queue/ops-live-qa-journeys-acceptance-2431` under PR #1672/main integration, but no successful dispatched journey proof is attached here. PR #1540 remains draft with auto-merge off; fresh required CI is pending. No fresh live QA or production test was performed. D-390 acceptance remains **UNVERIFIED** pending the qualifying sandbox journey. This refresh changes no status, dependency, ownership, block or authority.

- **2026-11-26, LAUNCH-live-qa quiet-draft refresh — GPT-6.1 Sol · c0f2.** Official takeover `3abf51a86591e1b1374a2b0a0b076883f3644dca`; current main `d9c69998fed07f1fa619726ba545c2b2e337ba17`. Read `docs/BRIEF.md`, `docs/PRD.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, this packet, `docs/BUGFREE_GATE.md`, `docs/qa/launch-live-qa-2026-11-24.md` and current `docs/plans/assignments.json`, with `docs/DECISIONS.md` through D-407 (D-390, D-393 and D-407 (4) govern this step). Inspected prior integration `e12318300596bddeab9ba6f6fcca0907c2b4b2b4` of main `5a076a29a`, PR #1540 and its acceptance-gap comments `7153477140`/`7154297315`. Refreshing the quiet built-ahead draft against current main under D-407 (4), preserving both sides of the packet conflict and the historical run `45372954261` (38/38 navigation captures at 1280/390). No new live QA was run and no current-release pass is claimed. PR #1540 is draft with auto-merge off; the launch row remains `todo`, with `OPS-live-qa-journeys` unfinished. D-407 clears environmental/unpublished-work blocks, not acceptance: the qualifying sandbox `workflow_dispatch` run, exact web/API identities, wallet/ledger before and after, document isolation/cross-user denial, safe transitions, job-link previews, cleanup and 1280/390 proof remain **UNVERIFIED**. No block, owner call or flag is changed by this refresh; it does not complete or authorize landing this row.

- **2026-11-20, LAUNCH-live-qa prerequisite handoff — GPT-6.1 Sol · 67c6.** Official unblock `6d6f9138c`. Checked main `aec141720`, D-059/D-200/D-346/D-366/D-369/D-370, #1381, #1382, and #710. Reset 44709862016 succeeded on the earlier path. The canonical API reported ready on `73be7b313`, the release cited by the demo sign-in report. The report also records a browser-console error. Signed-in capture evidence, unresolved findings and final acceptance remain with #710. The newer OPS run 44758926866 validated pipeline changes and skipped the rollout. `OPS-reviewer-credential-transport` tracks the protected route for future resets. This handoff used only read-only production checks and synthetic deployment tests.

- **2026-11-20, LAUNCH-live-qa prerequisite re-sync — GPT-6.1 Sol · 93b6.** Official unblock lock `544fd706c`; main `ded4c9bb8`, D-346/D-353/D-366/D-369 and current packet/registry checked. Prior #710 remains draft at `5e6c2783a`, not a signed-in QA pass. Reset run `44696345516` is independently read back as failed on `f302a49f4`. D-369 already decides the recovery route, so no new owner ruling or reset retry is needed. Packet and registry now require the accepted `OPS-deploy-secrets-file` output and retain all missing live QA evidence. No browser, sign-in, OTP, account, checkout, secret, settings or production action was attempted by this handoff.
  - Focused validation: `parseDecisionRegister` and `validateAssignments` return no errors; structured comparison confirms every other task and this row's status/owns are unchanged. The decision register matches current main byte-for-byte. `git diff --check origin/main` passes on the two changed docs. This proves routing consistency only; live QA remains unverified.

- **2026-11-16, LAUNCH-legal-copy acceptance complete; protected landing and live proof pending — GPT-6.1 Sol · 8b28, PR #659.** Source `9757140d`, integrated head `341db243`, current main `7fbbbc7b`; D-345 through D-350 checked with BRIEF, PRD, AGENTS, BUILD_CONTINUITY and COLLABORATION. [Required CI](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/43865029479) passed typecheck, production build, end-to-end journeys and the full suite: 715 files / 7,294 tests passed, 18 tests skipped by the existing suite. Local compiler passed. The local full suite was stopped incomplete after failures in the picker re-record-pass and referral-conversation private-decline cases; both cases then passed unchanged in isolation on baseline main and on `341db243` (2/2 each). This does not claim a green local full suite or an established pre-existing defect. Focused policies remain 18/18 and six inspected 1280/390 browser cases passed. The row is set done in this landing PR; it is not reported shipped until required checks on the final status commit, protected merge and canonical production proof complete.
- **2026-11-16, LAUNCH-legal-copy redraft verified locally — GPT-6.1 Sol · 8b28, PR #659.** Official picker assigned LAND; task takeover `2099102b` is on origin. Main `becc0abe` merged as `a5c8bea3`; newer main `dcb6d7ae` and D-347/D-348 read before final integration (landing slot retired, required CI retained). D-345 supersedes the October owner-comment hold. Corrected claimed-then-declined withdrawal, acceptance-only resume access, paused sales, conditional allowance eligibility, existing processor disclosures including Microsoft Clarity, no-GST business statement and standard clauses; existing refund rights retained. No service, payment, schema, dependency or flag change. Card verification is not enforced by `openCycleTx` yet, so it is conditional. Red-first focused run: 6 failed / 12 passed; final: 18/18 passed. Production build, token audit, migration lint, deploy-trigger and local scope checks passed. Clean Playwright contexts: all three routes at 1280/390, six captures inspected, no overflow or page errors. Evidence files `legal-qa-8b28.json` and `legal-{terms,cancellations,privacy}-{1280,390}-8b28.png` are retained outside the public repo. Full suite, current-main CI, protected landing and production proof remain pending; not shipped.
- LAUNCH-marker-ci-skip: done — 0697edfc (code head; landed under D-082 with this status commit on top). Job-level `if:` on `check`, `test` and `build` skips `pull_request` events whose head ref starts with `agent/reports/`, `agent/review/`, `agent/heartbeat/` or `agent/architect/`, or equals `agent/queue/landing`; `push` to main and task branches (`agent/queue/<task>`, `agent/<model>/<task>`) are unaffected because the condition is `pull_request`-only. Built by an Instinct coordinator session (PR #658). Landed by DeepSeek V4.1 Flash · c302, who verified rather than took it on trust: `scripts/ciMarkerSkip.test.ts` is red on main's workflow (3 failed / 3 passed) and 6/6 green on this one; `scope-check --branch` reports 2 owned paths with every change inside them; the conflict probe prints 0 against `main` and against `agent/queue/launch-legal-copy`; `tsc --noEmit` clean on the merged head. Required CI green on `06e20175` and re-run on the merged head.
- **2026-11-21, D-373 (3), registered by Claude Code.** The passwords and the browser had ended up in different sessions (reports `7ca427c1a`, `cbe63dbc7`). The signed-in evidence now comes from `OPS-live-qa-runner` (`docs/plans/OPS-live-qa-runner.md`): a GitHub Actions run that signs in as both demo accounts from two repository secrets and captures their routes at 1280 and 390. `LAUNCH-live-qa` depends on it and attaches that run's link, artifact and summary, plus one full e2e journeys run and the BUGFREE_GATE update. Until the runner lands, a session that holds the current plaintext and a browser may still run the steps by hand.

- **2026-11-21, D-377, ruled by Claude Code · 435a (official unblock lock `c7619d899`, main `18fe1898`).** `OPS-deploy-secrets-file` and `OPS-live-qa-runner` are done, so the row's only missing input is the runner's signed-in run. The runner has no passwords: run [44941125936](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44941125936) skipped and dispatched run [44948082959](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44948082959) failed, both saying the two secrets are not set. Setting them is the owner's (D-373 (7), D-374 (2)), so `LAUNCH-live-qa` waits at `owner` until they exist. It is alone in its lane with no dependents, so nothing else waits. Release: the owner adds the secrets; any session runs `docs/plans/OPS-live-qa-runner.md` section 4 steps 2 and 3, and the pull request that records a run signing in as both demo accounts sets the row back to `todo`. #710 stays draft; its missing legs (signed-in captures, wallet, document isolation, safe transitions) and the cf1f checklist (referrer-home empty state, shell titles) carry over unchanged.

- Historical LAUNCH-live-qa report — blocked — Claude Code · c2ed — 2026-11-24 — signed-in render evidence recorded (run 45372954261, `docs/qa/launch-live-qa-2026-11-24.md`); wallet before/after, live document isolation, safe transitions and job-link previews are not provable by the navigation-only runner and stay UNVERIFIED; the WorkOS refresh 400 needs its own row

- **2026-11-24, D-390, ruled by Claude Code · 695b (official unblock lock `d3d931c86`, main `aa6d5807`).** The Claude Code · c2ed block stands confirmed: PR #1540 proves sign-in and 38/38 signed-in routes at 1280 and 390 (run 45372954261), but packet steps 2-4 (wallet before/after, document isolation and cross-user denial, create/withdraw/claim/accept, job-link previews) need actions the navigation-only runner does not take. D-389's `OPS-live-qa-journeys` proves them on skipwait.me with the two demo accounts, so it is now a dependency of this row. PR #1540 keeps its evidence and does not land before the journeys run is recorded (auto-merge turned off), because a merge now would mark the row done with those items unproven. Then the builder adds that run to `docs/qa/` and BUGFREE_GATE 2.8, 3.6, 4.20 plus a job-link preview line and lands on green required CI. The WorkOS 400 stays with `AUTH-workos-refresh-scope`; BUGFREE_GATE 1.1-1.10 are owner tests outside this row.

- LAUNCH-live-qa: waiting for qualifying sandbox journeys — GPT-6.1 Sol · 32d8 — 2026-11-25 — takeover `7387ccf12`, main `5a076a29a` integrated with both earlier evidence records retained. PR #1600 restores the unfinished `OPS-live-qa-journeys` dependency under D-373 (6): #1558 merged the pre-D-393 public opportunity path and linked no successful sandbox journeys run. PR #1540 must not land before the corrected run's wallet, privacy, transition, preview and 1280/390 evidence is recorded (D-390). No live state-changing journey was run by this handoff.

- **2026-11-25, LAUNCH-live-qa landing preflight — GPT-6.1 Sol · 32d8.** Official takeover `7387ccf12`; checked main `5a076a29a`, current instructions and D-370/D-373/D-389/D-390/D-393 through D-398. PR #1540 retains its signed-in render evidence. Its dependency's PR #1558 merged as `f25eb09c7`, but `scripts/live-qa-journeys.mjs:188-209` still uses the pre-D-393 public walk-in path and the packet/PR links no successful sandbox journeys run. The picker inferred that dependency done from its merge and offered this landing too early. Under D-373 (6), `OPS-live-qa-journeys` resumes its remaining sandbox implementation and dispatched acceptance on `agent/queue/ops-live-qa-journeys-sandbox`, with its existing tier, lane, scope, dependencies and order. This row stays `todo` on its current branch with the same dependencies and must not land before that evidence is recorded (D-390). No live journey, public post, account mutation or payment was attempted by this preflight; wallet, isolation, transitions and preview acceptance remain **UNVERIFIED**.

- **2026-11-25, LAUNCH-live-qa unblock reconciliation — GPT-6.1 Sol · 4699.** On main `0a5e319ae`, PR #1600 has requeued the unfinished sandbox journey on `agent/queue/ops-live-qa-journeys-sandbox`. Clear the lane-level block report under D-378; the launch row remains `todo` and waits on that dependency. D-390 acceptance is still **UNVERIFIED**: run #45549322879 was a `workflow_run` and skipped journeys; dispatched render run #45372954261 was navigation-only. PR #1540 remains open with auto-merge off until a successful sandbox `workflow_dispatch` journey and its wallet, privacy, transition and job-link evidence are recorded. No live QA or production action was performed.
