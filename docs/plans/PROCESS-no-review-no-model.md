# PROCESS-no-review-no-model: green CI lands everything, no rule reads a model name (D-370)

Status: todo. Row `PROCESS-no-review-no-model`, branch `agent/queue/process-no-review-no-model`, decision D-370 (owner, Nov 20 2026).

## 1. What changes

- `scripts/review-gate.mjs`: `runReviewGate` passes with a D-370 notice. The pure rule functions stay, so their tests still describe the old rule and can be deleted later without losing history.
- `scripts/nextTaskCore.mjs`: `needsReview` is false for every pull request, so a green PR is handed out as a landing, never a review. Any session may report on any task. Any session gets the CEO review when nothing else is eligible, after build-ahead. The external-provenance hand-out holds (D-311/D-324) stop.
- `scripts/next-task.mjs`: the external-route claim and reclaim refusals stop. `--provenance` stays optional and is still recorded when given.
- `scripts/scope-check.mjs`: every session gets the out-of-`owns` notice D-359 gave GPT and Claude names.
- One switch file, `scripts/sessionPolicy.mjs`, holds `INDEPENDENT_REVIEW_REQUIRED = false` and `MODEL_ROUTES_ENFORCED = false`. Turning either back on needs the owner's word.
- Tests: new focused tests pin the D-370 behaviour. Old tests that assert the retired rule are updated, and the PR body carries the "Ported assertions" table the test-integrity gate asks for.

## 2. What does not change

Required CI, the test-integrity gate, the queue gate, migration-first, the release gate, exact-SHA readiness, unique session names, exact-session claims, the landing order and the 2-hour claim lease.

## 3. Done means

The PR's own CI is green with the review-gate step passing. `node scripts/next-task.mjs --status` shows no review stage. A Tier 1 PR with green CI is handed out as LAND.

## 4. Stale pull requests closed under D-370 (5)

These open PRs had not been updated for 14 days (before Nov 6, 2026), and their branch is neither an open queue row's branch nor its marker branch. They are closed, not deleted. Each branch stays, and reopening the PR restores it.

