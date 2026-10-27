# Packet D-048 phase 3 foundation: six rows that unblock the split (D-134)

> Read `docs/BRIEF.md` first, then this packet, then `docs/plans/D-048-phase-3-split.md` (it is the ruling file: lane, `dependsOn`, tier, owned paths and flag for every row below come from its table, and it wins any conflict with this packet).

| Field | Value |
|---|---|
| Queue row | `docs/KIT_V4_BUILD_PLAN.md` §3b `D-048` — a shared row nobody edits; each task's status line lives in §Status here (D-134) |
| Decisions | D-134 (the split and who adds rows), D-120/D-121 (the goal UI is the one design), D-097 (production truth in code), D-123 (rulings 2, 3, 8, 10), D-055 (referrers never pay and see no credits pill), D-082 (green before `main`), D-068 (docs move with the change) |
| Risk tier | per row: `F-credits` **1** (it shows credits), the other five **2** |
| Size | S or M per row; the six run in the dependency order in §6, and `F-routes` may run beside them in its own lane |
| Implementer | any model, one row at a time |
| Branch | `agent/<model>/<slug>` from the latest `origin/main`, one per row (§4 table) |
| Depends on | per row (§4); the chain starts once this packet is on `main` |
| Do not run at the same time as | any surface row that edits `client/src/App.tsx`, `AppShell.tsx`, `components/goal/**` or `index.css`; the split's §"The method" gives those files to this chain |
| Verified against | original snapshot `cd4c58bd`; current-main corrections below verified at `80ee78a7` on 2026-10-23 by GPT · 5deb; F-flags compatibility amendment approved by the CEO on PR #483 |

## Current-main corrections (read before the original snapshot)

These corrections supersede conflicting snapshot statements below; the register and approved split still win. This is a documentation-only integration of the original packet, not a release of any implementation or flag.

1. **D-149/D-150 are binding.** The old quoted “every page lands dark” instruction is superseded for re-skins by D-149: an in-place goal redesign is allowed with explicit function/test parity, shared money copy, fictional-fixture captures at 1280/390 and the applicable independent review before landing. Existing in-place surfaces stay in place. Switch/release/retirement steps apply only to rows that still land dark. D-150 requires a real goal-focused flow, not a recolour. The capture checklist must prove a goal line, one “Your next step” block with one black commit, secondary ghost/link actions, dot-and-text status, cost before every ask, honest availability and pre-acceptance privacy, compared with the approved comp.
2. **F-flags compatibility resolved — CEO amendment on PR #483 (2026-10-23, D-123/D-134).** `client/src/lib/goalFlags.ts:4–8` has five exports, including `ASK_LEVEL_COST_CLIENT` at line 7. F-flags retains that module, reduced to the unchanged cost-only export: the same name, env key `VITE_ASK_LEVEL_COST` and meaning. Add exactly the comment "Cost flag only; it moves with the D-132 enable (D-146)." Fold `GOAL_UI_LANDING`, `GOAL_UI_LANDING_V9` and `GOAL_UI_SIGNIN` into `goalSurfaces.ts`; move `PLAN_FAMILY_V2_CLIENT` unchanged to `planFamilyFlag.ts`, updating only its `App.tsx` import. Leave all six cost consumers untouched: `pages/explore/useAskComposer.tsx`, `components/thread/threadModel.ts`, `components/requests/requestModel.ts`, `components/inbox/inboxThreads.ts`, `pages/AdminApprovalRecord.tsx` and `pages/AdminApprovalQueue.tsx`. Keep `VITE_ASK_LEVEL_COST` in `.env.example`. The D-132 enable, not this Tier 2 row, owns the later cost-flag migration or module deletion, alongside the four pricing flags (D-121/D-146). No price, cost line or flag enablement changes.
3. **Preserve the existing hook contract.** `client/src/hooks/useCreditBalance.ts:15–52` already exports `CreditBalanceState`, `creditBalanceKey(userId)` and `useCreditBalance(enabled: boolean)`. The shell must consume this hook, preserving its signature, per-user cache key and existing callers, rather than replace it with the old shell's account-unscoped query key. Consolidation means removing the shell's duplicate query, not editing unrelated billing consumers outside the row's owned files.
4. **No “verdict alone” shortcut.** `useReferrerAccess.ts:12–17` defines `signed-out`, `checking`, `error`, `unverified` and `verified`; it has no separate seeker verdict. Keep the six listed referrer surfaces pill-free regardless of access state. On other surfaces only signed-in auth plus a successful `unverified` response enables the existing hook; the other four states disable it. An access error is not an unverified answer or zero balance. Preserve retry/error semantics and test every state plus account changes. Never derive access from email addresses.
5. **Exact ownership, not open-ended expansion.** F-primitives owns only the six files the split names. Its original “plus any new primitive file” wording is not authorization: a concrete missing path goes to the CEO before it is edited. Approved in-place surface work can still edit its own page files; only actual overlap with a foundation-owned file needs serialization.
6. **The landing transition is production-affecting.** Moving home to `RELEASED` and removing workflow flags must be atomic, preserve V9 in both the default production and all-flags builds, then verify the deployed web SHA and live V9 landing. Intended visible parity is not proof. The all-flags build tests implemented branches only; it neither invents unmigrated goal pages nor authorizes a production release. Retain the split's fetch-free prerender controls.
7. **Routes and dependencies are measured, not guessed.** `App.tsx:121` currently contains 95 `<Route>` elements, not 97. F-routes compares the extracted ordered path/component/fallback inventory before and after formatting. Follow exactly §4's dependencies and lanes: F-harness and F-static-frame wait on W0, F-credits on F-harness, and F-primitives/F-routes on F-flags. Do not add the original §8's implied dependency of every row on F-flags.
8. **Pending handoff.** The proposed six task rows retain the split's exact approved ids, tiers, lanes, branch names and dependencies. The CEO resolved the compatibility conflict in correction 2; this packet is eligible for the normal documentation landing gate, and no implementation is claimed complete. F-credits still requires a different-model Tier 1 review under D-151. No owner question, price enablement or production mutation is requested by this documentation change.
9. **Ownership gate now exists.** Main `a8a754e8` landed `scripts/scope-check.mjs`. Each proposed child row now declares `owns` copied from §5's explicit paths, with no open-ended primitive expansion. These foundation entries are file ownership, not surface-switch allowances; import-only, formatting-only and conditional-test restrictions still require review against §5. The checker enforces paths, not those finer semantic restrictions. The packet-only parent deliberately remains without `owns` and with `packet: null`, as on main: its automated scope check reports a skip, not verified ownership. The independent review must manually confirm its diff is only this packet, the authorized assignment changes and the CEO-authorized F-flags amendment in `docs/plans/D-048-phase-3-split.md`. Child ownership enforcement starts after their rows land on main, because the checker reads main's assignments, never a branch's self-declared scope. No checker or schema change is authorized here.

