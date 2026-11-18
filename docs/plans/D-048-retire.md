# D-048 retirement: delete the old design, surface by surface (D-332)

Owner, November 11, 2026, in session: "Make sure old design is completely removed and forcibly changes to goal focused design".

This packet is the build brief for the rows `D-048-K-<surface>`, `D-048-K-inplace`, `D-048-K-kit` and `GATE-goal-design-ratchet` in `docs/plans/assignments.json`. It replaces the K1-K5 rows of `docs/plans/D-048-phase-3-split.md`, which were written on Oct 21 and never registered, so no session was ever handed a deletion.

Goal link: one design, landing to admin, is what a seeker or referrer meets on every page (D-120, D-150). Two designs in the code means a page can still render the old one, every fix is made twice, and a switch can be turned back.

## 1. Where the old design still is (measured on main `baff2550`, Nov 11)

| What | Count | Removed by |
|---|---|---|
| Surface ids declared in `client/src/lib/goalSurfaces.ts` | 46 | - |
| Ids in `RELEASED` (the goal page is what production serves) | 21 | - |
| Ids built and wired but still off | 14: `verify`, `plans`, `email-review`, `links`, `support`, `assistants`, `employer-billing`, `admin-money`, `admin-people`, `admin-approvals`, `inbox`, `profile`, `employer-talent`, `home-signed-in` | their `D-048-R-<id>` rows |
| Ids with no finished goal page | 6: `conversation` (referrer side), `premium`, `pricing`, `sign-in`, `skippy`, `public-profile` | their `D-048-p3-*` build rows, then `D-048-R-<id>` |
| Page files that still hold both designs behind a `goalSurfaceOn` switch | 61 | `D-048-K-<surface>` |
| Non-test files importing `client/src/components/kit` | 92 (none under `pages/goal` or `components/goal`) | `D-048-K-<surface>`, then `D-048-K-kit` |
| `client/src/styles/kit.css` | 291 lines | `D-048-K-kit` |
| Kit v4 token block in `client/src/index.css` (above the phase-2 marker, line 246) | 1 block | `D-048-K-kit` |
| Shell parts on the old system (`AccountMenu`, `NotificationBell`, `BetaNotice`, `CookieConsent`) | 4, on every page | `D-048-F-shell-parts` (waits for the owner, D-231) |

Under vitest the switch ignores `RELEASED`, so every unedited kit test still renders the old page. That is by design while both exist, and it ends per surface when its retirement row lands.

## 2. The order nobody may skip

1. **Build** the goal page (`D-048-p3-<id>`).
2. **Release** it (`D-048-R-<id>`: one line in `RELEASED`, with its QA, captures, kit-drift check and, for Tier 1, an independent review).
3. **Soak**: 7 days live with no new Sentry issue on that surface (split rule 5). **Suspended by D-349 (owner, Nov 16) in launch mode:** while SkipWait has no real users, a retirement row lands as soon as its release row is done. The soak returns when the owner announces launch or the first real user signs up.
4. **Delete** the old page (`D-048-K-<surface>`).
5. **Delete the kit layer** when nothing imports it (`D-048-K-kit`).

An old page is never deleted before its goal page is live: that would break a basic (D-019). "Completely removed" is therefore true on the day `D-048-K-kit` lands, not before, and no report may say otherwise.

## 3. What one retirement row does

One row, one surface, one agent. Its `owns` is its build row's files plus the tests that import its pages.

