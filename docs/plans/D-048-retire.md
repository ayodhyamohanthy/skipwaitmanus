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

- D-048-K-settings: in progress — Cline · 1f79 — 2026-11-19 — branch agent/queue/d048-k-settings. Read receipt: main `d0e3bb89`, claim `8742c8be`; BRIEF, AGENTS, BUILD_CONTINUITY, DELEGATION, PRD, this packet, D-048-account and decisions D-349 through D-363 checked. The release dependency is done and settings is RELEASED; launch-mode D-349 suspends the soak. No earlier source commit or PR on this retirement branch. Goal build lineage `ea6c074c` is the prior implementation outcome. This row removes legacy presentation/switch code only, ports all legacy test contracts, preserves settings API/consent/session behavior and records parity evidence. Sentry `is:unresolved environment:production transaction:/settings` returned no issues in the web or backend project. Kit drift, red-first checks, assertion ports, full gate and 1280/390 parity remain pending.
  - Implementation checkpoint: the Settings default export retains its lazy goal chunk and Suspense boundary but has no legacy body or surface switch. Four exclusive unused presentation modules are deleted (`AppPanel`, `NotificationPanels`, `NewAskEmailRow`, `SlackReviewAlerts`); all API/query/section-parser modules stay. `AccountPanels`, `PrivacyPanels`, `RegionPanel`, `SettingsNav` and settingsUi remain because existing direct tests or a boundary regression still import/read them. Kit drift after goal build is limited to section-parser extraction and language-picker/footnote parity, both present in the goal page. Release `d6dd9c66` was live on 2026-11-09. Red-first route checks failed twice before cutover; nine focused files now pass all 59 cases. Frozen install, token/scope/whitespace checks pass. Typecheck, production build, full suite and final browser comparison are pending.

### D-048-K-settings: ported assertions

No test case is removed. The same cases now exercise the production goal route without a surface mock.

| File / old assertion | Goal destination or preserved contract |
|---|---|
| `settingsGoal.test.tsx`: flag-off legacy body | Goal renders without an override; an added source contract rejects the old body, panel imports and surface switch. All 20 prior goal cases remain. |
| `settings.gating.test.tsx`: Settings heading and guest section headings/buttons | Existing goal line, same section order/current state and URL selection, exact same-origin Sign in link, no account fetch or consent query for guests, unknown-section fallback and authenticated consent query remain. |
| `settings.workEmail.test.tsx`: Work email verified / mode button | Server-derived `Verified · acme.com` and the goal link to `/referrer`; Add work email `/verify`, deletion-review wording and Privacy download/blocked controls remain. |
| `settings.accessError.test.tsx`: raw error inside alert | Goal's existing work-email failure reason in its next-step block, exactly once; no false unverified state, deletion stays available, retry makes exactly two reads, verified state replaces the error and no alert remains. |
| `settings.newAskEmail.test.tsx`: Email when a new ask arrives | Goal's existing `Email when a new referral request arrives` switch, same default On, PUT containing only notifyNewAsk and no switch without verified work email. |
| `settings.slackTriage.test.tsx`: Slack triage connected | Goal's existing `Slack review alerts connected`; same private-message explanation, exact webhook payload, verified-only gate, connect/disconnect actions and notices. |
| `settings.region.test.tsx` | All account-only changed-field writes, optimistic value, failure rollback and device-only guest persistence assertions remain; tests wait for the lazy goal module. |
| `policyPages.test.tsx` | Same absence of duplicated legal/support navigation; legal, pricing, cancellation and refund assertions are unchanged. |