## 1. Goal

Phase 3 fans out to up to 13 lanes at once, and what makes that unsafe is a short list of shared files. This packet removes those files from every surface's reach before anyone fans out:

1. **One flag module** — `client/src/lib/goalSurfaces.ts`, with every surface id pre-declared, a `RELEASED` list in code, and the three `goalFlags.ts` landing/sign-in flags folded in; the cost-only compatibility export remains in `goalFlags.ts` until the D-132 enable. Releasing a page becomes a one-line code change instead of a workflow edit, which is what makes 40 surfaces and eight release waves possible (and keeps production equal to the code on the main SHA, D-097).
2. **Primitives** — audit what `#360` and `#362` landed and promote the rest, so a surface never edits `components/goal/**`.
3. **A test harness and captures** — one way to render a goal surface signed in, as a seeker or a verified referrer, at 1280 and 390, from synthetic fixtures.
4. **Shell meta and the credits pill** — `useGoalShellMeta` and `useCreditBalance`, so a surface never edits `AppShell.tsx`, and the pill never shows on a referrer route.
5. **A fetch-free frame** — `GoalStaticFrame` for the 12 prerendered public pages, so a goal page cannot fetch on `/terms` or `/privacy`.
6. **A readable router** — one `<Route>` per line, ending the one-line conflict for every feature lane that adds a route (`#384` did).

None of the six changes what a user sees, except `F-credits` fixing the pill on four referrer routes (§3 fact 4) — which is a defect fix, pinned by `appShell.test.tsx`.

## 2. Binding rules (quoted, not paraphrased)

- D-134, "How rows enter the picker" (`docs/plans/D-048-phase-3-split.md`): "The foundation packet (`D-048-phase-3`) adds the `D-048-F-*` rows exactly as listed below, with its own packet path, in the pull request that lands the packet." The six are `D-048-F-flags`, `D-048-F-primitives`, `D-048-F-harness`, `D-048-F-credits`, `D-048-F-static-frame`, `D-048-F-routes` (`D-048-F-typescale` is already in the list and done).
- D-134, rulings: "A packet's pull request adds exactly the rows a CEO-written packet lists for it (this file, or `docs/plans/D-132-pricing-v2.md`), as that packet gives them, and sets the packet-only row to done. This is the one exception to "only Claude Code adds rows"; the order stays the packet's."
- D-134, rulings ("Tests"): "A task may edit an existing test only when that test is in its owned paths (the foundation rows own the shell, boundary, token-audit, route and prerender tests they change); every other existing test stays byte-identical."
- D-134, rulings ("Workflows"): "The F-flags flags-on build step (`VITE_GOAL_SURFACES=all pnpm build` in the required production build job) ... and F-flags may remove the two landing flag lines from `.github/workflows/deploy-pages.yml`; this file is their packet's authorization (DELEGATION never-do 9). No other row edits a workflow."
- The split, "The method" 3: "Every page lands dark: the goal version lives in new files under `client/src/pages/goal/<id>/`; the existing page file gets only a three-line switch ... kit components and kit tests are never edited or deleted."
- The split, "Bug controls": "Test-mode rule: under vitest, `goalSurfaceOn` ignores `RELEASED` and reads only `VITE_GOAL_SURFACES` (empty by default). Releasing an id therefore never makes unedited kit tests render the goal page."
- AGENTS.md 0a: "Silent failure is a defect." (Why a failed balance load says so and never shows 0.)
- D-055: "Referrers never pay and are never paid" — the shell shows no credits pill on any referrer surface, decided by the server's verified-referrer verdict, never by the session's emails.
- Note (Oct 24): D-055's "never pay" half is narrowed, not reversed: D-196 (owner, Oct 24 12:56) makes an opt-in referrer plan with level-matched first access the current rule - basic referring stays free, the never-PAID payout core stands, and D-006/D-040 stand (nobody buys a referral, a ranking of people, inbox placement or seeker access; no outcome is ever guaranteed), narrowed only to admit D-196's referrer-side level-matched first access - first access, never a guaranteed referral or result. Not registered or enabled; prices, the plan's contents and the window are open (the free-3 allowance and D-181's agent-spendability are untouched). The no-credits-pill rule guards against advertising an unimplemented benefit only.
- D-082: "Push to `main` only when `main`'s latest CI is green ... open a pull request first, a draft for Tier 1, and wait for every check."

