# Packet D-048 phase 3: admin and developer surfaces

> Read `docs/BRIEF.md` first, then this packet and `docs/plans/D-048-phase-3-split.md`. This is a **packet-only Tier 3 architecture task**: it adds the admin/developer cluster rows to the queue. It does not implement the UI.

| Field | Value |
|---|---|
| Queue row | `D-048` (phase 3; shared row; this packet writes its own status line only) |
| Packet task | `D-048-P-admin` |
| Decisions | D-040, D-134, D-149, D-150 (whole-platform direction, owner-verified Oct 21-23), D-153 |
| Risk tier | 3 (docs/queue metadata only; the implementation rows below are Tier 1 or 2 as stated) |
| Branch | `agent/architect/d048-p-admin` |
| Depends on | `D-048-phase-3` (landed foundation packet) |
| Adds | `D-048-p3-admin`, `D-048-p3-admin-money`, `D-048-p3-admin-people`, `D-048-p3-admin-approvals`, `D-048-p3-admin-ops`, `D-048-p3-dev` |

## 1. Goal and binding rules

Move the admin and developer surfaces to the goal system like every other surface (D-150): each admin page opens with the admin's goal and one next step. Admin goals are operational (review, decide, reconcile), and density stays functional — the goal system at operational density, not a marketing pass. Money, identity and privacy actions keep their audit trail and confirm steps exactly; admin money/identity surfaces are Tier 1. Several admin pages carry heavy inline colour (AdminCatalogSync holds roughly 40 hex literals on main — the repo's worst token-audit offender); status becomes dot+text with token colours everywhere.

> **D-048 split method is binding:** a surface adds a switch only in its existing page file; its goal implementation lives under `client/src/pages/goal/<id>/`; API/data/auth modules are read-only; no surface edits `App.tsx`, `AppShell.tsx`, `client/src/components/goal/**`, `index.css`, `kit.css`, `components/kit/**`, hooks, shared, server, decisions, or the shared plan row. If a required shared change is discovered, stop and report it to the design-core/CEO lane with evidence.

## 2. Current behavior verified on `main` (dd849c48)

- `client/src/pages/AdminOverview.tsx` and `AdminReview.tsx` are the queue surfaces; `AdminApprovalQueue.tsx` and `AdminApprovalRecord.tsx` are approval money-cost consumers named in the F-flags compatibility amendment — their money-cost lines are Tier 1 and outside flag moves.
- `client/src/pages/AdminPaymentsReview.tsx`, `AdminCatalogSync.tsx`, `AdminTokenRecovery.tsx` are the money-ops surfaces (`components/admin/paymentReviewCopy.ts` read-only).
- `client/src/pages/AdminUsers.tsx` (suspension, identity) and `AdminPrivacyRequests.tsx` are the people surfaces.
- `client/src/pages/AdminActivity.tsx`, `AdminFlowHealth.tsx`, `AdminSchema.tsx`, `AdminSmoke.tsx`, `AdminPartners.tsx` are the ops surfaces. `/admin/money-check` (`AdminMoneyCheck.tsx`) is owned switch-only by `D-048-p3-admin-money` (owns amendment, D-167; see §10); its three POST calls (`/api/admin/money-check/close-abandoned` at `AdminMoneyCheck.tsx:21`, `/api/admin/alerts/test` at `:36`, `/api/admin/money-check/run` at `:46`) and its status read (`/api/admin/money-check/status` at `:30`) are preserved exactly. `/admin/skippie` (`AdminSkippie.tsx`) exists as a route; see §10.
- `client/src/pages/Developers.tsx` and `DeveloperConsole.tsx` (app registration) are the developer surfaces; Tier 1 until the builder proves no secret is shown.
- `docs/plans/D-048-phase-3-split.md` rows `D-048-p3-admin*` and `D-048-p3-dev` are the authoritative row contract and owned-path list.