1. Confirm the release row in `dependsOn` is `done`, the id is in `RELEASED` on `origin/main`, and the soak has ended. Record the release commit, the date, and the Sentry check (query and result, no personal data) in the pull request.
2. **Kit-drift check.** `git log` the kit body since the goal page landed. Any behaviour the kit page gained afterwards must already exist in the goal page. If it does not, stop and report: that is a fix on the build row's lineage, not this row's work.
3. In each page file, delete the kit body (`KitX`) and the `goalSurfaceOn` switch. The file's default export renders the goal page alone. Keep the file and its export name, so `client/src/App.tsx` and every importer stay untouched.
4. **Tests.** A kit test is deleted only after each of its assertions is ported to the goal test or listed as dropped with the reason, in the pull request's "Ported assertions" table (GATE-test-integrity rules 1 and 4). Remove the `vi.mock('@/lib/goalSurfaces')` forcing from goal tests that no longer need it. The pinned tests `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx` lose no assertion: if `D-048-K-sign-in` or `D-048-K-verify` cannot keep one, stop and report (rule 5 needs a decision).
5. Delete a non-goal component only when a repository search shows nothing imports it any more. Data modules, `*Api.ts`, models and shared hooks stay.
6. Do not edit `client/src/lib/goalSurfaces.ts`, `client/src/App.tsx`, `client/src/test/goalPagesBoundary.test.ts` or any file outside `owns`. The id stays in `RELEASED` until `D-048-K-kit` removes the module.
7. No behaviour, copy, route, price, legal text or sign-in method changes. A retirement that changes what a user sees is a defect.
8. Gate: `pnpm check`; `node scripts/design-token-audit.mjs`; the surface's goal tests; `LANG=en_US.UTF-8 pnpm vitest run`; `pnpm build`; captures at 1280 and 390 from a clean browser on the preview, matching the release captures. Tier 1 rows take one independent review (D-151).
9. After landing: `EXPECTED_SHA=<sha> bash scripts/verify-live-release.sh`, the live page at 1280 and 390, then the Status line below.

If the deletion needs a path outside `owns`, stop and ask for a widening (D-200). The list was generated from the build rows, not hand-audited per file.

Rollback after a retirement is a revert of that one pull request. The one-line switch rollback no longer exists for that surface; this is why the soak is kept.

## 4. Rows

Each `D-048-K-<surface>` depends on the row that released (or will release) the surface. Soak start is that row's landing.

| Row | Surface ids | Built by | Released by | Tier |
|---|---|---|---|---|
| `D-048-K-home` | home, home-signed-in | D-048-p3-home, D-048-p3-home-signed-in | D-048-R-home-signed-in | 2 |
| `D-048-K-sign-in` | sign-in | D-048-p3-signin | D-048-R-sign-in | 1 |
| `D-048-K-inbox` | inbox | D-048-p3-inbox | D-048-R-inbox | 1 |
| `D-048-K-conversation` | conversation | D-048-p3-conversation | D-048-R-conversation | 1 |
| `D-048-K-start` | start | D-048-p3-start | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-onboarding` | onboarding | D-048-p3-onboarding | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-verify` | verify | D-048-p3-verify | D-048-R-verify | 1 |
| `D-048-K-plans` | plans | D-048-p3-plans | D-048-R-plans | 1 |
| `D-048-K-premium` | premium | D-048-p3-premium | D-048-R-premium | 1 |
| `D-048-K-pricing` | pricing | D-048-p3-pricing | D-048-R-pricing | 1 |
| `D-048-K-referrer` | referrer | D-048-p3-referrer | D-048-R4 (Nov 9) | 1 |
| `D-048-K-referrer-home` | referrer-home | D-048-p3-referrer-home | D-048-R4 (Nov 9) | 1 |
| `D-048-K-invite` | invite | D-048-p3-invite | D-048-R4 (Nov 9) | 2 |
| `D-048-K-post-opportunity` | post-opportunity | D-048-p3-post | D-048-R4 (Nov 9) | 2 |
| `D-048-K-email-review` | email-review | D-048-p3-email-review | D-048-R-email-review | 1 |
| `D-048-K-settings` | settings | D-048-p3-settings | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-profile` | profile | D-048-p3-profile | D-048-R-profile | 1 |
| `D-048-K-alerts` | alerts | D-048-p3-alerts | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-messages` | messages | D-048-p3-messages | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-assistants` | assistants | D-048-p3-assistants, D-048-p3-agents | D-048-R-assistants | 1 |
| `D-048-K-support` | support | D-048-p3-support | D-048-R-support | 2 |
| `D-048-K-seeker-small` | landed, suggest-company, share | D-048-p3-seeker-small | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-skippy` | skippy | D-048-p3-skippy | D-048-R-skippy | 1 |
| `D-048-K-employer` | employer | D-048-p3-employer | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-employer-talent` | employer-talent | D-048-p3-employer-talent | D-048-R-employer-talent | 1 |
| `D-048-K-employer-billing` | employer-billing | D-048-p3-employer-billing | D-048-R-employer-billing | 1 |
| `D-048-K-for-companies` | for-companies | D-048-p3-for-companies | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-admin` | admin | D-048-p3-admin | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-admin-money` | admin-money | D-048-p3-admin-money | D-048-R-admin-money | 1 |
| `D-048-K-admin-people` | admin-people | D-048-p3-admin-people | D-048-R-admin-people | 1 |
| `D-048-K-admin-approvals` | admin-approvals | D-048-p3-admin-approvals | D-048-R-admin-approvals | 1 |
| `D-048-K-admin-ops` | admin-ops | D-048-p3-admin-ops | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-developers` | developers | D-048-p3-dev | D-048-release-platform (Nov 9) | 1 |
| `D-048-K-policy` | policy | D-048-p3-policy | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-system` | system | D-048-p3-system | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-links` | links | D-048-p3-links | D-048-R-links | 2 |
| `D-048-K-discovery` | discovery | D-048-p3-discovery | D-048-release-platform (Nov 9) | 2 |
| `D-048-K-public-profile` | public-profile | D-048-p3-public-profile | D-048-R-public-profile | 1 |
| `D-048-K-inplace` | queue, ask, company, the seeker conversation, /requests and /explore (moved in place, D-149, no switch) | #360, #362, #426, #429, #431 | already live | 1 |
| `D-048-K-kit` | the kit layer | - | every row above | 2 |