- D-048-K-pricing: done — `2b0ab2ec` ([PR #1294](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1294), Cline · 8a32). Read receipt: main `2f7703bf` through `4a82d981`, BRIEF, AGENTS, BUILD_CONTINUITY, DELEGATION, decisions through D-363, this packet and prior inbox outcome #1278/#1290. Pricing was released by #1274 (`2c69051b`, Nov 18) and served from `8d4232b4` before this retirement; D-349 suspends the soak. No kit-body drift since `dcf52afa`; Sentry `is:unresolved transaction:/pricing` over 30 days found zero issues in web and API projects. Removed only the route's kit body and switch; `GoalPricing`, public route, price/copy, checkout and the `RELEASED` list are unchanged. Rollback is a revert of #1294.
  - Two regression assertions fail on the old wrapper and pass on the candidate; 32 focused tests pass. TypeScript, build, design-token audit, migration lint, deploy-trigger and scope checks pass. The broader local run was not green: the unchanged 400-commit CI-classifier fixture timed out. All required checks and E2E passed on exact head `10728d95` in [PR CI 44388930485](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44388930485) and on [main CI 44389774508](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44389774508). Computed Tier 2 under D-352. Browser before/after pairs at 1280 and 390 differ by zero pixels and show no overflow or page errors.
  - [Pages deploy 44389774459](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44389774459) and [release verify 44390827319](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44390827319) passed for web `2b0ab2ec` and unchanged API `ac2eb04b`. Canonical `/pricing` returned 200 at the exact web SHA in clean browsers at 1280 and 390, with no page errors or overflow and the single `/plans` action. The review handoff was recorded in picker report `fe971010`; the landing report was refused after GitHub auto-deleted the merged branch, so this packet and the PR carry the landing evidence.
- D-048-K-inbox: done — `8d4232b4` ([PR #1278](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1278), merged 2026-11-18). Runtime change removes only the `UnifiedInbox` legacy fallback and exclusive `InboxThreadList`; `UnifiedInbox` renders the released `GoalInbox` with its lazy chunk fallback, `ThreadAlias` keeps its existing list/detail route behavior, and shared `inboxThreads` fetch/identity/access logic is unchanged. Release #1196 was live before retirement; launch-mode D-349 suspends the soak. Kit-body drift check found none. Sentry queries `is:unresolved environment:production transaction:/inbox` over 30d returned no issues in `skipwait-webapp` or `skipwait-backend`.
  - Red first: the goal-without-override and pending-chunk assertions failed before the cutover. Focused post-integration validation: 5 files / 56 tests pass; `pnpm check`, production build, design-token audit, migration lint, deploy-trigger audit, `scope-check`, and `git diff --check` pass. Full local Vitest at merged source `948fd607`: 748 files, 7,812 passed, 18 skipped, 2 unrelated failures (known 20-second `scripts/classifyCiChange.test.ts:655` 400-commit fixture timeout and `server/referralConversation.test.ts` 407-vs-200 assertion; isolated rerun passed 3/3). Neither changed file failed or was altered to mask a failure. Exact PR-head CI on `6b139e3b` passed all checks, three unit shards, build and E2E in [run 44359450632](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44359450632); main CI passed on the merged commit in [run 44361553921](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44361553921). The final PR merge is `8d4232b4`.
  - Synthetic clean-production-build comparison: 40 captures cover reply, verified-referrer review, empty, load-error and signed-out on `/inbox` and `/thread` at 1280x900 and 390x844. Nineteen of 20 before/after pairs match pixel-for-pixel; the only difference is 19 pixels in a bottom-navigation glyph in the empty mobile frame, visually inspected with no content/layout change. All captures have zero page errors/overflow, signed-out makes no access/list reads, and pre-acceptance seeker identity stays hidden. See [PR #1278 capture and verification receipt](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1278#issuecomment-6986260003).
  - Production evidence: Deploy Web run [44361553812](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44361553812) verified the canonical web SHA `8d4232b4`; release verify [44362721356](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44362721356) passed the exact web/API pair (`8d4232b4` / `ac2eb04b`), API readiness/database latency, web routes and signed-out refusals. Canonical `/inbox` returned 200 and was captured at 1280x900 and 390x844 with the goal inbox sign-in state, zero overflow/page errors, and no `/company-referrals/{mine,inbox,access}` requests. `wrangler.jsonc` sets `workers_dev:false`; `https://skipwaitmanus.workers.dev` did not resolve DNS from this environment, so no HTTP status is claimed. The generic `verify-live-release.sh` expects the API commit to equal `main` and therefore reports the intentionally unchanged API SHA as drift for this client-only release; the exact-pair release verification above is green. No real account, API write or payment was used.
- D-048-K-verify: in progress — GPT-6.1 Sol · b53c — 2026-11-18 — branch `agent/queue/d048-k-verify`, claim `55edc720`, main `b63ea2e3`. Read entry docs/register through D-359, packet, DESIGN, Verify/GoalVerify, verification suites and pinned login tests. No prior source work/PR. Release `62c67595` (#1177) is live; verify stays RELEASED, launch-mode D-349 applies. No later kit-body drift. Verify now renders the unchanged GoalVerify only; exclusive VerifyPanels UI deleted, API/helpers retained. Red first: retirement source contract failed on old switch/imports. Candidate: 5 files/55 tests, TypeScript/build and token/migration/deploy/diff checks pass. Legacy suite stays 18 cases/62 assertions; goal suite stays 22 cases/61 assertions; loginRule/signIn and GoalVerify/verifyApi bytes unchanged. Synthetic 1280/390: 24 pairs, matching API call sequences, zero page errors/overflow; 22 byte-identical, two phone pairs differ by 26 and 7 glyph/icon pixels, visually inspected with no content/layout change. Manifests bind source hashes; comparison reports every differing pixel without a tolerance mask. Capture driver uses the existing multi-digit input path and explicit code-box focus after a delayed-focus harness race. Full suite running; PR/exact CI/live proof pending. No auth, receipt, domain, retry, privacy, money, API or dependency change.

### D-048-K-verify: ported assertions

Latest landing checkpoint — GPT-6.1 Sol · b53c: [PR #1284](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1284), source `d77e25a9`, validated head `fd5a4eca`. [CI 44320655918](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/44320655918) passed every required check, three unit shards, TypeScript, production build and E2E. Current main `ac2eb04b` integrated; the status-only conflict retains both histories and the start retirement. Verify, live GoalVerify/API and pinned login files have no new source delta. This task is marked done effective on PR merge and syncedTo checked D-359. Computed Tier 2 under D-352; no separate review or independent pass is claimed. Integrated final-head CI, normal auto-merge and post-deploy canonical verification remain required. The incomplete local full-suite result below remains recorded.

Integrated checks: 8 verification/login/start/mobile-audit files, 77 tests passed; TypeScript and all 375 assignment rows validate. No full local rerun solely for the conflict-free runtime integration is claimed (D-200); the earlier 1,800s local limit remains a limitation, with exact integrated CI required.

No case or test file is deleted. The pinned login tests stay byte-identical. One added retirement source contract enforces the goal-only entry and absence of kit/switch imports.

| File / old assertion | Goal destination or intentional retirement |
|---|---|
| `verify.test.tsx`: kit heading on signed-out page | Existing goal line `Refer someone at your company.`; sign-in gate, work-email link, no company controls/demo code remain |
| `verify.test.tsx`: three exact WE STORE aside strings | Retired kit-only aside copy; the current production goal page intentionally has no storage aside. The case asserts its existing work-email proof/privacy line and absence of WE STORE instead; server storage behavior is unchanged, not re-certified by UI copy |
| `verify.test.tsx`: company-loading aria-busy and disabled Continue/Verify | Goal skeleton's aria-busy, goal buttons' aria-disabled, same domain list, selected company, validation, lock and payload behavior |
| `verify.test.tsx`: disabled Continue during directory failure | Goal error replaces Continue with the single Try again action; assert Continue absent, same refusal and successful retry |
| `verifyGoal.test.tsx`: switch-off kit / switch-on goal | Goal renders unconditionally from the same Verify export; no switch mocks; all other goal assertions retained |

Both suites retain every code send/verification/enrollment receipt ordering, replay/retry, 403/429/503, five-attempt lock, pasted/overtyped digit, directory-domain, resend-window, badge/function/handle and failure-path case. `VerifyPanels.tsx` has no remaining import; the live goal component, verifyApi, directory and shared hooks stay unchanged.

- D-048-K-verify: review prepared — GPT-6.1 Sol · b53c — source `d77e25a9`, current main `b63ea2e3` unchanged. This checkpoint supersedes the pending-full-suite state above. Full local run with four workers was terminated at the 1,800s tool limit, with no final totals: **incomplete, not green**. Recorded failures: unchanged `scripts/classifyCiChange.test.ts` H1 400-commit fixture (58.3s, against 20s), `server/jobLinkPreview.roleTitle.test.ts` (2 bounded-title timing cases) and `client/src/pages/startGoal.test.tsx` (4 cases). The latter two unchanged suites pass together in isolation, 2 files/34 tests; no assertion, timeout or product code outside the retirement was changed. No verification failure was recorded. Focused 55 tests, TypeScript/build/audits, test-integrity and computed Tier 2 classification pass. Exact-head PR CI, protected merge and live verification remain required. Capture manifests/comparison re-verified after the run.

- D-048-K-conversation: review — GPT-6.1 Sol · b53c — 2026-11-18 — [draft PR #1279](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1279), source `f00c756e`, branch `agent/queue/d048-k-conversation`, main `e8845c36`, claim `ca321bcf`. Read entry docs, packet, DESIGN, conversation/tests and decisions through D-359. Release `24a7196b` (PR #1199) is on main; launch-mode D-349 applies. No later kit-body drift. Goal-only entry; unused ThreadMain deleted, shared panels/modal retained for seeker milestone data. All data/actions and optional framed prop stay compatible. Red first: 2 retirement contracts fail on the old switch/imports. Candidate: 8 focused files/140 tests, TypeScript/build and token/migration/deploy/scope/diff checks pass. Route cases stay 48; assertions rise 176 to 177. Computed Tier 2 and test-integrity pass under D-352. Synthetic 1280/390: 22 pairs, zero page errors/overflow; 20 byte-identical, two phone loading/error frames differ by 18 shared-navigation-icon pixels each, visually inspected. Source hashes/manifests and exact pixel comparison committed. **Full local suite: 740 files passed, 5 skipped, 1 failed; 7,798 tests passed, 18 skipped, 1 failed** in 1,176s. Sole failure: unchanged `scripts/classifyCiChange.test.ts:655`, H1's 400-commit fixture exceeds 20s (27.8s); isolated rerun 53 passed/1 timeout (34.7s). Script/test/workflow bytes unchanged; no timeout or assertion weakened. Earlier 120s-tool-limit run incomplete. Exact-head PR CI and production verification pending; no merge/live claim. No rule, copy, API, migration or dependency change.
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

- D-048-K-start: done — `ac2eb04bb0e3f0c9a2011eda439eaa41ded3a7d4` (PR #1282, protected merge; current main CI, API deploy and Pages deploy green). Live proof: `EXPECTED_SHA=ac2eb04bb0e3f0c9a2011eda439eaa41ded3a7d4 bash scripts/verify-live-release.sh` returned `CONVERGED`; live `/start` at 1280 and 390 has `data-testid="goal-start"`, zero overflow and zero console errors; `workers.dev` returned 404.

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

Red first: `startGoal.test.tsx` retirement assertion failed against the old switch/body; after the cutover, 27 focused tests pass across `server/mobilePwaAudit.test.ts`, `startGoal.test.tsx`, `onboarding.url.test.tsx` and `ask.startHandoff.test.tsx`. The initial full local run found 11 failures across 745 files (7,787 passed, 18 skipped); one was this row's stale `server/mobilePwaAudit.test.ts` source path and is corrected to inspect `GoalStart.tsx`. The ten remaining local failures were outside the changed paths, including timeouts under the long local run; all three current-main CI shards passed. `pnpm check`, `node scripts/design-token-audit.mjs`, `bash scripts/lint-deploy-migrations.sh`, `node scripts/check-deploy-triggers.mjs`, `git diff --check` and `node scripts/scope-check.mjs D-048-K-start` pass. Sentry read-only searches on 2026-11-18 for `is:unresolved transaction:/start` over 30d returned no issues in `skipwait-webapp` or `skipwait-backend`. Kit drift after the goal build `f5e2a7d4`: none in `Onboarding.tsx`. Reproducible clean-browser proof: `node design/goal-ui/captures/start/retirement/capture.mjs before` captures the released behavior from main `e8845c36`; `... capture.mjs after` captures the retired route. All 18 states (start, invalid URL, checking, identified, ambiguous, confirmed, outage, saved draft, private link) at 1280x900 and 390x844 have zero page errors/overflow; `comparison.json` records zero differing pixels across all pairs. Images, source hashes, manifests and capture generator are committed under `design/goal-ui/captures/start/retirement/`. Local `pnpm build` passed. Final CI run `44327962006` passed all required checks, E2E, typecheck, production build and all three test shards. PR #1282 merged as `ac2eb04bb0e3f0c9a2011eda439eaa41ded3a7d4`; current main CI, API deploy and Pages deploy passed. `EXPECTED_SHA=ac2eb04bb0e3f0c9a2011eda439eaa41ded3a7d4 bash scripts/verify-live-release.sh` returned `CONVERGED`; live `/start` at 1280 and 390 has the goal page with zero overflow/errors; `workers.dev` returned 404.