## 3. Surface contracts and exact queue rows

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-admin` | W6 `/admin` and `/admin-review` plus the admin goal frame the other admin tasks import read-only | `d048-admin` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-admin` | 2 | `goalSurfaceOn('admin')`; read-only: `components/admin/adminApi.ts` | `client/src/pages/AdminOverview.tsx` (switch only); `client/src/pages/AdminReview.tsx` (switch only); `client/src/pages/goal/admin/**`; `scripts/kit-screens/fixtures/*__goal-admin-*.json`; `design/goal-ui/captures/admin/**` |
| `D-048-p3-admin-money` | W6 `/admin/payments`, `/admin/catalog-sync`, `/admin/token-recovery` and `/admin/money-check` (D-167) | `d048-admin-money` | `D-048-p3-admin` | 1 | `goalSurfaceOn('admin-money')`; read-only: `components/admin/paymentReviewCopy.ts` | `client/src/pages/AdminPaymentsReview.tsx` (switch only); `client/src/pages/AdminCatalogSync.tsx` (switch only); `client/src/pages/AdminTokenRecovery.tsx` (switch only); `client/src/pages/AdminMoneyCheck.tsx` (switch only); `client/src/pages/goal/admin-money/**`; `design/goal-ui/captures/admin-money/**` |
| `D-048-p3-admin-people` | W6 `/admin/users` (suspension, identity) and `/admin/privacy-requests` | `d048-admin-people` | `D-048-p3-admin` | 1 | `goalSurfaceOn('admin-people')` | `client/src/pages/AdminUsers.tsx` (switch only); `client/src/pages/AdminPrivacyRequests.tsx` (switch only); `client/src/pages/goal/admin-people/**`; `design/goal-ui/captures/admin-people/**` |
| `D-048-p3-admin-approvals` | W6 `/admin/approvals` and `/admin/approvals/:kind/:id` (re-tier to 1 if the builder finds identity or money decisions) | `d048-admin-approvals` | `D-048-p3-admin` | 2 | `goalSurfaceOn('admin-approvals')`; read-only: `lib/adminApproval.ts` | `client/src/pages/AdminApprovalQueue.tsx` (switch only); `client/src/pages/AdminApprovalRecord.tsx` (switch only); `client/src/pages/goal/admin-approvals/**`; `design/goal-ui/captures/admin-approvals/**` |
| `D-048-p3-admin-ops` | W6 `/admin/activity`, `/admin/flow-health`, `/admin/schema`, `/admin/smoke`, `/admin/partners` | `d048-admin-ops` | `D-048-p3-admin` | 2 | `goalSurfaceOn('admin-ops')` | `client/src/pages/AdminActivity.tsx` (switch only); `client/src/pages/AdminFlowHealth.tsx` (switch only); `client/src/pages/AdminSchema.tsx` (switch only); `client/src/pages/AdminSmoke.tsx` (switch only); `client/src/pages/AdminPartners.tsx` (switch only); `client/src/pages/goal/admin-ops/**`; `design/goal-ui/captures/admin-ops/**` |
| `D-048-p3-dev` | W6 `/developers` and `/developer-console` (app registration; Tier 1 until the packet proves no secret is shown) | `d048-dev` | `D-048-F-static-frame`, `D-048-F-primitives`, `D-048-P-admin` | 1 | `goalSurfaceOn('developers')` | `client/src/pages/Developers.tsx` (switch only); `client/src/pages/DeveloperConsole.tsx` (switch only); `client/src/pages/goal/developers/**`; `design/goal-ui/captures/developers/**` |

Design acceptance notes (design proposals, executable under the doctrine; not new frozen owner decisions): `/admin` opens "See what needs a decision." with the oldest pending item as the next step. Approvals open "Decide this approval." with the decision as the one commit. Money-ops opens "Keep the money truthful." with the flagged discrepancy first. People surfaces open "Act on people requests." with suspension/identity confirms unchanged. Ops surfaces are read-mostly: goal line + honest dot+text status; AdminCatalogSync's inline-hex status colours become token dot+text.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-admin.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. Money, identity and privacy actions keep their exact audit trail, confirm steps and server calls; the reskin changes presentation only.
2. No inline hex survives; status is dot+text with tokens. AdminCatalogSync is the reference cleanup case (~40 literals).
3. AdminApprovalQueue/Record money-cost lines are Tier 1 (F-flags amendment): no cost-line edits; `AdminMoneyCheck` content is read-only ops data: the row owns only its switch (`AdminMoneyCheck.tsx`, switch only), and the page's report content, actions and the three POST calls (`:21`, `:36`, `:46`) stay byte-identical in behaviour.
4. Developer console: if any secret value is renderable, the row stops and reports before reskinning (Tier 1 condition).
5. Preserved kit assertions plus goal-on assertions for loading/empty/error states; fixtures use synthetic data only, never real user records.