## 3. Current behaviour (verified on `main` `cd4c58bd`)

1. At current main `a8a754e8`, `client/src/lib/goalFlags.ts` holds five build-time flags: `GOAL_UI_LANDING`, `GOAL_UI_SIGNIN`, `GOAL_UI_LANDING_V9`, `ASK_LEVEL_COST_CLIENT` and `PLAN_FAMILY_V2_CLIENT` (lines 4–8). `client/src/lib/goalSurfaces.ts` and `client/src/lib/planFamilyFlag.ts` do not exist. The ask-cost flag stays unchanged in the cost-only compatibility module under correction 2.
2. `.github/workflows/deploy-pages.yml:56–57` sets `VITE_GOAL_UI_LANDING: "true"` and `VITE_GOAL_UI_LANDING_V9: "true"`. `.github/workflows/ci.yml:61–73` has the required `production build` job, which runs `pnpm build` with no `VITE_GOAL_SURFACES`.
3. `.env.example` declares `VITE_GOAL_UI_LANDING` (252), `VITE_GOAL_UI_LANDING_V9` (253), `VITE_PLAN_FAMILY_V2` (256) and `VITE_GOAL_UI_SIGNIN` (262). `VITE_GOAL_SURFACES` is absent.
4. `client/src/components/AppShell.tsx`: `REFERRER_SURFACE = /^\/(queue|referrer(\/|$))/` (23) misses `/referrer-home`, `/referrer-setup`, `/verify` and `/post-opportunity`, so the live pill renders on those four; `activeNav` (28) and `PAGE_TITLES` (35) own the nav id and page title; the credit-balance query is inline (75–94) and passed to `GoalShell` (118–129), while `client/src/hooks/useCreditBalance.ts` (landed with `#360`) is a second copy of the same query and neither is the only one. `useCreditBalance.test.ts` does not exist.
5. `client/src/components/goal/index.ts` exports 20+ primitives, including `GoalListRow`, `GoalStates`, `GoalReasonInput`, `GoalAppShell`, `GoalShell`, `GoalDrawer`, `GoalSheet`, `GoalDecisionBar`, `GoalPassReasons`, `GoalDetailPane`, `GoalLockedPanel`, `GoalFilterChip`, `GoalSearchInput`, `GoalField`, `GoalNum`, `GoalKeycap`, `GoalStatus` and `useOnlineStatus`.
6. `GoalShellProps` (`client/src/components/goal/GoalShell.tsx:20–33`) is `{ active, verifiedReferrer, pageTitle, credits, account, alertsHref, showAlerts?, giveReferralHref?, hideBottomBar?, drawer?, children }`, and `GoalShellCredits` is `{state:"ready",count} | {state:"loading"} | {state:"error",onRetry} | null`. This is the frozen contract: it does not change in these six rows.
7. `client/src/components/goal/goalBoundary.test.ts:11` `ALLOWLIST` is one regex covering `components/goal/`, three landing/sign-in pages, `ComponentShowcase` and all test files; `MOVED_SURFACES` (14) is an explicit set. There is no reverse check: a goal file importing `components/kit` or `styles/kit.css` is not refused.
8. `scripts/designTokenAuditCore.mjs:24` `GOAL_SCOPE = /^client\/src\/components\/goal\//` — `pages/goal/**` is not audited yet.
9. `client/src/test/goalShellHarness.tsx` does not exist, and there is no shared way to render a goal surface signed in. `scripts/kit-screens/capture.mjs` has no `--goal` or `--ids` support; `scripts/kitScreenFixtures.test.ts` exists, and `scripts/kit-screens/fixtures/00_goal-*.json` does not (0 files).
10. `client/src/App.tsx` imports `PLAN_FAMILY_V2_CLIENT` from `@/lib/goalFlags` (14). The whole router is one line: `function Router(){return ...<Switch><Route path="/" component={Home}/>...` (121) with 95 `<Route>` elements at current main (count with `/<Route(?=\s|>)/g`); preserve the ordered inventory, not a historical line-length target.
11. `scripts/prerender-public-pages.tsx` owns what gets prerendered: `PUBLIC_PAGES` (page modules: the policy and company pages plus every guide) and `publicSnapshots()` (fetch-free markup for `/jobs`, `/explore`, `/wall`, `/premium`, `/plans`, `/referrer` and the rest), each titled and described from `@shared/publicRoutes.ts`; `scripts/prerenderPublicPages.test.ts` covers them. `GoalStaticFrame` does not exist, and nothing yet proves a goal frame renders one of these pages without fetching.
12. The `/explore`, `/requests` and shell rows already import goal components without a flag (`MOVED_SURFACES`), so any change here is measured against live pages, not only against dark ones.

## 4. The six rows

