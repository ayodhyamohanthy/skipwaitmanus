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
- `client/src/pages/AdminActivity.tsx`, `AdminFlowHealth.tsx`, `AdminSchema.tsx`, `AdminSmoke.tsx`, `AdminPartners.tsx` are the ops surfaces. `/admin/money-check` (`AdminMoneyCheck.tsx`) and `/admin/skippie` (`AdminSkippie.tsx`) exist as routes; see §10.
- `client/src/pages/Developers.tsx` and `DeveloperConsole.tsx` (app registration) are the developer surfaces; Tier 1 until the builder proves no secret is shown.
- `docs/plans/D-048-phase-3-split.md` rows `D-048-p3-admin*` and `D-048-p3-dev` are the authoritative row contract and owned-path list.

## 3. Surface contracts and exact queue rows

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-admin` | W6 `/admin` and `/admin-review` plus the admin goal frame the other admin tasks import read-only | `d048-admin` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-admin` | 2 | `goalSurfaceOn('admin')`; read-only: `components/admin/adminApi.ts` | `client/src/pages/AdminOverview.tsx` (switch only); `client/src/pages/AdminReview.tsx` (switch only); `client/src/pages/goal/admin/**`; `scripts/kit-screens/fixtures/*__goal-admin-*.json`; `design/goal-ui/captures/admin/**` |
| `D-048-p3-admin-money` | W6 `/admin/payments`, `/admin/catalog-sync`, `/admin/token-recovery` | `d048-admin-money` | `D-048-p3-admin` | 1 | `goalSurfaceOn('admin-money')`; read-only: `components/admin/paymentReviewCopy.ts` | `client/src/pages/AdminPaymentsReview.tsx` (switch only); `client/src/pages/AdminCatalogSync.tsx` (switch only); `client/src/pages/AdminTokenRecovery.tsx` (switch only); `client/src/pages/goal/admin-money/**`; `design/goal-ui/captures/admin-money/**` |
| `D-048-p3-admin-people` | W6 `/admin/users` (suspension, identity) and `/admin/privacy-requests` | `d048-admin-people` | `D-048-p3-admin` | 1 | `goalSurfaceOn('admin-people')` | `client/src/pages/AdminUsers.tsx` (switch only); `client/src/pages/AdminPrivacyRequests.tsx` (switch only); `client/src/pages/goal/admin-people/**`; `design/goal-ui/captures/admin-people/**` |
| `D-048-p3-admin-approvals` | W6 `/admin/approvals` and `/admin/approvals/:kind/:id` (re-tier to 1 if the builder finds identity or money decisions) | `d048-admin-approvals` | `D-048-p3-admin` | 2 | `goalSurfaceOn('admin-approvals')`; read-only: `lib/adminApproval.ts` | `client/src/pages/AdminApprovalQueue.tsx` (switch only); `client/src/pages/AdminApprovalRecord.tsx` (switch only); `client/src/pages/goal/admin-approvals/**`; `design/goal-ui/captures/admin-approvals/**` |
| `D-048-p3-admin-ops` | W6 `/admin/activity`, `/admin/flow-health`, `/admin/schema`, `/admin/smoke`, `/admin/partners` | `d048-admin-ops` | `D-048-p3-admin` | 2 | `goalSurfaceOn('admin-ops')` | `client/src/pages/AdminActivity.tsx` (switch only); `client/src/pages/AdminFlowHealth.tsx` (switch only); `client/src/pages/AdminSchema.tsx` (switch only); `client/src/pages/AdminSmoke.tsx` (switch only); `client/src/pages/AdminPartners.tsx` (switch only); `client/src/pages/goal/admin-ops/**`; `design/goal-ui/captures/admin-ops/**` |
| `D-048-p3-dev` | W6 `/developers` and `/developer-console` (app registration; Tier 1 until the packet proves no secret is shown) | `d048-dev` | `D-048-F-static-frame`, `D-048-F-primitives`, `D-048-P-admin` | 1 | `goalSurfaceOn('developers')` | `client/src/pages/Developers.tsx` (switch only); `client/src/pages/DeveloperConsole.tsx` (switch only); `client/src/pages/goal/developers/**`; `design/goal-ui/captures/developers/**` |

Design acceptance notes (design proposals, executable under the doctrine; not new frozen owner decisions): `/admin` opens "See what needs a decision." with the oldest pending item as the next step. Approvals open "Decide this approval." with the decision as the one commit. Money-ops opens "Keep the money truthful." with the flagged discrepancy first. People surfaces open "Act on people requests." with suspension/identity confirms unchanged. Ops surfaces are read-mostly: goal line + honest dot+text status; AdminCatalogSync's inline-hex status colours become token dot+text.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-admin.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. Money, identity and privacy actions keep their exact audit trail, confirm steps and server calls; the reskin changes presentation only.
2. No inline hex survives; status is dot+text with tokens. AdminCatalogSync is the reference cleanup case (~40 literals).
3. AdminApprovalQueue/Record money-cost lines are Tier 1 (F-flags amendment): no cost-line edits; `AdminMoneyCheck` content is read-only ops data.
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

Two admin routes have no split row: `/admin/money-check` (read-only money ops report) and `/admin/skippie` (assistant ops). This packet names `/admin/money-check` covered by `D-048-p3-admin-money`'s goal styling (same audience, same data class; no behaviour change) and `/admin/skippie` covered by `D-048-p3-admin-ops` (ops surface). If a builder finds either renders layout the named row's goal parts cannot carry, it stops and reports for a row amendment instead of guessing.

## Status

`D-048-P-admin`: prepared by design lane (AYO-11) — pending coordinator landing — 2026-10-23 — branch `agent/architect/d048-p-admin`

`D-048-P-admin`: landed by the coordinator — 2026-10-23 — landing branch `agent/instinct/d048-p-admin-packet`. Canonical candidate; the empty claim marker branch `agent/architect/d048-p-admin` (Claude Code · e11c) is preserved and the overlap is announced in the PR.