For the sixteen rows whose surface went live on Nov 9, the soak ends on Nov 16. A session handed one earlier may build it ahead as a draft (D-315) and lands it no earlier than that date.

`policy` deletes design code only. Terms, Privacy, Refund and Cancellation wording is the owner's and stays byte-identical.

## 5. `GATE-goal-design-ratchet`: the forced part

Until the kit layer is gone, CI makes the old design a one-way street. A vitest file in the required unit job (no workflow edit):

1. **A released page stays released.** Every id in the baseline's `released` list is in `RELEASED`. Taking a released surface back is then a deliberate edit of the baseline in the same pull request, with the incident or decision named, never a quiet one-line revert.
2. **No new old-design code.** Only files on the baseline's allow-list may import `client/src/components/kit` or call `goalSurfaceOn` outside `client/src/pages/goal`, `client/src/components/goal` and the flag module. A new file doing either fails.
3. **The list only shrinks.** A baseline entry is removed when its file stops importing the kit or loses its switch; an entry is never added without a decision id in the same pull request.
4. Each rule has a fixture that fails it.

The baseline is measured on `origin/main` when the row is built. Read `client/src/test/goalPagesBoundary.test.ts` and `scripts/designTokenAuditCore.mjs` first and do not repeat what they already refuse (goal pages reaching kit modules; legacy tokens and colour literals in goal scope). This row changes no page and no runtime code.

Release rows are not slowed by it: adding an id to `RELEASED` passes rule 1 unchanged. Retirement rows are not slowed by it: an allow-list entry whose file no longer matches is harmless and is pruned by `D-048-K-kit`.

## 6. What this packet does not decide

- **Order in the list.** Retirement and the gate are new work and sit last (FIFO). Only the release rows moved (D-332 (2)).
- **The soak length.** Seven days, as the split set it. Shortening it is an owner question (D-332).
- **`D-048-F-shell-parts`.** Held by the owner on PR #767 (D-231). `D-048-K-kit` cannot finish while those four parts import the kit.
- **`D-048-dark-mode`.** Unrelated to removal; still the owner's (D-230).
- **The legacy `/plans` page and its parts.** They retire with the pricing rows, not here (split K1 note; D-219, D-221).
- **Prices, legal text, the login rule, what is on sale.** Untouched.