## 5. Red-first tests and gate

Each builder records focused failing tests first. Minimum pins: goal flag-off parity; goal-on render; loading/empty/error states; confirm steps on money/identity actions; no-secret proof for the dev console; token audit clean. Required gate per PR: `pnpm check`; focused Vitest files; `node scripts/design-token-audit.mjs`; `VITE_GOAL_SURFACES=all pnpm build`; `pnpm quality:gate`; 1280+390 captures. Tier 1 rows open a draft PR with independent review (D-151); Tier 2 rows follow the green-CI landing protocol.

## 6. Definition of done

- Only the row's owned paths changed; read-only imports unchanged; `git diff --check` clean.
- Goal surface passes the contract, focused tests and full gate on a branch merged with current `origin/main`.
- Captures at both viewports; no production flag enabled; audit-trail behaviour unchanged.
- Tier 1 builder opens a draft PR, reports `review` with exact head, and stops.

## 7. Review checklist

Reviewer records the exact head; checks scope against `owns`; reproduces red-first tests; verifies no audit-trail change, no cost-line edit, no inline hex, the no-secret proof, goal-on and flag-off behaviour, captures at both sizes, exact-head CI.

## 8. Stop and report

Stop with a pushed status/report if a cited function or route no longer exists, a focused test fails unexplained, a required change falls outside `owns`, a secret is renderable in the dev console, or a money/identity/privacy decision is not already decided. Never guess; report the concrete file/line.

## 9. Owner questions

None. The owner's whole-platform direction (verified Oct 21-23) includes admin/developer surfaces; this packet makes no new product or money ruling.

## 10. Named route coverage (94-route assignment)

`/admin/money-check` (read-only money ops report) is covered by `D-048-p3-admin-money`'s goal styling (same audience, same data class; no behaviour change) through that row's switch-only owns entry `client/src/pages/AdminMoneyCheck.tsx` (owns amendment; D-167 and `docs/plans/D-048-phase-3-split.md:130` already list the route; `GOAL_UI_COVERAGE.md:124` and `:233` assign it to this row). The switch preserves the page's three POST calls exactly: `/api/admin/money-check/close-abandoned` (`AdminMoneyCheck.tsx:21`), `/api/admin/alerts/test` (`:36`) and `/api/admin/money-check/run` (`:46`). The money-check switch plus its goal page under `client/src/pages/goal/admin-money/**` is NEW Tier 1 work: red-first pins, captures at 1280 and 390, and an independent review of its exact head; this amendment registers ownership only and implements nothing. `goalSurfaces` already maps the route, so `goalSurfaceOn('admin-money')` must not be turned on before that switch lands, or the flag would wrap goal error/PWA chrome around the kit body. `/admin/skippie` (assistant ops) is covered by `D-048-p3-admin-ops` (ops surface). If a builder finds either route renders layout the named row's goal parts cannot carry, it stops and reports for a row amendment instead of guessing.

## Status

`D-048-P-admin`: prepared by design lane (AYO-11) — pending coordinator landing — 2026-10-23 — branch `agent/architect/d048-p-admin`

`D-048-P-admin`: landed by the coordinator — 2026-10-23 — landing branch `agent/instinct/d048-p-admin-packet`. Canonical candidate; the empty claim marker branch `agent/architect/d048-p-admin` (Claude Code · e11c) is preserved and the overlap is announced in the PR.

`D-048-p3-dev`: done — `a199b499` — Gemini 2.5 Pro · 7bb6 — 2026-10-31 — goal `/developers` and `/developer-console` behind `goalSurfaceOn('developers')`: independent Tier 1 delta review pass by Claude · fdc8 on `a199b499` (report `ffff0a75`); 35/35 focused tests, design tokens clean, scope check clean; required CI green.

