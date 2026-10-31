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

`D-048-p3-messages`: unblock ruling D-243 recorded — nothing is broken; the head `e31f4541` is red at `typecheck` only because `review-gate` owes it an independent pass (a `Fixed` history is not a pass, D-236 (2)). Next stage: the independent Tier 1 `Verdict` with body `reviewed e31f4541d8e4d364b627a52f88a64b86e8395f65` on `agent/review/d048-p3-messages` by a model that neither built (Hark · d1c3) nor fixed (Manus · fa20) it; that pass turns the check green and opens the landing. Hands off the gate, the workflow and every test. PR #829 stays draft. — Qoder · a680, 2026-10-30.

`D-048-p3-messages`: independent Tier 1 review passed — `e31f4541` — verdict marker `72e450a4` on `agent/review/d048-p3-messages` (body `reviewed e31f4541d8e4d364b627a52f88a64b86e8395f65`) by Qoder · dd5c, a session that neither built (Hark · d1c3) nor fixed (Manus · fa20) the work; `review-gate` passes at that head. Next stage: the normal Tier 1 landing. PR #829 stays draft until the landing. — Qoder · dd5c, 2026-10-31.

`D-048-p3-settings`: review — fix round 3 — `agent/queue/d048-p3-settings`, PR #821 — Cline · fde3, 2026-10-30. Fixes the finding of DeepSeek V4.1 Flash Free · 9159 on `64519aee`, red-first (`33da745d` red, 1 of 20 failing; `faaa83ab` fix), then merges `main` `a4162a9f` (`f19ce00b`, clean; `pnpm check` 0). **F1 (P3):** while `GET /api/company-referrals/access` fails, the Notifications section keeps its "Referrer alerts" heading and says "We could not check your work email." with "Try again" (a `GoalErrorState`, so the page still has one next-step block and one primary) instead of dropping the block silently; the referrer email switch and the Slack panel stay hidden while the check is unknown, so nothing renders as absence and nothing opens on an unverified guess (fail closed). Copy mirrors `AccountSection.tsx:17-21`; no endpoint, privacy rule or server file touched. Reverting `NotificationsSection.tsx` to `64519aee` fails exactly the new test. Focused `settingsGoal.test.tsx` 20/20; full suite 5283 passed / 18 skipped / 1 load flake (`scripts/classifyCiChange.test.ts`, a 400-commit fixture timing out at 20 s under the parallel run — 54/54 green alone); `design-token-audit`, `lint-deploy-migrations`, `check-deploy-triggers` and `scope-check` (4 owned paths) green. Tier 1: needs an independent re-review by a model that neither built nor fixed it (not Qoder, not Hark, not Cline; D-151). Not landing (fixer).

`D-048-p3-settings`: review — fix round 2 — `agent/queue/d048-p3-settings`, PR #821 — Hark · c92c, 2026-10-30. Fixes the findings of Claude Opus 5.5 · 57d8 on `9dc02a40`, red-first (`b906713d` red, 2 of 19 failing; `f520ba32` fix), then merges `main` `6b6544dd` (`5d91a5d8`, clean). **F1 (P2):** while talent-discovery consent is active, the field boxes show the server's `selectedFields` and are read-only (there is no update path, so an edit could never be saved), with the line "These are the fields your active consent shares. To change them, opt out and opt in again."; inactive consent keeps the kit's editable defaults. **F2 (P3):** offline, the goal `Switch` keeps its "On"/"Off" value visible with the reconnect reason beside it, and the track dims (`opacity-50`) instead of painting off; `aria-checked` unchanged. No capture changes: no committed fixture is offline or has active consent, and the online switch renders as before. Focused `settingsGoal.test.tsx` 19/19; settings family + goal page contract + boundary 9 files / 44 tests; `pnpm check` and `design-token-audit` green. Earlier round (Hark · e862, `bcf42781`): Region next step without "credits"; no unlock cost or retention before the consent state answers (wording mirrored from the kit, sweep owned by the terminology lane, PR #598). Builder: Qoder · a119, code head `ed47e914`. Tier 1: needs an independent re-review by a model that neither built nor fixed it (not Qoder, not Hark; D-151). Not landing (fixer).

`D-048-p3-settings`: unblock ruling D-247 recorded — nothing is broken; the merged head `db06a2db` is red at `typecheck` only because `review-gate` owes it an independent pass (a `Fixed` history is not a pass, D-236 (2)), and e2e journeys, production build and unit tests are green on it (run `41084794712`). Next stage: one eligible model (not Qoder, Cline, Hark or Claude — D-151) pushes `Review claim D-048-p3-settings: <session>` on `agent/review/d048-p3-settings` and records `node scripts/next-task.mjs --verdict pass --task D-048-p3-settings --as "<session>"` (body `reviewed db06a2db…`), then the normal Tier 1 landing. PR #821 stays draft; the picker's red-before-review order is left as is (D-244 (5)). — Qoder · 3415, 2026-10-30.

`D-048-p3-settings`: done — `ea6c074c` — Gemini 3.8 Flash · 55d4 — 2026-10-31 — goal `/settings` behind `goalSurfaceOn('settings')`: independent Tier 1 delta review pass by Gemini 3.8 Flash · 55d4 on `ea6c074c` (D-247); 20/20 focused tests, design tokens clean, scope check clean; required CI green.

`D-048-p3-profile`: current: D-253 corrects D-252. Routing evidence is not a product verdict. Actual findings and privacy handoffs/holds remain; the current fixing holder owes truthful completion before a specifically accepted independent review route. Review returns findings OR pass on the exact head after complete builder/fixer-history checks. No manual marker, GREEN takeover, automatic PASS or landing is authorized by D-252/D-253. PR #826 remains draft; row remains todo. Other rows and D-251 stay unchanged.
