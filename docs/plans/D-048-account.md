# Packet D-048 phase 3: account and support surfaces

> Read `docs/BRIEF.md` first, then this packet and `docs/plans/D-048-phase-3-split.md`. This is a **packet-only Tier 3 architecture task**: it adds the account cluster rows to the queue. It does not implement the UI.

| Field | Value |
|---|---|
| Queue row | `D-048` (phase 3; shared row; this packet writes its own status line only) |
| Packet task | `D-048-P-account` |
| Decisions | D-019, D-057, D-070, D-077, D-120, D-134, D-149, D-150, D-153 |
| Risk tier | 3 (docs/queue metadata only; the implementation rows below are Tier 1 or 2 as stated) |
| Branch | `agent/architect/d048-p-account` |
| Depends on | `D-048-phase-3` (landed foundation packet) |
| Adds | `D-048-p3-settings`, `D-048-p3-profile`, `D-048-p3-alerts`, `D-048-p3-messages`, `D-048-p3-support` |

## 1. Goal and binding rules

Move the account and support surfaces to the goal system while preserving every settings, privacy and support behaviour. Visibility controls are privacy (Tier 1); destructive actions keep their confirm step; a failed load says so and never renders as empty/zero (silent failure is a defect, D-019); the referrer message box stays locked before acceptance with server 403s rendered as they are. QA live pixels (Oct 23, 390px) show `/alerts` still renders kit styling (blue count pill, blue tab underline, lavender notification cards with blue dots, blue preferences link): these rows are hierarchy and workflow rebuilds per D-150, not recolors.

> **D-048 split method is binding:** a surface adds a switch only in its existing page file; its goal implementation lives under `client/src/pages/goal/<id>/`; API/data/auth modules are read-only; no surface edits `App.tsx`, `AppShell.tsx`, `client/src/components/goal/**`, `index.css`, `kit.css`, `components/kit/**`, hooks, shared, server, decisions, or the shared plan row. If a required shared change is discovered, stop and report it to the design-core/CEO lane with evidence.

## 2. Current behavior verified on `main` (dd849c48)

- `client/src/pages/Settings.tsx` renders the settings sections (privacy, blocked people, talent consent, data export, login linking under D-057) through `components/settings/settingsApi.ts` and `settingsQueries.ts` (read-only).
- `client/src/pages/Profile.tsx` and `Work.tsx` carry profile/privacy and the "What a referrer sees" preview; Work owns the profile-link control.
- `client/src/pages/Alerts.tsx` renders notifications and saved alerts; QA live pixels (Oct 23) confirm kit visuals on the live deploy.
- `client/src/pages/Messages.tsx` is the direct-message surface with the pre-acceptance composer lock.
- `client/src/pages/Help.tsx`, `Report.tsx` (3-step report flow), and `Safety.tsx` form the help/safety group.
- `docs/plans/D-048-phase-3-split.md` rows `D-048-p3-settings`, `D-048-p3-profile`, `D-048-p3-alerts`, `D-048-p3-messages`, `D-048-p3-support` are the authoritative row contract and owned-path list.

## 3. Surface contracts and exact queue rows