## Status

The rows share the plan row "D-048": each task writes one line here, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).

- D-048-K-referrer: in progress — GPT-6.1 Sol · 630a — 2026-11-18 — branch `agent/queue/d048-k-referrer`, main `b63ea2e3`. R4 release `3bcf3786` is on main; `referrer` remains released and D-349 applies. Both unforced goal defaults failed before deletion (`a758a34c`). Goal-only lazy entrypoints preserve the coverage-banner export; four unused kit components and the unused kit dialog body are removed, with existing marker/data helpers retained. All 63 focused cases in nine files and TypeScript pass. No assertion is removed from the pinned login rule; its unchanged negative guard now covers the live goal modules. Twenty synthetic browser pairs preserve referrer content; eighteen full-page pairs are byte-identical after settling the shared header, and two differ only in that header's balance pill. Full gate and exact-head CI pending; no merge/live claim.

- D-048-K-conversation: done — `98f93ec6` (PR #1279 merged to main `b63ea2e3`; required CI `44309091323` passed). Production deployment/live verification status is not claimed here.

### D-048-K-conversation: ported assertions

No test or case is deleted. `referralConversation.test.tsx` retains its 48 cases; share-win (5), thread-model (8) and deadline-off (2) cases stay. The new retirement file adds two source contracts.

| Legacy assertion | Goal assertion preserving the contract |
|---|---|
| Job function in `header .eyebrow` | Exact same server-derived `Data · Wipro` text in the goal page |
| Native disabled Accept/Pass, unchecked radio inputs | Goal controls' `aria-disabled`/`aria-checked`, no decision POST before attestation/reason, and identical request body |
| Pass reason's native label | Same `At capacity right now` accessible radio; same decline/passReason payload |
| Referrer `Referral submitted` state | Goal `Referred` status; same intro_made state, resume/name/message visibility and progress request |
| Server refusal inside kit dialog | Exact refusal in the goal alert; the named accept confirmation stays open |
| Flag-off renders the kit page | Goal page renders by default, with no surface override or switch mock (D-332 retirement) |

All seeker privacy, withdrawal, progress, error/retry, message draft and name-reveal assertions remain. All prior goal privacy, colleague assignment, unknown viewer, offline, phone pass sheet, attestation and unsupported-deadline assertions remain. `ThreadMain.tsx` had only the removed route import; no data/model/API module is deleted. Remaining shared kit panels are outside this deletion because their milestone export still has a live importer.

- **CI receipt / completion on merge:** PR #1279 head `c359372b`, [CI 44309091323](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44309091323), passed TypeScript, all three unit shards and their required aggregate, production build, 8/8 E2E journeys, release-capture planner and the scope/review/test-integrity gates. The 400-commit Git fixture that timed out locally passes in CI. No separate review is required for the computed Tier 2 paths (D-352); no independent review is claimed. This docs/registry-only final checkpoint sets only this task's status to done effective when PR #1279 merges, and syncedTo to checked D-359. Exact final-head CI and normal protected auto-merge still apply; deployment and live acceptance remain unverified until post-merge checks complete. The local full-suite timeout remains recorded above.

### D-048-K-referrer: release, drift and ported assertions

Release: R4 merged as `3bcf3786` (PR #1020, 2026-11-07); `2505e21c` added the referrer id to `RELEASED`, and `D-048-R4` is done on main `b63ea2e3`. D-349 launch mode suspends the soak; no Sentry query or seven-day Sentry clearance is claimed. After goal landing `f1559f40`, the only kit-page change was `dfc555b9`'s `code_required` delegation from kit impact to the goal impact step-up; that exact in-session step-up remains in the unchanged goal page and its route/direct tests.

Both entrypoints keep their default export names, real lazy imports and null Suspense fallbacks. `Referrer.tsx` still re-exports the real coverage banner. Goal referrer, impact and OTP modules, `capacitySettingsData`, claimed review/decision UI, server access/session gates and all API/data modules stay unchanged.

Repository consumer search found `ReferrerOverview` unused, `ReferrerWorkspace` reachable only from the deleted entrypoints, its setup dialog reachable only from that workspace, and `CapacitySettingsPanel` used only by its six tests after cutover. The four components are deleted after porting those tests to the existing `GoalCapacityPanel`. The mixed `ReferrerSignInDialog` module retains the exact existing marker key and mark/consume functions, but loses the unused React dialog and kit imports. The pinned file-path guard is migrated rather than left pointing at deleted files.

| Test/contract | Preserved goal assertion or explicit design-only retirement |
|---|---|
| `referrerGoal.test.tsx` (20 cases) | Surface forcing is removed. The two flag-off kit-design cases become unforced goal-default cases. All OTP, focus trap, server-verdict privacy, invite wording, capacity, loading/error and impact contracts remain. |
| `referrer.otp.test.tsx` (16 cases) | The real query provider and explicit server-access fixtures replace kit-only domain inference. Enrollment request/invite payloads, OTP-only sign-in, no account linking/sign-out, one-shot inbox landing, later overview visits, verbatim inbox refusal, free review, approval/message handoff, private decline/reopen, and invite-share URLs remain asserted. Selectors use the released referral-request wording; no product copy is edited. |
| `referrerImpact.test.tsx` (7 cases) | All zero/real metric values and label order, older-payload normalization, no balance/reward display, real company/date, inbox/share links, failed-check privacy and retry contracts remain. Goal links retain the Impact return path through `referrerSignInHref`; the old kit header setup button and button-vs-link markup retire. |
| `referrerImpact.stepUp.test.tsx` and both direct goal step-up files | Existing in-session work-email code assertions remain; no OTP sign-in redirect is substituted. |
| `capacitySettings.test.tsx` (6 cases) | All assertions are unchanged; only the imported/rendered component and its prop type move from kit `CapacitySettingsPanel` to the real `GoalCapacityPanel`. Company identity, all saved areas, capacity/pause PUT, honest failure/retry, no signed-out reads and `/verify` navigation stay covered. |
| `claimedReview.test.tsx` | Existing privacy and decision assertions remain unchanged. |
| Pinned `loginRule.test.tsx` | No test, assertion line or negative regex changes. The four-file component list becomes five active goal/OTP/marker files, retaining the unchanged ban on full AuthKit sign-in; all six route-entry guards remain. This is not a pinned-test escape or a login-rule change. |

The first post-cutover focused run had 43 passes and three first-case empty-Suspense failures. Component tests now statically preload the actual goal modules while still mounting the real lazy route entrypoints: no lazy/flag mock, timeout increase or assertion relaxation. The final nine-file focused run passes all 63 cases. The preliminary TypeScript command hit its 300-second tool deadline without diagnostics; the completed-source check then passed in 135.50s. The incomplete run is not represented as a pass.

Visual proof uses local synthetic API fixtures and real browser actions, not live signed-in acceptance. Ten workspace/impact states at 1280×900 and 390×900 show no horizontal overflow or page errors. Signed-out, unverified and step-up captures make zero private inbox/summary reads. Initial captures include six shared balance-header timing differences; after waiting for that real header state, eighteen full-page pairs are byte-identical. The other two desktop pairs differ by 2,161 pixels entirely within the shared header balance pill at `[989,12,1224,44]`; referrer content is identical. Original and settled images, hashes and measured differences are preserved under `design/goal-ui/captures/referrer/retire-630a/` (D-356/D-359). Phone OTP, desktop capacity, phone private impact/step-up and differing frames were inspected natively. No DOM or app state was changed by script to simulate a result.

- D-048-K-start: in progress — GPT-6.1 Sol · 97f1 — 2026-11-18 — branch `agent/queue/d048-k-start`; current main `b63ea2e3`, current decisions through D-359, `docs/BRIEF.md`, `docs/PRD.md`, `AGENTS.md`, `docs/DELEGATION.md`, `COLLABORATION.md`, this packet and the prior release/retirement outcomes checked. The start goal surface is live from PR #1074 (merge `c1f65aaa`, 2026-11-09); D-349 removes the soak requirement. Confirm exact release history, Sentry evidence and kit drift before deleting the legacy implementation. No behavior, copy, routing, API or auth changes intended.

### D-048-K-start: ported assertions and evidence

The legacy `Onboarding.tsx` body and `goalSurfaceOn("start")` switch are removed. The file remains the route-compatible default export and renders `GoalStart` directly. `GoalStart` retains the job-link preview, canonical URL guard, ambiguous/unreachable employer confirmation, retry state, draft continuity and clearing, fast-track handoff, bridge keys, and `/request` destination.

| Legacy assertion | Goal assertion preserving the contract |
|---|---|
| Invalid target text shows an inline alert and disabled Continue | `GoalField` error plus `aria-disabled="true"`, visible recovery hint and a linked disabled reason |
| Valid URL enables Continue without waiting for preview | Goal button becomes active from URL validity; preview remains background work |
| Ambiguous or unsafe unreachable preview requires a company domain | Goal company-domain field and matching disabled/active transition |
| Preview outage is recoverable | Goal alert and Try again action; retry produces a second preview request |
| Saved draft and resume draft clear | Existing draft restoration and `/api/documents/draft` delete assertions remain |
| Fast-track query survives handoff | Goal flow preserves `/request?fast=...` and existing bridge state |
| Mobile URL keyboard and Enter behavior | `server/mobilePwaAudit.test.ts` reads `GoalStart.tsx` now that `Onboarding.tsx` is the route wrapper; it still pins URL input mode, keyboard hints, capitalization/spellcheck settings, and Enter handoff |
| Flag-off renders the legacy kit page | Replaced by a retirement contract: Onboarding has no surface-switch or kit import and always renders `data-testid="goal-start"` |

Red first: `startGoal.test.tsx` retirement assertion failed against the old switch/body; after the cutover, 27 focused tests pass across `server/mobilePwaAudit.test.ts`, `startGoal.test.tsx`, `onboarding.url.test.tsx` and `ask.startHandoff.test.tsx`. The initial full local run found 11 failures across 745 files (7,787 passed, 18 skipped); one was this row's stale `server/mobilePwaAudit.test.ts` source path and is corrected to inspect `GoalStart.tsx`. The ten remaining local failures were outside the changed paths, including timeouts under the long local run; all three current-main CI shards passed. `pnpm check`, `node scripts/design-token-audit.mjs`, `bash scripts/lint-deploy-migrations.sh`, `node scripts/check-deploy-triggers.mjs`, `git diff --check` and `node scripts/scope-check.mjs D-048-K-start` pass. Sentry read-only searches on 2026-11-18 for `is:unresolved transaction:/start` over 30d returned no issues in `skipwait-webapp` or `skipwait-backend`. Kit drift after the goal build `f5e2a7d4`: none in `Onboarding.tsx`. Reproducible clean-browser proof: `node design/goal-ui/captures/start/retirement/capture.mjs before` captures the released behavior from main `e8845c36`; `... capture.mjs after` captures the retired route. All 18 states (start, invalid URL, checking, identified, ambiguous, confirmed, outage, saved draft, private link) at 1280x900 and 390x844 have zero page errors/overflow; `comparison.json` records zero differing pixels across all pairs. Images, source hashes, manifests and capture generator are committed under `design/goal-ui/captures/start/retirement/`. Local `pnpm build` passed. Current-main merge commit `6e8c0f0f` plus packet sync commit `ae5e4cc4` are included in the candidate; exact PR CI run `44323410143` passed all required checks, E2E, typecheck, production build and all three test shards. The PR remains draft pending final evidence sync and handoff; no production merge or live-deployment claim is made here.
