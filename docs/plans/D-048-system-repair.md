# D-048 system follow-up: gallery behavior and acceptance proof

Docs-only registration for a bounded repair of merged PR #834. No runtime change, production flag activation, or acceptance waiver is made by registering this row.

| Field | Value |
|---|---|
| Task | `D-048-system-repair` |
| Parent / row | `D-048` / `D-048-p3` |
| Tier | 2, unreleased gallery behavior and proof |
| Branch | `agent/queue/d048-system-repair` |
| Lane | `d048-system` |
| Depends on | `D-048-p3-system`, `D-048-F-goal-check` |
| Decisions checked | D-232, newest main register entry at registration; D-228 through D-232 add no system repair change. Recheck later entries before execution. |
| Packet basis | `D-048-public.md` §§5-7, `D-048-phase-3-split.md` §3 local gate and §6 release, `GOAL_UI_COVERAGE.md` §1 |

## Evidence and current state

PR #834 merged as `b03ab68a21adef9dc58f0f1967f079e1dca96f7d`, final head `89d1819bb33191e63677579b1c04d81e38e5089b`. The original row is done and its implementation remains off: `system` is absent from `RELEASED`. Do not reopen or revive the merged branch. This additive row carries the remaining work explicitly.

1. Local goal-on captures at the merged source show the Loading chip as a blank phone at both 390 and 1280 CSS pixels. `GoalAppStates.tsx` uses `bg-g-surface` for both the phone and loading bars. The invisible result is the finding; a computed-style cause still needs checking.
2. Private tests against the real goal component fail for Android Not now dismissal, iPhone Got it dismissal, offered `beforeinstallprompt`, notification permission response and Maybe later. Existing `appStates.test.tsx` already pins these behaviors on the legacy gallery. Goal handlers currently show an unavailable message without calling the offered browser APIs. This is not evidence that the browser lacks those APIs.
3. External local captures now exist for defaults plus a 32-file structural state matrix. They are mocked local QA evidence, not production or E2E proof. The repository capture tree was empty at registration. The matrix's aggregate 31/32 claim is not accepted: Loading is defective in both files. Preserve per-file findings and the exact state manifest, not a clean aggregate verdict. Raw console output and the variant script were not included in that archive, so retain a rerunnable recipe and fresh output for final proof.
4. Existing shared money/ask wording is owned by D-180. Do not change shared copy in this row. The gallery payment messages are references, not actual payment/refund evidence.

## Owned files

- `client/src/pages/goal/system/GoalAppStates.tsx`
- `client/src/pages/goal/system/systemParity.goal.test.tsx` (new)
- `client/src/pages/goal/system/systemPages.goal.test.tsx` (new)
- `design/goal-ui/captures/system/**` (synthetic fixtures, capture script, manifest and images)
- This packet's own status and this row's own status in assignments, under the normal queue rules.

Read-only: all legacy page/tests, shared components/tokens/hooks/server/auth/data, `goalSurfaces.ts`, other rows and decisions. Do not edit `RELEASED`, create a new design system, send mail, trigger real permission or install prompts against a user's profile, change payment configuration, or operate real payments/refunds. Preserve the old tests unchanged.

## Bounded repair and red-first proof

1. Re-read current main and check there is no new overlapping repair or source change. Claim only through the official picker after registration lands. If another task already owns these paths, coordinate rather than write in parallel.
2. Add goal-on red tests for the five actual parity failures above. Use synthetic browser events and injected/mocked `Notification`, not real account actions. Port the legacy assertions, including no permission call on Maybe later, unavailable API fallback, denied/accepted or error feedback, dismissal and reopening from the gallery chip. Do not weaken the existing tests or disguise missing behavior as an unavailable browser.
3. Restore these behaviors within GoalAppStates, using existing patterns and tokens. Keep the gallery local and fetch-free. Dismissal is local UI state, not installation or notification success.
4. Give Loading a visible indicator and honest accessible status. Inspect actual pixels at both widths; a DOM role alone does not prove visibility. Keep the other gallery states readable and preserve the existing Try again to Loading transition.
5. Add focused goal-on page checks for goal structure, fetch-free behavior, offline draft/no-draft and safe retry target handling, email selector structural branches, and 404 navigation. `assertGoalPage` and the existing harness/patterns apply where appropriate. Do not invent API empty/loading/error states for fetch-free reference pages. Any defect discovered outside owns is reported, not silently fixed here.

## Required evidence and acceptance

- Exact source head, state, viewport, DPR, fixture, command and result in a committed manifest. Use 390x844 DPR2 and 1280x900 DPR1 or the canonical capture harness at those CSS widths; distinguish CSS from PNG pixels. Include a repeatable capture recipe, state actions and retained output. No real user data.
- Baseline and post-fix Loading, Android/iPhone dismissal/reopen, offered-install and permission outcome UI, plus the affected existing structural matrix at both widths. An unavailable feedback screenshot proves that feedback only, not browser API availability.
- Existing defaults: offline, 404, Android gallery and work-email-code gallery. Matrix: the eight other app-state chips, Android install-unavailable, push allow-unavailable, offline synthetic saved draft, and email Password reset/Welcome/New message/Report outcome/Review ready, each at both widths. Five email structural branches are not all 13 template pixel proof. Label untested variants explicitly.
- Existing legacy tests unchanged, new red-to-green goal-on tests, `pnpm check`, design-token audit, `VITE_GOAL_SURFACES=all pnpm build`, applicable full gate and exact merge-result required CI. For UI, inspect actual baseline and fixed pixels. No full acceptance while a demonstrated defect or required evidence is missing.
- Tier 2 follows normal green required-CI landing. No fabricated Tier 1 review requirement, self-review marker, admin bypass, force push, or comment-write retry. The release row remains separate and requires its own review/approval/gates; this row never enables the production flag.

## Completion

Only after behavior, tests, inspected post-fix captures and committed reproducible evidence are present, mark this follow-up done through its PR. Report what remains under D-180 and any unverified state. A merged PR, green unit tests, or a local capture archive alone does not finish this outcome.

## Status

Registered for repair; not started, no claim or runtime change made by this registration.