| Row | Lane | Depends on | Tier | Branch slug | Flag in production |
|---|---|---|---|---|---|
| `D-048-F-flags` — one flag module, `goalSurfaces.ts`, `RELEASED`, test-mode rule, landing/sign-in flags folded in with a cost-only `goalFlags.ts` retained, boundary reverse check, token-audit scope, flags-on CI build | `design-core` | `D-048-phase-3` (done with this packet) | 2 | `agent/queue/d048-f-flags` | creates the mechanism; production keeps exactly today's pages (`home` released, every other id off); `deploy-pages.yml` never passes `VITE_GOAL_SURFACES` |
| `D-048-F-primitives` — audit and promote the primitives the surface rows need | `design-core` | `D-048-F-flags` | 2 | `agent/queue/d048-f-primitives` | none: primitives render only inside flagged surfaces and the DEV-only `/components` page |
| `D-048-F-harness` — shared goal test harness, `capture.mjs --goal`, synthetic `00_goal-*.json` fixtures, capture checklist | `design-core` | `D-048-p3-w0-shell` (done) | 2 | `agent/queue/d048-f-harness` | none (tests and tooling) |
| `D-048-F-credits` — `useGoalShellMeta` and the one credit balance, pill on seeker routes only | `design-core` | `D-048-F-harness` | **1** | `agent/queue/d048-f-credits` | none: the live shell keeps its titles and its pill, minus four referrer routes where the pill should never have shown |
| `D-048-F-static-frame` — `GoalStaticFrame` that fetches nothing, for the prerendered pages | `design-core` | `D-048-p3-w0-shell` (done) | 2 | `agent/queue/d048-f-static-frame` | none: imported only by flagged goal pages |
| `D-048-F-routes` — `App.tsx` router, one `<Route>` per line, formatting only | `d048-routes` | `D-048-F-flags` | 2 | `agent/queue/d048-f-routes` | none: no behaviour change, pinned by the route, SEO and lazy-loading tests |

Every row's owned paths are the ones its line in the split's table lists, verbatim; nothing else is in scope. When a row needs one of the shared files above (`App.tsx`, `AppShell.tsx`, `components/goal/**`, `index.css`), this chain owns it and a surface row must not.

## 5. Files (per row)

**`D-048-F-flags`**
- In scope: `client/src/lib/goalSurfaces.ts` (new) · `client/src/lib/goalSurfaces.test.ts` (new) · `client/src/lib/goalFlags.ts` (reduced to the cost-only export, not deleted) · `client/src/lib/planFamilyFlag.ts` (new) · `client/src/pages/Home.tsx` (flag import only) · `client/src/pages/SignIn.tsx` (flag import only) · `client/src/App.tsx` (the `PLAN_FAMILY_V2_CLIENT` import line only) · `.github/workflows/deploy-pages.yml` (remove the two landing lines) · `.github/workflows/ci.yml` (one flags-on build step) · `client/src/components/goal/goalBoundary.test.ts` · `scripts/designTokenAuditCore.mjs` · `scripts/designTokenAudit.test.ts` · `.env.example` · `server/configContract.test.ts` (only if the key needs it).
- Read only: `docs/plans/D-048-phase-3-split.md`, `client/src/lib/utils.ts`.
- Out of scope: any page body, any kit file, `index.css`, and all six cost consumers listed in correction 2. The cost export, its env key and meaning stay unchanged; its later migration belongs to the D-132 enable.

**`D-048-F-primitives`**
- In scope: `client/src/components/goal/GoalListRow.tsx` · `GoalStates.tsx` · `GoalReasonInput.tsx` · `index.ts` · `goalAtoms.test.tsx` · `goalComposites.test.tsx` (plus any new primitive file the audit proves necessary, in `components/goal/`).
- Read only: `pages/goal/**` as it lands (none yet), the split's per-surface rows for what each surface needs.
- Out of scope: every existing page, `GoalShell.tsx`'s prop contract.

**`D-048-F-harness`**
- In scope: `client/src/test/goalShellHarness.tsx` (new) · `client/src/test/goalShellHarness.test.tsx` (new) · `scripts/kit-screens/capture.mjs` · `scripts/kit-screens/fixtures/00_goal-*.json` (new) · `scripts/kitScreenFixtures.test.ts` · `docs/plans/D-048-capture-checklist.md` (new).
- Out of scope: the kit fixtures the kit tests use (byte-identical), any live page.

**`D-048-F-credits`**
- In scope: `client/src/components/AppShell.tsx` (shell meta and pill only) · `client/src/components/goal/useGoalShellMeta.ts` (new) · `client/src/hooks/useCreditBalance.ts` (the only one) · `client/src/hooks/useCreditBalance.test.ts` (new) · `client/src/components/appShell.test.tsx`.
- Out of scope: `GoalShell.tsx`'s props, `GoalShellCredits`'s shape, any server route (the balance endpoint is read-only here).

**`D-048-F-static-frame`**
- In scope: `client/src/components/goal/GoalStaticFrame.tsx` (new; own import path, not `index.ts`) · `client/src/components/goal/goalStaticFrame.test.tsx` (new) · `scripts/prerenderPublicPages.test.ts`.
- Out of scope: `GoalShell.tsx`, `AppShell.tsx`, every policy page's text.

**`D-048-F-routes`**
- In scope: `client/src/App.tsx` · `client/src/metadataAndRouteLoading.test.ts` · `client/src/appSessionContinuity.test.ts` · `scripts/seoRouteCoverage.test.ts`.
- Out of scope: any route added, removed or re-pathed; any component; the `PLAN_FAMILY_V2_CLIENT` import (that belongs to `F-flags`).

