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

## Row LAUNCH-legal-copy (Tier 2; the owner approves the text before it lands)
**Goal.** Make three public statements true. Agents draft; the owner approves the exact wording in a comment on the pull request, and nobody lands it before that comment exists.

**Current text (verified):**
1. `client/src/pages/Terms.tsx:23` (summary bullet): "Referrals are always free. Plans and credit packs buy preparation tools and monthly allowances — never priority or outcomes." Asks cost referrals (D-173), and packs are sold for money. Section 03 of the same page is already correct.
2. `client/src/pages/CancellationPolicy.tsx:25`: "The reserved credit is returned to your balance immediately. No money is charged for a request, so there is nothing to refund."
   - A withdraw before pickup returns the referral once.
   - Free monthly referrals from a month that has ended do not come back. The reversal row records 0 for an ended cycle (AGENTS.md, living map, kit credit ledger).
   - Paid referrals are bought with money, so "no money is charged" needs care.
3. `client/src/pages/TrustPrivacy.tsx:58` names only Chargebee, Razorpay and PayPal. WorkOS (sign-in), ZeptoMail (email codes), Sentry (error reports; its DSN is in the live bundle) and Cloudflare (hosting) also process personal data.

**Proposed text (the owner may change any word):**
1. Terms bullet: "Each ask uses one referral from your balance, taken only when a verified employee can see it. Free accounts get 3 referrals a month; referral packs add more. Plans and packs never buy priority or outcomes."
2. Cancellation bullet: "The referral comes back to your balance at once, except a free monthly referral from a month that has already ended. After a verified employee claims or declines the request, the referral stays used."
3. Privacy: one sentence that names WorkOS (sign-in), ZeptoMail (email), Sentry (error reports), Cloudflare (hosting) and Chargebee with Razorpay and PayPal (payments), and what each receives.

**Files:**
- In scope: `client/src/pages/Terms.tsx`, `client/src/pages/CancellationPolicy.tsx`, `client/src/pages/TrustPrivacy.tsx`, `client/src/pages/policyPages.test.tsx`, `client/src/pages/trustPrivacy.test.tsx`.
- Out of scope: `shared/moneyCopy.ts`, owned by `D-132-audit`. The "credits" to "referrals" wording elsewhere is a follow-up after that audit lands.

**Tests first:**
- `policyPages.test.tsx` asserts the Terms page no longer contains "Referrals are always free", and that the cancellation bullet names the ended-month exception.
- `trustPrivacy.test.tsx` asserts each processor name appears.
- Each is red on today's code.

**Done:** the owner's approval comment on the PR, the gate (`pnpm check`, the two test files, `pnpm build`), 1280 and 390 captures of the three pages, and the row set to `done`.

**Stop and ask if** the owner changes the money meaning of a sentence (for example, refunds on a decline). That is D-147's territory: report it `blocked` with the question.

## Row LAUNCH-live-qa (Tier 2; needs a session with a headed browser)
**Goal.** Rule-8 proof that the current release works signed in, with no money moving. Instinct and Cue sessions have no Chromium (report of Oct 25 02:38), so a Claude Code session or a CI capture job runs this.

**Steps:**
1. Use the `qa-sweep-1` seeker and `qa-sweep-2` referrer accounts. The owner forwards one work-email code for the referrer; each code is a paid email.
2. Seeker:
   - sign in and see 3 free referrals;
   - open the INR `pack_2` and USD `pack_5` hosted pages, and stop at the payment form (check the site, amount and currency; never pay);
   - ask at a covered company;
   - check the withdraw path;
   - confirm another user's request cannot be opened.
3. Referrer:
   - claim and accept on `/queue`, and confirm the seeker sees the acceptance.
4. Paste one real open job URL per covered or launch company through `/ask`: Neutrinos, Wipro, TCS, Merkle. Record which previews resolve.
5. Capture every screen at 1280 and 390. Update `docs/BUGFREE_GATE.md` sections 1-4 with the commit, the date and the evidence.

**Files:**
- In scope: `docs/BUGFREE_GATE.md` and `docs/qa/` (new evidence files only).
- Out of scope: any code. File each defect found as its own row through a docs-only pull request (D-200 (2)).

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

- **2026-10-25, LAUNCH-legal-copy waits on the owner (unblock ruling by Qoder · bbc5, D-200 (2)).** The checks half of Cue GPT · 5588's block is stale: typecheck, tests, build and Workers Builds are all green on `c8ecc53a`. The owner-approval half stands and only the owner can clear it (D-200 (6), the lasting D-001 rule). One correction is needed first: in `CancellationPolicy.tsx` bullet 3, "the referral comes back if you withdraw it then" is false - a claimed-then-passed request withdraws with no refund (`withdrawCompanyReferralRequest` sets `creditRefunded` false) and D-147 keeps a declined referral spent, so this row's own proposed wording is the true one: "After a verified employee claims or declines the request, the referral stays used." The owner approves or amends the exact wording in a comment on PR #659; then a session applies it, runs the gate, adds the 1280/390 captures and lands.
- LAUNCH-marker-ci-skip: done — 0697edfc (code head; landed under D-082 with this status commit on top). Job-level `if:` on `check`, `test` and `build` skips `pull_request` events whose head ref starts with `agent/reports/`, `agent/review/`, `agent/heartbeat/` or `agent/architect/`, or equals `agent/queue/landing`; `push` to main and task branches (`agent/queue/<task>`, `agent/<model>/<task>`) are unaffected because the condition is `pull_request`-only. Built by an Instinct coordinator session (PR #658). Landed by DeepSeek V4.1 Flash · c302, who verified rather than took it on trust: `scripts/ciMarkerSkip.test.ts` is red on main's workflow (3 failed / 3 passed) and 6/6 green on this one; `scope-check --branch` reports 2 owned paths with every change inside them; the conflict probe prints 0 against `main` and against `agent/queue/launch-legal-copy`; `tsc --noEmit` clean on the merged head. Required CI green on `06e20175` and re-run on the merged head.
- LAUNCH-live-qa: public pass green, signed-in BLOCKED (Qoder · 6e99, Oct 26). Release `web fb420761` / `API 40e160e2` (ready, schema reconciled). Thirteen signed-out routes at 1280 + 390 (26 views): all 200, zero console/page/network errors, zero >=400 responses, no sample data; `/explore` rendered all 39 companies; sign-in shows five social providers for seekers and the work-email code alone for referrers (D-030 public surface). No sign-in, code request, account creation or payment page: approved QA access is not available yet, and the exact access needed is recorded in issue #709 for Instinct. `docs/BUGFREE_GATE.md` now marks every signed-in item BLOCKED, not GREEN, for this release. Finding: every INR credit pack reports `available:false` on `/api/plans/catalog` (five polls 13:28-13:38Z) while `docs/PRICING.md` says packs are live, so `/plans` shows "Not on sale yet"; filed as row `LAUNCH-packs-unavailable`, issue #709, and its root cause needs the Chargebee LIVE item reads. Evidence: `docs/qa/launch-live-qa-oct26.md` plus 26 captures in `docs/qa/launch-live-qa-oct26/`.