| ID | Scope / goal | Lane | Depends on | Tier | Flag | Owned paths |
|---|---|---|---|---:|---|---|
| `D-048-p3-settings` | W5 `/settings`: section order kept; destructive actions keep their confirm step; privacy, blocked people, talent consent, data export, login linking (D-057) | `d048-settings` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-account` | 1 | `goalSurfaceOn('settings')`; read-only: `components/settings/settingsApi.ts`, `settingsQueries.ts` | `client/src/pages/Settings.tsx` (switch only); `client/src/pages/goal/settings/**`; `client/src/pages/settingsGoal.test.tsx`; `design/goal-ui/captures/settings/**` |
| `D-048-p3-profile` | W5 `/profile` and `/work` (visibility controls are privacy) | `d048-profile` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-account` | 1 | `goalSurfaceOn('profile')` | `client/src/pages/Profile.tsx` (switch only); `client/src/pages/Work.tsx` (switch only); `client/src/pages/goal/profile/**`; `client/src/pages/profileGoal.test.tsx`; `design/goal-ui/captures/profile/**` |
| `D-048-p3-alerts` | W5 `/alerts` notifications and saved alerts | `d048-alerts` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-account` | 2 | `goalSurfaceOn('alerts')` | `client/src/pages/Alerts.tsx` (switch only); `client/src/pages/goal/alerts/**`; `design/goal-ui/captures/alerts/**` |
| `D-048-p3-messages` | W5 `/messages`: no message box for a referrer before acceptance; server 403 refusals rendered as they are | `d048-messages` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-account` | 1 | `goalSurfaceOn('messages')`; read-only: `lib/idempotentSend.ts` | `client/src/pages/Messages.tsx` (switch only); `client/src/pages/goal/messages/**`; `design/goal-ui/captures/messages/**` |
| `D-048-p3-support` | W5 `/help`, `/report` and `/safety` ('Help & safety' serves both sides) | `d048-support` | `D-048-F-harness`, `D-048-F-primitives`, `D-048-P-account` | 2 | `goalSurfaceOn('support')` | `client/src/pages/Help.tsx` (switch only); `client/src/pages/Report.tsx` (switch only); `client/src/pages/Safety.tsx` (switch only); `client/src/pages/goal/support/**`; `design/goal-ui/captures/support/**` |

Design acceptance notes (design proposals, executable under the doctrine; not new frozen owner decisions):
- `/settings` opens "Control your account." with no standing black commit; the next step is contextual to the section the user opened. Section order is kept.
- `/profile` + `/work` open "Choose what referrers see." The "What a referrer sees" preview is the honest-availability pattern applied to self and stays prominent.
- `/alerts` opens "Know when something moves." The next step is the newest item that needs the user (QA pixel evidence: today nothing is visually distinguished as needing them). Unread reads as dot + ink text vs muted read rows; the count is a mono numeral beside the tab word, never a pill; "Choose what notifies you" and "Mark all read" are plain ink links. Judgement note (labelled): "newest unread first" is a design proposal from the doctrine's one-next-step rule, not measured data; the builder may order by the existing recency sort if it already matches.
- `/messages` opens "Your chats." with the thread waiting on the user first; the pre-acceptance lock is stated in plain language, not hidden.
- `/help` + `/report` + `/safety` open "Get help." / "Report a problem."; the report flow keeps its 3-step shape with one commit per step.

All rows are `status: "todo"`, `packet: "docs/plans/D-048-account.md"`, `row: "D-048"`, `epic: "D-048-p3"`, and use the lane/tier/dependsOn/flag/owns values above. Each builder must use the exact `branch` value registered for its row in `docs/plans/assignments.json`; do not choose, rename, or derive a branch.

## 4. Implementation guardrails for builders

1. Preserve every kit assertion; add goal-on assertions for loading, empty, error, offline and success states. A failed load renders its error, never a fake empty.
2. Settings/profile mutations use the existing API modules read-only; no new endpoint, no changed semantics, no reorder of settings sections.
3. Destructive actions (blocks, deletes, exports, unlinking) keep their confirm steps exactly.
4. Messages: the pre-acceptance composer lock is a server rule rendered, not a client hint; 403 bodies surface as they are.
5. No decorative blue, no pills/badges, dot+text status, mono numerals; QA's Oct 23 `/alerts` pixels are the reference for what must NOT survive.

## 5. Red-first tests and gate

Each builder records focused failing tests first. Minimum pins: goal flag-off parity; goal-on render; loading/empty/error/offline states; failed-load-never-fakes-empty; settings confirm steps; messages pre-acceptance lock and 403 rendering. Required gate per PR: `pnpm check`; focused Vitest files; `node scripts/design-token-audit.mjs`; `VITE_GOAL_SURFACES=all pnpm build`; `pnpm quality:gate`; 1280+390 captures. Tier 1 rows open a draft PR with independent review (D-151); Tier 2 rows follow the green-CI landing protocol.

## 6. Definition of done

- Only the row's owned paths changed; read-only imports unchanged; `git diff --check` clean.
- Goal surface passes the contract, focused tests and full gate on a branch merged with current `origin/main`.
- Captures at both viewports; no production flag enabled.
- Tier 1 builder opens a draft PR, reports `review` with exact head, and stops.

## 7. Review checklist

Reviewer records the exact head; checks scope against `owns`; reproduces red-first tests; verifies no settings behaviour change, no privacy-control change, no silent-failure rendering, the messages lock, no decorative blue/pills, goal-on and flag-off behaviour, captures at both sizes, exact-head CI.

## 8. Stop and report

Stop with a pushed status/report if a cited function or route no longer exists, a focused test fails unexplained, a required change falls outside `owns`, or a privacy/identity decision is not already decided. Never guess; report the concrete file/line.

## 9. Owner questions

None. Privacy and support behaviour is already decided in the register; this packet makes no new product ruling.

## Status

`D-048-P-account`: prepared by design lane (AYO-11) — pending coordinator landing — 2026-10-23 — branch `agent/architect/d048-p-account`

`D-048-P-account`: landed by the coordinator — 2026-10-23 — landing branch `agent/instinct/d048-p-account-packet`. Canonical candidate; the empty claim marker branch `agent/architect/d048-p-account` (Claude Code · e11c) is preserved and the overlap is announced in the PR.

`D-048-p3-profile`: review — agent/queue/d048-p3-profile — 26b57b24 — PR #826 — Hark · ebb2, 2026-10-29. Red first `7aaa3a1e` (18/26 fail), build `a1fdb98c`, captures `26b57b24` (10 states × 1280/390 with fixtures). Gate on 26b57b24 (main 622d1b0f): check 0 · token audit OK · migration lint 0 · deploy triggers 0 · `VITE_GOAL_SURFACES=all pnpm build` 0 · vitest 558 files / 5132 tests passed, 2 load timeouts in untouched files (classifyCiChange H1, configContract .env) green alone. Flag off: kit unchanged. Kit Remove work has no confirm; kept as is (follow-up). Tier 1: needs an independent review by a model other than Hark.

`D-048-p3-profile`: fix — F1 (P2) closed on `33aef03e` — PR #826 — DeepSeek-V4.1-Flash · a6b5, 2026-10-30. `GoalWork.tsx` now renders both counts only when `loaded`, so a loading or failed load states no number instead of "0 pinned" beside "Nothing was changed". Red first `2e9b7ac8`: 2 of 26 fail (loading, failed load), 26/26 green with the gate; the three suites that reference the work page pass together (`profileGoal`, `profileSetup`, `ask.pinnedWork` — 45/45). `work-error` captures regenerated at 1280/390 from the fixed build. **Kit parity, deliberate:** `client/src/pages/Work.tsx` keeps its ungated `pin-meter` — the kit body stays exactly as reviewed and this row replaces that surface, so the goal page is the one pinned and the two differ on purpose. Gate on the merge with `main` `99f8a1f2`: `pnpm check` 0 · token audit OK (383 files) · migration lint 0 · deploy triggers 0 · `VITE_GOAL_SURFACES=all pnpm build` 0 · focused vitest 45/45; the full suite runs on required CI.


`D-048-p3-profile`: fix — F2 (P2) addressed on `7fa86614` — PR #826 — Manus · followup1, 2026-10-30; pending independent D-151 review. `GoalProfile.tsx` and `GoalWork.tsx` export `GOAL_PAGE` using the shared rendered `GOAL_LINE`; `profileGoal.test.tsx` runs `assertGoalPage` on loaded/signed-out `/profile` and `/work`, plus `/work` loading/error; `/profile` loading/error test titles explicitly exempt the no-next-step states. Red-first: the contract assertions failed 6/26 on the test-only diff; final `profileGoal` 26/26. Synced with current `main` `9cf166e4` via merge `492ef19e`. `pnpm check`, `scope-check` (5 owned paths), token audit (390 files), migration lint/deploy-trigger checks, and `VITE_GOAL_SURFACES=all pnpm build` pass; full `LANG=en_US.UTF-8 pnpm quality:gate` exited 0 (571 files / 5 skipped; 5,326 tests / 18 skipped). Existing captures: 10 states paired at 1280/390; UI unchanged. GitHub checks on code head `7fa86614`: tests, production build and Workers pass; `typecheck` is red only because `review-gate` awaits an independent D-151 pass, not a TypeScript failure. PR remains draft; no merge or deploy.

`D-048-p3-messages`: unblock ruling D-243 recorded — nothing is broken; the head `e31f4541` is red at `typecheck` only because `review-gate` owes it an independent pass (a `Fixed` history is not a pass, D-236 (2)). Next stage: the independent Tier 1 `Verdict` with body `reviewed e31f4541d8e4d364b627a52f88a64b86e8395f65` on `agent/review/d048-p3-messages` by a model that neither built (Hark · d1c3) nor fixed (Manus · fa20) it; that pass turns the check green and opens the landing. Hands off the gate, the workflow and every test. PR #829 stays draft. — Qoder · a680, 2026-10-30.