## 6. Steps (per row, one commit each)

### `D-048-F-flags`
1. **`goalSurfaces.ts`.** Declare every surface id the split's table names (`home`, `sign-in`, `inbox`, `queue`, `ask`, `company`, `conversation`, `start`, `onboarding`, `verify`, `plans`, `premium`, `pricing`, `referrer`, `referrer-home`, `invite`, `post-opportunity`, `email-review`, `settings`, `profile`, `alerts`, `messages`, `assistants`, `support`, `landed`, `suggest-company`, `share`, `employer`, `employer-talent`, `employer-billing`, `for-companies`, `admin`, `admin-money`, `admin-people`, `admin-approvals`, `admin-ops`, `developers`, `policy`, `system`, `links`, `home-signed-in`, `discovery`, `public-profile`) with the route pattern each one owns. `goalSurfaceOn(id)` returns `true` only when the id is in `RELEASED` or named in `VITE_GOAL_SURFACES` (`all` means every id), and in test mode (`import.meta.env.MODE === "test"`) it ignores `RELEASED` and reads `VITE_GOAL_SURFACES` only. `RELEASED` starts as `["home"]`.
2. **Fold `goalFlags.ts`.** `GOAL_UI_LANDING` and `GOAL_UI_LANDING_V9` become the `home` id (`Home.tsx` keeps the V9 body); `GOAL_UI_SIGNIN` becomes `sign-in`; `PLAN_FAMILY_V2_CLIENT` moves unchanged to `client/src/lib/planFamilyFlag.ts` and `App.tsx`'s import line follows it. Retain `goalFlags.ts` with only the unchanged `ASK_LEVEL_COST_CLIENT` export and the comment "Cost flag only; it moves with the D-132 enable (D-146)." Do not edit any of its six cost consumers. Keep `VITE_ASK_LEVEL_COST` in `.env.example`. Remove the two flag lines from `deploy-pages.yml`. Add `VITE_GOAL_SURFACES=` to `.env.example` and remove the three `VITE_GOAL_UI_*` keys.
3. **Guards.** `goalBoundary.test.ts` allows `client/src/pages/goal/**` and gains the reverse check (no file under `pages/goal/` imports `components/kit` or `styles/kit.css`); `designTokenAuditCore.mjs` `GOAL_SCOPE` adds `pages/goal/`; `designTokenAudit.test.ts` covers the new scope.
4. **CI.** Add one step to the required `production build` job that builds with `VITE_GOAL_SURFACES=all`, so a fetch or an import error on an unreleased page fails CI before it lands.
Setup: in a fresh worktree run `pnpm install` before the first `pnpm check` (missing local dependencies fail as TS2688/TS5101; REGISTER-520, Oct 24).

5. **Gate.** `pnpm check`, `pnpm vitest run client/src/lib/goalSurfaces.test.ts client/src/components/goal/goalBoundary.test.ts scripts/designTokenAudit.test.ts`, `VITE_GOAL_SURFACES=all pnpm build`, then the full gate.
6. Commit: `Goal surfaces: one flag module with every id pre-declared, RELEASED in code (D-134)`.

### `D-048-F-primitives`
1. Read the split's per-surface owned paths and list, per surface, which parts are not in `components/goal/index.ts` today.
2. Promote what is missing as new files in `components/goal/`, reusing `--g-*` tokens only, and export them from `index.ts`. Do not change `GoalShellProps`.
3. Tests: `goalAtoms.test.tsx` (state and prop rendering) and `goalComposites.test.tsx` (composition, keyboard, disabled reasons).
4. Gate: `pnpm check`, those two files, `node scripts/design-token-audit.mjs`, the full gate.
5. Commit: `Goal primitives: promote what the surface rows need, so no surface edits components/goal (D-134)`.

### `D-048-F-harness`
1. `goalShellHarness.tsx`: `renderGoalSurface(ui, { signedIn, referrer: "verified" | "unverified", credits })` that mocks `@/_core/auth`, `@/hooks/useReferrerAccess`, the credit balance and `wouter`, and wraps the tree in `GoalAppShell`. It must not reach the network: a test that renders a surface with it and asserts `fetch` was never called for access or credits.
2. `capture.mjs --goal <ids> --fixture <file> --viewport both`: capture each id from the synthetic fixture at 1280 and 390 into `design/goal-ui/captures/<id>/`.
3. `00_goal-*.json` fixtures: signed-in seeker, verified referrer, and the states a surface must survive (loading, empty, error, offline). `kitScreenFixtures.test.ts` bans the comps' sample names (`Fernhill Bank`, `Kestrel Pay`, the `R-8F3K2` refs) and the retired pro/max plans.
4. `docs/plans/D-048-capture-checklist.md`: what every capture set must show (the goal line, the one next step, the lock state before acceptance, 1280 and 390).
5. Commit: `Goal harness: one signed-in render path and reproducible captures from synthetic fixtures (D-134)`.

