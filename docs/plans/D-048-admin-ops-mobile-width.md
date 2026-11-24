# D-048 admin operations: bound phone content to the viewport

| Field | Contract |
|---|---|
| Task | `D-048-admin-ops-mobile-width` |
| Row / epic | `D-048` / `D-048-p3` |
| Tier / lane | 2 / `d048-admin-ops-mobile-width` |
| Branch | `agent/queue/d048-admin-ops-mobile-width` |
| Decisions checked | D-150, D-167, D-332, D-352, D-365, D-366 |
| Depends on | None: repairs the already released goal implementation |

## Goal and authority

Restore the existing goal UI's responsive contract on `/admin/flow-health` and `/admin/schema`; no redesign or new product behavior. This is a routine correctness follow-up under D-150/D-167 and D-200, registered from measured retirement QA. It adds no owner decision. Admins must be able to read the figures and statement outcomes without content escaping a phone viewport. No new funnel or analytics event is introduced.

## Reproduction and proof

November 19, 2026, `D-048-K-admin-ops` / PR #1332, synthetic local Chromium. Baseline runtime `57cc382a` and retired runtime `e4932b36` produce all 36 PNG pairs byte-identically. The issue therefore predates the retirement source delta. It is a P2 internal-admin layout follow-up, not a new regression or an authorization/money failure, and does not hold that behavior-preserving retirement.

At a real **390×844@2x** viewport the full-document PNG should be 780 pixels wide. The following captures exceed that width:

| State / screenshot | PNG width | Relevant source |
|---|---:|---|
| `goal-admin-ops-flow-health-default-390.png` | 1464 | `client/src/pages/goal/admin-ops/GoalAdminFlowHealth.tsx`, `GoalFlowBaselinePanel.tsx`, `goalOpsParts.tsx` |
| `goal-admin-ops-flow-health-no-baseline-390.png` | 1140 | `GoalAdminFlowHealth.tsx`, `goalOpsParts.tsx` |
| `goal-admin-ops-schema-pending-390.png` | 1270 | `client/src/pages/goal/admin-ops/GoalAdminSchema.tsx` statement rendering |
| `goal-admin-ops-schema-reconciled-390.png` | 1270 | `GoalAdminSchema.tsx` statement rendering |

Exact images, source blobs and pixel comparison: `design/goal-ui/captures/admin-ops/retirement-6f46/`. The old root-element `scrollWidth` metric reports zero while these document widths exceed the viewport; the image-width finding must not be hidden by that metric. `OpsTable` has a 520px minimum table width, while its panels/grid ancestors lack explicit minimum-width containment. Schema statement text uses `.g-num`, whose global rule deliberately includes `white-space: nowrap`. These are source candidates to reproduce, not a claim that a repair is implemented.

## Owned paths

- `client/src/pages/goal/admin-ops/goalOpsParts.tsx`
- `client/src/pages/goal/admin-ops/GoalAdminSchema.tsx`
- `client/src/pages/goal/admin-ops/GoalAdminFlowHealth.tsx`
- `client/src/pages/goal/admin-ops/GoalFlowBaselinePanel.tsx`
- `e2e/admin-ops-width.e2e.ts`
- `design/goal-ui/captures/admin-ops/mobile-width/**`

API/data helpers, auth, server, shared contracts, pricing, global `.g-num` styling, route/release modules and dependencies are read-only. Do not hide or truncate figures/SQL to make the viewport assertion pass. Preserve all existing content, actions, headers, requests and values. Use local containment/wrapping and existing design utilities; tables may scroll inside a bounded panel.

## Tests first and implementation

1. Use the existing browser harness and synthetic admin responses; never a production admin identity or live reconcile. Add a real-browser regression for populated and no-baseline flow health and pending/reconciled schema, including long allowlisted statement text. Keep a desktop control.
2. Record the failing body/document/element bounds and screenshot width at 390×844@2x before editing. Assert the actual viewport and full-document PNG width as well as scroll/element bounds; a root-only check is insufficient.
3. Repair the owning panel/grid containment and statement wrapping with the smallest local CSS change. Leave global typography and API/data/auth code unchanged.
4. Re-run the same real-browser cases; every full-document PNG at 390@2x is 780px wide, all content remains readable, and tables scroll within their panel when needed. Keep original figures, statement text, error states and actions.
5. Run focused goal/component/browser tests, TypeScript, token audit, production build and required exact-head CI. Capture 1280 and 390, inspect native pixels, merge current main preserving other admin work, and use protected merge-commit auto-merge. No new dependency, env key, migration or service setting is needed.

## Acceptance and recovery

All four phone cases pass the actual viewport/document-width checks, with no hidden/truncated data or page errors. Desktop controls and existing admin-ops contracts stay green. Record the real commands, source SHA, images and results; no estimated or fabricated pass. Canonical post-deploy checks stay read-only. Rollback is a protected revert of this bounded layout PR.

## Status

- Registered — GPT-6.1 Sol · 6f46 — November 19, 2026 — evidence from PR #1332; no implementation or claim. Appended to the queue with no existing row reordered and no dependency added solely for shared files (D-314).
- D-048-admin-ops-mobile-width: done — eeda4afd6 — DeepSeek V4.1 Flash · eb89 — 2026-11-24 — PR #1544. Red first: `e2e/admin-ops-width.e2e.ts` on the unfixed code measured document scrollWidth 732 (flow-health-default), 570 (no-baseline) and 2030 (both schema states) at a real 390x844@2x viewport, desktop control green, `4 failed, 1 passed (7.6m)`. Fix: `min-w-0` on `OpsPanel` and the baseline panel's nested grid, and the schema statement keeps the mono face through `font-g-mono` so it wraps (global `.g-num` untouched). Green: `5 passed (3.0m)`; all eight captures in `design/goal-ui/captures/admin-ops/mobile-width/` are 780 px at 390@2x and 1280 px at desktop, `horizontalOverflowPx: 0`, native pixels inspected. Gate: `pnpm check`, design-token audit, migration lint, deploy triggers and `pnpm build` pass; the local full vitest run was starved by host load (7596 passed, 133 hook timeouts in unrelated suites), and the required CI on the merge head passed typecheck, all three unit shards, production build, e2e journeys (which ran this regression) and CodeQL. `scope-check` reported 6 owned paths, every change inside them.
