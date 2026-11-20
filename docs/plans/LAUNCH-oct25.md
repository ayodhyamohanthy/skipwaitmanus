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

**Current prerequisite (D-369, November 20).** The reviewer-password reset workflow failed on run [44696345516](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44696345516) at main `f302a49f4`; D-369 records Cloudflare 10215 as the cause. Repeating that reset is not a recovery plan. `OPS-deploy-secrets-file` supplies the reviewed release-time secret path and verifies both reviewer accounts can sign in before its own acceptance. This QA row depends on that output and remains `todo`, not `owner` or `done`. No owner policy change is pending here. An owner-completed alternative that removes the cause must have real reset/sign-in evidence and an ordinary dependency reconciliation before dispatch; a settings change is not an agent action.

**Steps (D-346, D-353, D-366 and D-369 replace the October access/checkout instructions):**
1. After the prerequisite is accepted, use the existing reviewer sign-in with the demo seeker and referrer accounts. D-366 authorizes the agent-run reset, with plaintext retained only in that session's private storage; it does not authorize retrying a known-broken route. Never put passwords, hashes, session cookies or raw authenticated responses in public evidence. `qa-sweep-1` and `qa-sweep-2` are excluded (D-214); no owner-forwarded OTP or paid email is needed for this reviewer route. Referrer-facing product sign-in remains work-email OTP only; reviewer QA is not a new user sign-in method.
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

The October 31 recoverability exception above remains the source-persistence boundary, not the current account/status route: D-346/D-366 supersede its `owner` status and account-access restriction; D-369 supplies the current reset prerequisite. The missing QA proof and #710's draft status remain unchanged.

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

- **2026-11-20, LAUNCH-live-qa prerequisite re-sync — GPT-6.1 Sol · 93b6.** Official unblock lock `544fd706c`; main `ded4c9bb8`, D-346/D-353/D-366/D-369 and current packet/registry checked. Prior #710 remains draft at `5e6c2783a`, not a signed-in QA pass. Reset run `44696345516` is independently read back as failed on `f302a49f4`. D-369 already decides the recovery route, so no new owner ruling or reset retry is needed. Packet and registry now require the accepted `OPS-deploy-secrets-file` output and retain all missing live QA evidence. No browser, sign-in, OTP, account, checkout, secret, settings or production action was attempted by this handoff.
  - Focused validation: `parseDecisionRegister` and `validateAssignments` return no errors; structured comparison confirms every other task and this row's status/owns are unchanged. The decision register matches current main byte-for-byte. `git diff --check origin/main` passes on the two changed docs. This proves routing consistency only; live QA remains unverified.

- **2026-11-16, LAUNCH-legal-copy acceptance complete; protected landing and live proof pending — GPT-6.1 Sol · 8b28, PR #659.** Source `9757140d`, integrated head `341db243`, current main `7fbbbc7b`; D-345 through D-350 checked with BRIEF, PRD, AGENTS, BUILD_CONTINUITY and COLLABORATION. [Required CI](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/43865029479) passed typecheck, production build, end-to-end journeys and the full suite: 715 files / 7,294 tests passed, 18 tests skipped by the existing suite. Local compiler passed. The local full suite was stopped incomplete after failures in the picker re-record-pass and referral-conversation private-decline cases; both cases then passed unchanged in isolation on baseline main and on `341db243` (2/2 each). This does not claim a green local full suite or an established pre-existing defect. Focused policies remain 18/18 and six inspected 1280/390 browser cases passed. The row is set done in this landing PR; it is not reported shipped until required checks on the final status commit, protected merge and canonical production proof complete.
- **2026-11-16, LAUNCH-legal-copy redraft verified locally — GPT-6.1 Sol · 8b28, PR #659.** Official picker assigned LAND; task takeover `2099102b` is on origin. Main `becc0abe` merged as `a5c8bea3`; newer main `dcb6d7ae` and D-347/D-348 read before final integration (landing slot retired, required CI retained). D-345 supersedes the October owner-comment hold. Corrected claimed-then-declined withdrawal, acceptance-only resume access, paused sales, conditional allowance eligibility, existing processor disclosures including Microsoft Clarity, no-GST business statement and standard clauses; existing refund rights retained. No service, payment, schema, dependency or flag change. Card verification is not enforced by `openCycleTx` yet, so it is conditional. Red-first focused run: 6 failed / 12 passed; final: 18/18 passed. Production build, token audit, migration lint, deploy-trigger and local scope checks passed. Clean Playwright contexts: all three routes at 1280/390, six captures inspected, no overflow or page errors. Evidence files `legal-qa-8b28.json` and `legal-{terms,cancellations,privacy}-{1280,390}-8b28.png` are retained outside the public repo. Full suite, current-main CI, protected landing and production proof remain pending; not shipped.
- LAUNCH-marker-ci-skip: done — 0697edfc (code head; landed under D-082 with this status commit on top). Job-level `if:` on `check`, `test` and `build` skips `pull_request` events whose head ref starts with `agent/reports/`, `agent/review/`, `agent/heartbeat/` or `agent/architect/`, or equals `agent/queue/landing`; `push` to main and task branches (`agent/queue/<task>`, `agent/<model>/<task>`) are unaffected because the condition is `pull_request`-only. Built by an Instinct coordinator session (PR #658). Landed by DeepSeek V4.1 Flash · c302, who verified rather than took it on trust: `scripts/ciMarkerSkip.test.ts` is red on main's workflow (3 failed / 3 passed) and 6/6 green on this one; `scope-check --branch` reports 2 owned paths with every change inside them; the conflict probe prints 0 against `main` and against `agent/queue/launch-legal-copy`; `tsc --noEmit` clean on the merged head. Required CI green on `06e20175` and re-run on the merged head.
- LAUNCH-live-qa: public pass green, signed-in BLOCKED (Qoder · 6e99, Oct 26). Release `web fb420761` / `API 40e160e2` (ready, schema reconciled). Thirteen signed-out routes at 1280 + 390 (26 views): all 200, zero console/page/network errors, zero >=400 responses, no sample data; `/explore` rendered all 39 companies; sign-in shows five social providers for seekers and the work-email code alone for referrers (D-030 public surface). This session did not sign in, request a code, create an account or open a payment page; the coordinator's authorized QA route separately signed in the two approved alias accounts on Oct 26 and ran read-only checks (issue #709) - seeker session and wallet read, `/api/jobs` `/api/saved-roles` `/api/opportunities/mine` 200, referrer `/api/referrer/home-bundle` 200 with `verifiedCompanyAccess: true`, `/api/admin/billing/ledger` 403 - but those screens were empty states, so no transactional flow is proven. `docs/BUGFREE_GATE.md` marks every item whose test needs a signed-in flow BLOCKED or PARTIAL, not GREEN. Finding: every INR credit pack reports `available:false` on `/api/plans/catalog` (six polls 13:28-14:48Z) while `docs/PRICING.md` says packs are live, so `/plans` shows "Not on sale yet"; root cause established by the coordinator's read-only LIVE Chargebee console read - the `pack_2/5/25/60/150` items were archived on Oct 25 20:06-20:08 IST and the app resolves only `skipwait_<pack>-<currency>`; open are the archival's intent (owner call), the item-price-level read and runtime checkout refusal. Filed as row `LAUNCH-packs-unavailable`, issue #709. Evidence: `docs/qa/launch-live-qa-oct26.md` plus 26 captures in `docs/qa/launch-live-qa-oct26/`.