### `D-048-F-credits` (Tier 1)
1. `useGoalShellMeta(path)` returns `{ active: GoalNavId, pageTitle: string }`, moving `activeNav` and `PAGE_TITLES` out of `AppShell.tsx` verbatim, and `AppShell.tsx` uses it.
2. `useGoalShellMeta` also returns `verifiedReferrer` from the server verdict (`shared/referrerAccess.ts` through `@/hooks/useReferrerAccess`), never from the session's emails.
3. `useCreditBalance()` becomes the only balance query: `AppShell.tsx`'s inline `useQuery(["app-shell-credits", ...])` (74–94) moves onto it, keyed the same, and the hook returns `GoalShellCredits` directly (`ready` / `loading` / `error` with `onRetry`).
4. The pill shows on seeker routes only: `REFERRER_SURFACE` becomes a match on `/queue`, `/referrer`, `/referrer-home`, `/referrer-setup`, `/verify`, `/post-opportunity` (or, better, the verdict alone), so those four routes lose a pill they should never have shown. A failed load says so and never shows 0.
5. Tests first: `useCreditBalance.test.ts` (ready, loading, error + retry, no query on a referrer surface) and `appShell.test.tsx` additions (no pill on each of the six referrer paths; a pill on `/explore`; an error state that says so and does not render `0`).
6. Step 4 changes a live surface, so this row needs the independent review Tier 1 requires (`docs/DELEGATION.md` §6) on a draft pull request.
7. Commit: `Shell meta and the one credit balance: no pill on a referrer route, a failed load says so (D-055, D-134)`.

**D-217 (2026-10-27, row unparked).** This row sat `in-review` with no review lock, so the picker could never hand it out and no session could act on it: PR #568 is green at `601a2368` but 481 commits behind. It returns to `todo` with this work list: merge current `main`, keep the matcher for `/referrer-home`, `/referrer-setup`, `/verify` and `/post-opportunity` plus its six-route `appShell.test.tsx` test (with the positive control on a seeker route), then land through the Tier 1 path (D-151; live surface, independent review). `D-048-p3-referrer-home` waits on this row and must not edit `AppShell.tsx` itself.

### `D-048-F-static-frame`
1. `GoalStaticFrame.tsx`: the goal frame with no `useAuth`, no `useQuery` and no router state — a header, a footer and children.
2. `goalStaticFrame.test.tsx`: rendering it with `fetch` spied proves no request; rendering a flag-on surface inside it keeps the same text.
3. `scripts/prerenderPublicPages.test.ts`: prerender with every id on (`VITE_GOAL_SURFACES=all`) and assert every `PUBLIC_PAGES` module and every `publicSnapshots()` entry still renders its text and fetches nothing.
4. Commit: `Goal static frame: a frame that fetches nothing for the prerendered pages (D-134)`.

### `D-048-F-routes`
1. Reformat `function Router()` (121) to one `<Route>` per line, in table order, with the same paths, components and order. No `path`, component or fallback changes; no `lazy()` changes.
2. Gate: `pnpm check`, `client/src/metadataAndRouteLoading.test.ts`, `client/src/appSessionContinuity.test.ts`, `scripts/seoRouteCoverage.test.ts`, `pnpm build` (the route table feeds the prerender).
3. Commit: `App router: one <Route> per line, formatting only (D-134)`.

## 7. Tests to write first (red before the change)

| Row | File · test | Setup | Assertions | Why it fails today |
|---|---|---|---|---|
| `F-flags` | `client/src/lib/goalSurfaces.test.ts` · "releases only what RELEASED lists" | read `RELEASED` | `RELEASED` is exactly `["home"]`; every id in `RELEASED` is a declared id; `goalSurfaceOn("inbox")` is false with `VITE_GOAL_SURFACES` unset | the module does not exist (import fails) |
| `F-flags` | same · "unknown ids are refused" | `goalSurfaceOn("nope")` | throws or returns false by contract, and the declared list has no duplicate routes | no module |
| `F-flags` | same · "test mode ignores RELEASED" | `VITE_GOAL_SURFACES` unset, `MODE=test` | `goalSurfaceOn("home")` is **false** even though `home` is released | no module; and the current flags would render the landing in every test |
| `F-flags` | same · "VITE_GOAL_SURFACES names ids" | `VITE_GOAL_SURFACES="inbox,queue"` | both ids true, `home` false; `all` makes every id true | no module |
| `F-flags` | same · "production still renders the V9 landing" | build-time flags from `deploy-pages.yml` | the `home` id comes from `RELEASED`, not from `VITE_GOAL_UI_LANDING`, and `Home.tsx`'s V9 branch is reached with the flag unset | `Home.tsx` reads `VITE_GOAL_UI_LANDING_V9`, which the workflow sets |
| `F-flags` | `client/src/components/goal/goalBoundary.test.ts` · "no goal file imports kit" | walk `pages/goal/**` | zero files import `components/kit` or `styles/kit.css`; `pages/goal/**` is allowed by `ALLOWLIST` | no reverse check, and `pages/goal/` is not allowed |
| `F-flags` | `scripts/designTokenAudit.test.ts` · "GOAL_SCOPE covers pages/goal" | a fixture path `client/src/pages/goal/x/X.tsx` with a hex colour | the audit reports it | `GOAL_SCOPE` covers `components/goal/` only |
| `F-primitives` | `goalAtoms.test.tsx` / `goalComposites.test.tsx` | new primitives | each renders its states, keyboard and disabled reason | the primitives do not exist |
| `F-harness` | `client/src/test/goalShellHarness.test.tsx` · "no network" | `renderGoalSurface(<p/>, { signedIn: true })` | `fetch` is not called; the tree renders inside `GoalAppShell` | no harness |
| `F-harness` | `scripts/kitScreenFixtures.test.ts` · "00_goal fixtures" | the new fixture files | no comp sample name or retired plan appears; every fixture parses | the files do not exist |
| `F-credits` | `client/src/hooks/useCreditBalance.test.ts` | mocked `/api/credits/summary` | `ready` carries the count, `loading` while pending, `error` carries `onRetry` and never `0` | the hook has no test, and `AppShell` shows its own state |
| `F-credits` | `client/src/components/appShell.test.tsx` · "no pill on a referrer route" | render each of `/queue`, `/referrer`, `/referrer-home`, `/referrer-setup`, `/verify`, `/post-opportunity` | no credits element on any of them; `/explore` still has one | `REFERRER_SURFACE` matches two of the six |
| `F-credits` | same · "a failed balance load says so" | balance `500` | the pill area shows an error with a retry and no `0` | today's error branch exists; pin it through the hook |
| `F-static-frame` | `goalStaticFrame.test.tsx` | `fetch` spy | zero calls; children render; the same text as the shell frame's | the component does not exist |
| `F-static-frame` | `scripts/prerenderPublicPages.test.ts` | `VITE_GOAL_SURFACES=all` | every public page renders and none fetches during prerender | nothing forces the prerender path through a goal frame |
| `F-routes` | `metadataAndRouteLoading.test.ts`, `appSessionContinuity.test.ts`, `seoRouteCoverage.test.ts` | the reformatted table | every one of the 95 current routes still resolves, stays lazy where it was, and the SEO table still covers it | control: they pass before and after; a changed path or order shows up here |