`D-048-p3-admin`: unblocked by D-284 — 2026-11-03 — the block is registration, not a defect: this packet already names `components/admin/adminApi.ts` read-only (`:34`) and the split method makes API/data modules read-only (`:19`), so the two boundary offenders only needed the D-241 audited list, which lives in a test outside the row. The row now owns `client/src/test/goalPagesBoundary.test.ts`, `client/src/lib/goalSurfaces.ts` and `client/src/components/goal/wrapper/appWrapper.goal.test.tsx`; on the row's own branch, admit `components/admin/adminApi.ts` and `components/admin/reviewCases.ts` as `behavior-only` AUDITED entries, and move `"/admin-review"` from `admin-approvals` to `admin` (the stale line predates the split; `ErrorBoundary.tsx:13` rendered legacy chrome on the goal review queue) with the wrapper route test pinning both lookups. Measured: 2 failed/35 passed before, 117/117 after, `pnpm check` 0. The row stays Tier 2 and `todo` — no status change is needed. The original claim that no separate reviewer was owed is withdrawn: this technical registration does not expand Instinct's actual routine-merge permission. For #978 coordinated under that arrangement, preserve separate review on the final version, all required tests, current-main verification and no admin bypass, using the existing distinct normal-procedure lander. D-151's different-model restriction remains Tier 1-specific. This is not a new global founder merge rule. The counts above remain the original author's report, not acceptance of a later head. Preserve live ownership and unpublished work before branch edits.

`D-048-p3-admin`: review — Hark · 5de4 — 2026-11-03 — branch `agent/queue/d048-p3-admin`, draft PR #978 at `e82cad41`, merged with `main` `fa462f69` (`8c7fb9b1`); the D-284 registration above is done on the branch: red first at `2540b1ce` (3 failed / 46 passed), code at `e82cad41` (49/49; 98/98 with goalSurfaces, admin goal, adminReview, adminOverview); CI run 41545897900 green on `e82cad41`. Registry status stays `todo`. Needs a separate final-head reviewer against current `main` and a distinct lander; Hark's underlying model unverified, no D-151 independence claim; D-284 waiver not relied on.

`D-048-p3-admin`: done — `06d074f3` (#978) — Dev (Skydive) · 66e2 — 2026-11-03 — the ordinary lander per the picker's LAND hand-out and the owner's #978 handoff request (holder 64b5 quiet since 09:38 IST, D-085). The merge-up the owner asked for is done by the lander: `origin/main` `cc167adf` (which carries D-285) merged into `agent/queue/d048-p3-admin` (`06d074f3`), and the reviewed patch is preserved — `git diff fa462f69..2aff9c1e` equals `git diff cc167adf..06d074f3` over the row's paths (identical patch, md5 16591b1cf4eb3c93348ebbe4fdb62b6d), so no source changed since Hark's reviewed head `859b9ea8` beyond main's already-landed content and empty takeover markers. Gate on the exact head: `pnpm check` 0; full `pnpm vitest run` (HOME isolated, maxWorkers=1) 5860 passed / 0 failed / 18 skipped; `scope-check D-048-p3-admin` 8 owned paths clean; `decision-id-check` clean; `design-token-audit` OK. CI on `06d074f3` all green (typecheck, unit+component+route, production build, e2e journeys, Workers Builds). Same-goal conflict probe: nonzero only against parked/done branches (d048-dark-mode owner-held D-230, d048-p3-employer-talent owner-parked D-285, d048-f-flags and d048-p3-referrer done-row stale branches); none has an active landing. D-284's admissions (AUDITED adminApi.ts/reviewCases.ts, "/admin-review" moved to admin with the wrapper pin) are on the branch. Landing: main fast-forwarded to `06d074f3` under D-082; row status done. D-151 does not apply (Tier 2); the D-284 separate-review condition is recorded as carried by Hark's review of `859b9ea8` plus the lander's byte-identical-patch proof, per the owner's handoff procedure.