| PR | Last update | Branch | Title |
|---|---|---|---|
| #991 | 2026-11-05 | `agent/docs/reopen-p3-assistants` | docs(registry): reopen D-048-p3-assistants (next-step contract) + BYOR waits for it |
| #987 | 2026-11-05 | `agent/registry/d048-admin-money-owns` | docs(registry): D-048-p3-admin-money owns amendment — AdminMoneyCheck.tsx switch-only (D-1 |
| #936 | 2026-11-01 | `claude/modest-mendel-4qmx7n` | D-268: unblock DECISION-COPY-oct26 — referrerHome.test.tsx joins owns for the one D-176 pi |
| #927 | 2026-11-01 | `docs/p1cib-status-stamp` | P1-client-error-boundary: status done — e36c3d62 (packet stamp) |
| #918 | 2026-10-31 | `docs/d260-authz-referral-unblock` | D-260: unblock D-100.authz-referral — the audit report lands within its one owned file; H- |
| #912 | 2026-10-31 | `agent/queue/fix-main-affed40a` | fix(main red): the /share header says ready only when a real invite link exists |
| #911 | 2026-10-31 | `docs/wrapper-cookie-regression-registration` | docs: register existing wrapper notice acceptance repair |
| #895 | 2026-10-31 | `agent/architect/d048-p3-conversation` | Agent/architect/d048 p3 conversation |
| #894 | 2026-10-31 | `agent/architect/d048-inbox` | Unblock D-048-p3-inbox: DeepSeek V4.1 Flash Free · e035 |
| #880 | 2026-10-31 | `agent/review/d048-p3-messages` | Agent/review/d048 p3 messages |
| #868 | 2026-10-30 | `agent/heartbeat/d048-p3-policy` | Agent/heartbeat/d048 p3 policy |
| #865 | 2026-10-30 | `agent/heartbeat/d048-p3-profile` | Agent/heartbeat/d048 p3 profile |
| #858 | 2026-10-30 | `docs/d241-d048-p3-profile-unblock` | D-242: unblock D-048-p3-profile — its red typecheck is the owed independent review, not a  |
| #855 | 2026-10-30 | `agent/fo/issue-96-noindex-edge` | Edge: session and one-time-link screens are noindexed in the served response (issue 96 fix |
| #854 | 2026-10-30 | `agent/fo/issue-699-inert-primary-hover` | GoalButton: inert primary keeps its rest fill on hover (issue 699) |
| #827 | 2026-10-29 | `claude/zealous-clarke-l3aiba` | D-234: supply and journey rows lead new work; #666 may not leave a page selling paused pac |
| #825 | 2026-10-29 | `agent/review/d048-live-review-conversation` | Agent/review/d048 live review conversation |
| #824 | 2026-10-31 | `agent/heartbeat/d048-p3-settings` | Agent/heartbeat/d048 p3 settings |
| #822 | 2026-10-30 | `agent/review/d048-p3-plans` | Agent/review/d048 p3 plans |
| #809 | 2026-10-28 | `agent/review/ci-architect-real-checks` | Agent/review/ci architect real checks |
| #808 | 2026-10-29 | `agent/review/d048-agents` | Agent/review/d048 agents |
| #807 | 2026-10-28 | `agent/review/skippy-fix-s1-ssrf` | Agent/review/skippy fix s1 ssrf |
| #805 | 2026-10-29 | `agent/review/register-d212` | Agent/review/register d212 |
| #804 | 2026-10-29 | `agent/registry/share-ready-review-status` | Restore share-ready fix to normal independent review queue |
| #803 | 2026-10-28 | `agent/registry/telemetry-privacy-register` | Register client telemetry privacy repair with explicit serialization hold |
| #802 | 2026-10-28 | `agent/register/client-telemetry-privacy` | Register bounded client telemetry privacy repair with BYOR serialization |
| #777 | 2026-10-28 | `agent/registry/d048-agents-captures` | Registry: D-048-p3-agents owns its captures folder (D-226 shape) |
| #757 | 2026-10-27 | `claude/decision-sync-oct27` | registry: Oct 27 decision-audit follow-ups (stale register cells, 24 h first look row, unr |
| #747 | 2026-10-27 | `agent/instinct/register-single-bell` | Register integrated single notification entry with route/unread parity |
| #743 | 2026-10-29 | `agent/queue/d048-p3-referrer` | D-048-p3-referrer: post-merge recovery of #575 - display token, viewport-true captures, lo |
| #716 | 2026-11-05 | `agent/copy/free-asks-chip-terminology` | copy(money): "3 free referrals every month" - D-180 headline terminology on released surfa |
| #707 | 2026-10-26 | `agent/instinct/register-invite-polish` | Register D-048-fix-invite-polish: post-merge design findings on goal /invite |
| #704 | 2026-11-01 | `agent/instinct/register-d180-money-label` | Register D-180-money-label: shared assistant money wording says referrals |
| #696 | 2026-10-26 | `agent/registry/device-chooser-release-oct26` | docs(registry): release DEVICE-SIGNIN-passkeys phases A-C (owner, Oct 26) |
| #690 | 2026-10-26 | `agent/instinct/registry-drift-watch-row` | Register DRIFT-watch-content-equiv queue row for #687 repair (D-200) |
| #689 | 2026-10-25 | `agent/instinct/drift-watch-content-equiv` | Drift watch: content-equivalence fallback for reverse-direction landings (#687) |
| #686 | 2026-10-25 | `agent/docs/reviewer-isolation-packet` | docs: REVIEWER-ISOLATION-1 packet (registry row names it, file missing) |
| #685 | 2026-10-25 | `agent/docs/packet-move-oct25` | docs: move Oct-25 packet files under docs/plans/ (queue contract) |
| #682 | 2026-10-25 | `agent/docs/coverage-catalogue-shareimpactcard-oct25` | Coverage catalogue: add ShareImpactCard.tsx to the ReferrerHome line |
| #680 | 2026-10-25 | `agent/brand/og-refresh-oct25` | Brand consistency: current V6-B/W1 OG image + repoint legacy lockup references |
| #678 | 2026-10-25 | `agent/queue/reviewer-isolation-oct25` | Refuse demo review accounts on effectful routes (REVIEWER-ISOLATION-1) |
| #677 | 2026-10-25 | `agent/docs/goal-platform-mandate-oct25` | Record: whole-platform goal-design mandate (owner, Oct 25 evening) + coverage brief |
| #676 | 2026-10-25 | `agent/docs/referrer-priority-packet-oct25` | Packet: paid-referrer priority routing design (timeline-neutral) |
| #675 | 2026-10-25 | `agent/architect/d048-p-account` | Agent/architect/d048 p account |
| #674 | 2026-10-25 | `agent/queue/backlog-oct25-referral-wording` | Nav rename: My asks -> My referrals (frozen wording) |
| #673 | 2026-10-25 | `agent/docs/device-passkeys-packet-oct25` | Packet: native passkey sign-in Phase B (owner-approved SimpleWebAuthn) |
| #672 | 2026-10-25 | `agent/queue/first-look-24h-oct25` | First look 48h -> 24h (founder rule Oct 25) |
| #671 | 2026-10-25 | `agent/docs/device-signin-packet-oct25` | Packet: device-saved sign-in Phase A (free, native-domain) |
| #670 | 2026-10-25 | `agent/architect/d048-onboarding` | D-208: adjudicate D-048 onboarding scope hold |
| #669 | 2026-10-27 | `agent/registry/pricing-backlog-oct25` | Register Oct 25 pricing/device/backlog queue rows (capable-session clause) |
| #662 | 2026-10-25 | `agent/architect/signin-loading-click` | D-207: clear #595 block; owner landing remains |
| #661 | 2026-10-27 | `agent/queue/free-referrals-decision-sync` | Docs: DECISION-SYNC free 3 referrals any level + plan-freeze status (Oct 25) |
| #660 | 2026-10-25 | `agent/queue/discovery-decision-sync` | DECISION-SYNC: automatic company discovery freeze (Oct 25) |
| #647 | 2026-10-25 | `agent/recon/verified-abandoned-closeout` | Verify abandoned-checkout closeout per row; record card-validation pages |
| #645 | 2026-10-29 | `agent/instinct/journey-decisions` | Docs: owner seeker-job-journey decisions (Oct 24-25) - universal search, sole referral act |
| #615 | 2026-10-23 | `claude/qa-d048-queue-row` | docs: queue D-048 post-copy fix row (D-166 gate prerequisite for #597) |
| #611 | 2026-10-23 | `agent/coordinator/prepush-guard` | tooling: fail-closed pre-push guard |
| #607 | 2026-10-24 | `agent/coordinator/workers-commit-sha-fix` | Guarantee commit-sha.txt in the Docker build stage (Workers Builds main deploy fix) |
| #604 | 2026-10-23 | `agent/coordinator/d106-rollout-record` | D-106-impact-card: record code-landed / activation-held |
| #598 | 2026-11-05 | `agent/queue/ayo-referral-words` | D-048-alerts: name the seeker balance "referrals" and explain them inline |
| #590 | 2026-10-23 | `agent/instinct/migration-replay-safe-plan` | Migration replay hygiene: isolated safe plan (docs only, no production changes) |
| #589 | 2026-10-23 | `agent/instinct/d038-a-review-time-lapse` | D-038-A: enforce the 48h claim lapse at review time (Tier 1, held) |
| #588 | 2026-10-23 | `agent/instinct/ayo20-approval-honesty` | fix(assistants): fail closed on unstated approval cost, drop false wallet math |
| #566 | 2026-10-24 | `agent/instinct/ayo7-conversation-goal` | AYO-7 live-review: find, queue and both conversations around the next useful action (Tier  |
| #556 | 2026-10-26 | `agent/review/d132-audit` | Agent/review/d132 audit |
| #555 | 2026-10-23 | `agent/review/p1-queue-attestation` | Agent/review/p1 queue attestation |
| #550 | 2026-10-23 | `agent/d132-item3-main-integration` | HELD: D-132 item 3 combined head integrated onto current main (870b2ea3) |
| #546 | 2026-10-23 | `agent/review/row20cd-thank-you-wall` | Agent/review/row20cd thank you wall |
| #545 | 2026-10-23 | `agent/review/d048-live-review-requests` | Agent/review/d048 live review requests |
| #544 | 2026-10-23 | `agent/d132-item3-integration` | Held integration: composer quote + Skippy coverage gate + accepted-price precondition (D-1 |
| #543 | 2026-10-23 | `agent/d132-skippy-coverage-gate` | D-132 item 3 follow-up: Skippy coverage-aware credit gate (held) |
| #542 | 2026-10-26 | `agent/d132-bridge-quote-gate` | D-132 item 3 follow-up: bridge page adopts the shared quote gate (flag off, held) |
| #531 | 2026-10-23 | `agent/forge/routing-authority-oct23` | docs: record owner routing-only release and standing procedural authority |
| #526 | 2026-10-23 | `agent/forge/owner-priority-oct23` | VRA phase 1 shadow foundation, hard-off, independent review blocked |
| #523 | 2026-10-25 | `agent/instinct/v2-checkout-port` | V2 checkout/crediting port onto current main (flags OFF, TEST-only) |
| #493 | 2026-10-22 | `agent/fo/d035-record-revert` | docs: record D-035 landed and reverted (D-147) |
| #470 | 2026-10-22 | `agent/kat/vra-plan-oct22` | Plan verified referral actions, shadow-first and no money activation |
| #462 | 2026-10-22 | `agent/architect/premium-total-label-oct22` | docs: draft Premium total-label packet for CEO registration |
| #461 | 2026-10-22 | `agent/pally/d022-packet` | docs: D-022 packet, referrer-posted roles (no row added) |
| #416 | 2026-10-22 | `agent/instinct/enable-v2` | Enable PR (HOLD): V2 truth swap + /ask composer quote - merge at go-live only |
| #383 | 2026-10-21 | `agent/instinct/qa-preview-share` | DRAFT: QA preview - share cards + company signal (flags ON integration build + seed + runb |
| #380 | 2026-10-21 | `agent/instinct/credit-pack-ladder` | DRAFT: credit pack ladder 1/5/10/25/50 (₹99/$1 per credit, modest discounts) |
| #371 | 2026-10-20 | `dependabot/npm_and_yarn/app/vite-8.1.6` | Bump vite from 8.1.5 to 8.1.6 in /app |
| #354 | 2026-10-20 | `agent/qoder/d038-reconcile-evidence` | D-038 reconcile: independent audit evidence for the architect (docs only) |
| #325 | 2026-10-19 | `agent/qoder/integrate-kit-v4` | Agent/qoder/integrate kit v4 |
| #319 | 2026-10-23 | `agent/workbuddy/payment-method-gate` | Require a payment method before a Free month grants its credits |
| #309 | 2026-10-17 | `agent/qoder/money-copy-truth` | Stop promising a credit back on every decline and withdrawal |
| #287 | 2026-10-16 | `agent/cline/integrity-fixes` | Test integrity: cap Vitest at 4 workers, make company-directory test hermetic |
| #216 | 2026-10-30 | `dependabot/npm_and_yarn/esbuild-0.28.1` | Bump esbuild from 0.25.10 to 0.28.1 |
| #187 | 2026-10-09 | `implement-terms-screen-1372493804722336557` | Update Terms page and audit screens |
| #140 | 2026-10-06 | `fo/skipwaitmanus-deps-stack` | fix(deps): axios ^1.20.0 + dompurify override >=3.4.16 |
| #139 | 2026-10-07 | `fo/skipwaitmanus-main-green3` | test: unblock the 10 failing tests on main |
| #136 | 2026-10-16 | `agent/qoder/referral-fanout-health` | Measure and surface referral fan-out so the dispatch decision rests on numbers |
| #135 | 2026-10-16 | `agent/qoder/job-link-canonical-identity` | Persist the canonical job link the request fingerprint was computed from |
| #133 | 2026-09-24 | `fix/auth-load-timeout` | Perf: stop /premium and /plans hanging on 'Checking sign-in...' (cap AuthKit SDK waits) |
| #132 | 2026-09-24 | `agent/qoder/env-contract-both-ways` | Fail the config contract on keys nothing consumes |
| #128 | 2026-09-24 | `agent/qoder/ai-fallback-contract` | Bound what the AI model can claim, and pin the model-swap contract |
| #127 | 2026-09-24 | `agent/qoder/employer-route-guards` | Employer REST: first route tests, then parse the partner surface at its edge |
| #126 | 2026-10-26 | `agent/spark-v008-launchprep` | V0-08 launch preparation evidence |
| #125 | 2026-09-24 | `agent/spark-v007-visibility` | V0-07 visibility evidence and analytics decision |
| #124 | 2026-09-24 | `agent/qoder/product-copy-guard` | Copy-truth ratchet: fail pnpm test on a claim SkipWait cannot keep |
| #123 | 2026-09-24 | `agent/spark-v006-checks` | V0-06 automated checks evidence |
| #122 | 2026-09-24 | `agent/spark-v005-recovery` | V0-05 environments and recovery evidence |
| #121 | 2026-09-24 | `agent/spark-v004-stack` | V0-04 stack decision record with alternatives and verification |
| #120 | 2026-09-24 | `agent/qoder/truthful-outcome-status` | Say 'Request accepted' and 'reported', not 'Referral accepted' and 'recorded' |
| #119 | 2026-09-24 | `fix/schema-contract-rebuildable` | Stop boot gating on a foreign key no repo file can create |
| #118 | 2026-10-23 | `agent/cline/reputation-signals` | Add event-sourced referrer reputation and seeker reliability track records |
| #117 | 2026-09-24 | `agent/spark-v003-audit` | V0-03 security and privacy audit findings |
| #116 | 2026-09-24 | `agent/spark-v002-mapping` | V0-02 roadmap mapping against verified tree |
| #114 | 2026-09-24 | `agent/spark-v0-inventory` | V0-01 playbook inventory and tracking files |
| #113 | 2026-09-24 | `agent/spark-frontend-states` | Frontend state sweep: DM open feedback, employer retries, announced errors, no blank impac |
| #112 | 2026-09-24 | `agent/spark-ats-blurb` | ATS blurb drawer on the referrer review screen |
| #111 | 2026-09-24 | `ci/self-hosted-mac-runner` | CI/deploy on self-hosted Mac runner (skipwait-mac) - do not merge until runner is online |
| #110 | 2026-09-24 | `fix/credits-policy-copy` | Credits policy copy: used on send, returned on withdraw before claim (founder choice B) |
| #109 | 2026-09-24 | `fix/102-first-party-funnel` | #102: first-party funnel events (no third-party script) |
| #107 | 2026-09-24 | `fix/99-step1-coverage` | #99 mechanics: seekers see whether a verified employee is here at step 1 |
| #106 | 2026-09-24 | `fix/96-seo-routing` | #96: per-route canonical and title, noindex for private routes, real 404 for unknown paths |
| #105 | 2026-09-24 | `fix/97-share-link-og` | #97 mechanics: share links unfurl with the company, not the generic homepage card |
| #104 | 2026-09-24 | `fix/98-trust-empty-states` | #98: no test roles in public /jobs; empty /jobs and /wall states; /wall out of sitemap whi |
| #95 | 2026-09-24 | `test/mysql-concurrency-harness` | Run concurrency specs against real InnoDB (test infra only) |
| #93 | 2026-09-23 | `fix/identity-email-alias-merge` | Identity merge: founder's gmail + ANITS sign in to user 6; retire orphan rows (#89) |
| #25 | 2026-09-18 | `fix/settings-trpc-test-mocks` | test(settings): mock tRPC context so Settings/policy suites render |
| #18 | 2026-09-17 | `fix/security-and-quality-review` | Fix auth/authz bugs, CSRF, billing trust, and client races found in code review |
| #14 | 2026-09-18 | `hoplite/kalchedon-cd4bc95f` | Referrer decline: two-step confirm + private note (design 2.4) |
| #11 | 2026-10-07 | `dependabot/npm_and_yarn/types/node-26.4.0` | Bump @types/node from 24.7.0 to 26.6.1 |
| #10 | 2026-10-07 | `dependabot/npm_and_yarn/tsx-4.23.12` | Bump tsx from 4.20.6 to 4.23.14 |
| #9 | 2026-10-07 | `dependabot/npm_and_yarn/radix-ui/react-select-2.3.7` | Bump @radix-ui/react-select from 2.2.6 to 2.3.7 |
| #8 | 2026-10-07 | `dependabot/npm_and_yarn/prettier-3.9.6` | Chore(deps-dev): Bump prettier from 3.6.2 to 3.9.6 |
| #7 | 2026-10-07 | `dependabot/npm_and_yarn/aws-sdk/client-s3-3.1120.0` | Bump @aws-sdk/client-s3 from 3.1113.0 to 3.1131.0 |
| #2 | 2026-09-17 | `devin/1787664408-security-hardening` | Fix session-secret fail-open, storage proxy path bypass, and high/critical dependency advi |
| #1 | 2026-09-17 | `devin/1787664393-low-coverage-unit-tests` | test: cover the least-tested server, shared, and client-lib modules |