Controls that must stay green, untouched: every kit page test, `loginRule.test.tsx`, `signIn.test.tsx`, `verify.test.tsx`, `referrer.otp.test.tsx`, `kitScreenFixtures.test.ts`'s existing names, `goalBoundary.test.ts`'s existing allowlist intent, `designTokenAudit.test.ts`'s token expectations, and `scripts/d048Split.test.ts`.

## 8. Edge cases and races

- **Test mode is the trap.** If `goalSurfaceOn` honours `RELEASED` under vitest, releasing an id turns unedited kit tests red on `main` (they would render the goal page). The test-mode rule is the fix, and `goalSurfaces.test.ts` pins it in both directions.
- **Two sources of truth for production.** After this chain, production decides from `RELEASED` in code; `deploy-pages.yml` must never pass `VITE_GOAL_SURFACES`. A surface that needs a workflow edit is a defect, not a release.
- **F-flags lands a production-affecting change** (the `home` flag moves from a workflow line to `RELEASED`). Prove the V9 landing still renders in the flags-on CI build, and check skipwait.me after deploy: `<meta name="git-commit">` matches the landing SHA and the landing is still V9.
- **Order.** `F-flags` first: every later row imports from it. `F-primitives` and `F-routes` may run beside `F-harness`; `F-credits` waits for `F-harness` because its tests use it.
- **Shared files.** A surface PR that edits `App.tsx`, `AppShell.tsx`, `components/goal/**` or `index.css` while this chain is open stops and reports to the chain (D-032), rather than merging twice.
- **The pill is a live surface.** `F-credits` is Tier 1 and lands dark-folded: it changes today's shell, so its review reads the six referrer routes and the four states, and its captures exist before it lands.
- **`F-routes` is formatting only.** A diff that changes a path, a component, a fallback or a `lazy()` boundary is out of scope for that row and goes back to the packet.

## 9. Definition of done (every row)

- [ ] Every §7 test for that row was red first and is green now; every control is green and byte-identical.
- [ ] `pnpm check`, the row's focused tests, `node scripts/design-token-audit.mjs` where the row touches UI, `pnpm build` where the row touches the client bundle, and `pnpm quality:gate` pass on the row's commit merged with the latest `origin/main`.
- [ ] `git diff --name-only origin/main...HEAD` stays inside the row's owned paths, plus its own status in `docs/plans/assignments.json` and its own line in §Status here.
- [ ] Pull request open; Tier 1 (`F-credits`) needs the independent review and a draft first; every required check green on that exact commit (D-082).
- [ ] Landed dark: production renders what it rendered yesterday, except the four referrer routes that lose a pill they should never have shown.
- [ ] Status line written here as `<id>: done — <sha>`, and `.env.example` / `configContract` consistent wherever an env key moved.

## 10. Review checklist (independent reviewer, on top of `docs/DELEGATION.md` §6)

- Read `goalSurfaces.ts` end to end: does every id the split's table names have exactly one entry and one route? Is `RELEASED` exactly `["home"]`? Does test mode ignore `RELEASED`?
- Prove production equality: after `F-flags`, is there any path on which production renders a different page than before the change, other than the pill fix?
- Prove the reverse boundary check bites: add a goal file importing `components/kit` in a scratch commit and confirm the test fails.
- `F-credits`: on each of the six referrer routes, is the pill absent, and is it absent because of the server verdict rather than a path list that will rot again? Is the balance query now one hook, with no second `fetch("/api/credits/summary")` anywhere in the client?
- `F-harness`: does the harness make the network impossible, or merely unlikely (a mocked `fetch` that a test can forget)?
- `F-routes`: does the diff contain anything but whitespace and line breaks?
- Confirm no row edited `.github/workflows/*` other than `F-flags`' two authorized files, and no existing test outside the row's owned paths changed by one byte.

## 11. Stop and ask if

- F-flags would require changing any cost consumer, the `ASK_LEVEL_COST_CLIENT` export or `VITE_ASK_LEVEL_COST`; those remain outside this Tier 2 row and belong to the D-132 enable. Report any new flag consumer outside the approved import-edit scope to the CEO before editing it.
- `F-credits` cannot make `useCreditBalance` the only query without changing `GoalShellProps` or the balance endpoint.
- The reverse boundary check or `GOAL_SCOPE` change turns a kit test red for a reason other than the intended one.
- A row finds a seventh shared file that surfaces must edit; report it to the CEO with the evidence (D-032).
- `F-routes` cannot be made formatting-only because a route depends on line order that is not preserved.

## 12. Owner questions

None. Every decision this packet needs is already in the register (D-134, D-097, D-123, D-055) or in the split it executes. The one thing the owner may want to see is the pill fix in `F-credits`, because it removes a visible element from four referrer routes; it is a D-055 correctness fix, reported with captures when that row lands.

## Status

Shared row: the six rows below each write their own line here (D-134); the `D-048` row in §3b is the CEO's to roll up.

- `D-048-phase-3`: packet written — `docs/plans/D-048-foundation.md`, and its pull request adds `D-048-F-flags`, `D-048-F-primitives`, `D-048-F-harness`, `D-048-F-credits`, `D-048-F-static-frame` and `D-048-F-routes` exactly as the split's table lists them — Buffy · 7f51 — 2026-10-22 — branch `agent/queue/d048-foundation-packet`.

- `D-048-phase-3`: current-main reconciliation — GPT · 5deb — 2026-10-23 — integrated with `origin/main` `293c994e`; only this packet and the six authorized assignment rows differ. Focused verification: `d048Split` 4/4, `nextTask` 114/114, `briefContract` 56/56. Full gate evidence is recorded in the PR after completion. Historical hold: resolved by the CEO compatibility amendment below (Oct 23); no product flags changed.

- `D-048-phase-3`: ownership-gate reconciliation — GPT · 5deb — 2026-10-23 — integrated main `a8a754e8`; six child `owns` arrays encode only §5 explicit paths; packet-only parent scope skip documented. Full local gate: check/audits/build/prerender passed; 506 files passed / 4 skipped, 4,364 tests passed / 17 skipped / 0 failed. No runtime file or production flag changed. Historical compatibility hold superseded by the CEO amendment below (Oct 23).

- `D-048-phase-3`: CEO-approved compatibility amendment — GPT · 5deb — 2026-10-23 — integrated with `origin/main` `80ee78a7`; F-flags retains only the unchanged cost export and its lifecycle comment, folds the three landing/sign-in flags into `goalSurfaces.ts`, and leaves all six cost consumers and `VITE_ASK_LEVEL_COST` untouched. The split is amended in this PR under the CEO ruling on PR #483; no implementation, pricing change or flag enablement. Final gate and exact-head CI evidence are recorded on the PR before landing.
- `D-048-F-flags`: landed as 0d8f3bf5 (merge of PR #560) — 2026-10-23 — one flag module `client/src/lib/goalSurfaces.ts` (44 ids incl. `skippy` pre-declared ahead of its split row, `RELEASED = ["home"]`, test-mode rule both directions, unknown ids refused, no duplicate routes), landing/sign-in flags folded in, `goalFlags.ts` reduced to the unchanged cost export plus a compatibility re-export of `PLAN_FAMILY_V2_CLIENT` from the new `planFamilyFlag.ts` (D-134 byte-identical rule: `planFamilyFlagsOff.test.ts` asserts that exact export; deviation from the split's "only the cost export" wording is forced by its own binding test rule and changes no behaviour), boundary reverse check added, `GOAL_SCOPE` covers `pages/goal/**`, flags-on build step in the required production build job, deploy-pages.yml's two landing flag lines removed. Focused gate: goalSurfaces 6/6, goalBoundary 3/3, designTokenAudit 39/39, planFamilyFlagsOff 3/3, d048Split 4/4, token audit clean, `VITE_GOAL_SURFACES=all pnpm build` green. Full-gate and CI evidence on the PR.

- `D-048-F-static-frame`: implemented in PR (branch agent/instinct/d048-f-static-frame), pending CI and merge — not on main yet — 2026-10-23 — `GoalStaticFrame.tsx` (fetch-free frame: header/footer/children, own import path, goal tokens only), `goalStaticFrame.test.tsx` (fetch spy, chrome, token check), `prerenderPublicPages.test.ts` extended (every PUBLIC_PAGES module + snapshot renders fetch-free with `VITE_GOAL_SURFACES=all`). Focused gate: goalStaticFrame 3/3, prerenderPublicPages 23/23, goalBoundary 3/3, token audit clean.

- `D-048-F-routes`: done — 17cab0c4 — 2026-10-24 — `Router()` reformatted to one `<Route>` per line (95 route elements, same paths/components/order; JSX body proven whitespace-identical); the `/notifications` redirect stays inline so `server/notificationCenterUi.test.ts` (not an owned path) is untouched; `metadataAndRouteLoading.test.ts`'s Suspense pin follows the reformat. Gate: `pnpm check`, 16/16 focused (metadata and route loading, app session continuity, SEO route coverage, notification center), `pnpm build` (prerender ran), full `pnpm quality:gate` green on 17cab0c4 merged with main; scope-check clean; conflict probe adds no conflicts. PR #633.
