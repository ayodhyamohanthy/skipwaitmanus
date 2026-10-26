# Packet SHELL-focus-clearance: a focused field on a phone is never hidden behind the bottom bar (#642)

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | `SHELL-focus-clearance` in `docs/plans/assignments.json` (status lives there) |
| Decisions | D-019 (basics always work), D-150 (goal shell), AGENTS.md rule 8 (proof before "done") |
| Risk tier | 2 (UI only: no money, sign-in or data) |
| Source | Issue #642 (Instinct coordinator, real-viewport QA at 390x844 DPR2) |
| Verified against | `main` `1b4d9939` on 2026-10-25 |

## 1. Goal
On a phone, the field a person is typing in is never under the sticky bottom bar. Today on `/ask`, the "Why me" reason field (y784-832) sits under the bar (top at y791) when focused. The referrer conversation composer (y770-866) does too.

## 2. Current behaviour (verified)
- `client/src/components/goal/GoalShell.tsx`: on phones (`max-gdesk`, width < 641px) the bottom `<nav>` is `max-gdesk:sticky max-gdesk:bottom-0 max-gdesk:z-20 ... h-14` (56px). It spans grid rows 2 to the end with `self-end`. `<main>` sits in row 2 with no bottom padding.
- The grid scrolls with the window (no inner scroll container).
- Nothing in `client/src` sets `scroll-padding` or `scroll-margin`, so the browser scrolls a focused field only until it touches the viewport bottom, which is behind the bar.
- The page end is already clear: the grid's last row is a 56px track the bar rests in at full scroll.

## 3. Target behaviour
1. `GoalShell.tsx`: the phone bottom `<nav>` carries `data-goal-bottom-bar=""`. Nothing else in the shell changes.
2. `client/src/index.css` (switch only, at most 12 lines): one rule, placed after the goal-UI phase-2 block:
   ```css
   /* Phone goal shell: focus and scrollIntoView stop above the sticky bottom bar (#642). */
   @media (width < 40.0625rem) {
     html:has([data-goal-bottom-bar]) { scroll-padding-bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px)); }
   }
   ```
   `40.0625rem` is `--breakpoint-gdesk` (641px), so this applies exactly where the bar is shown. `:has()` is supported by every browser the app targets (Safari 15.4+, Chrome 105+, Firefox 121+). A page with `hideBottomBar` has no such element, so it is unaffected.
3. Desktop (width >= 641px) is pixel-unchanged.

## 4. Files
- In scope: `client/src/components/goal/GoalShell.tsx`, `client/src/index.css (switch only)`, `client/src/components/goal/goalShell.focusClearance.test.tsx` (new).
- Out of scope: `AppShell.tsx` and `useGoalShellMeta.ts` (owned by `D-048-F-credits`), and every page component.

## 5. Tests first (red on today's code)
`goalShell.focusClearance.test.tsx` (Vitest + Testing Library, like `goalComposites.test.tsx`):
- The shell's phone bottom nav has `data-goal-bottom-bar`.
- With `hideBottomBar`, no element has it.
- `client/src/index.css` (read with `fs`) contains a `scroll-padding-bottom` rule scoped to `html:has([data-goal-bottom-bar])` inside the `40.0625rem` media query.

## 6. Proof (rule 8)
jsdom cannot scroll, so attach real-viewport proof to the pull request:
- Run `pnpm dev` and a throwaway Playwright script (Chromium is preinstalled in cloud sessions: `require('playwright')`) at 390x844, deviceScaleFactor 2.
- Focus the `/ask` reason field, and the conversation composer if your fixture reaches it. For each, log `document.elementFromPoint` at the field's centre. It must be the field (or inside it), never the nav.
- Paste the log, and attach before/after screenshots at 390 and a 1280 screenshot showing desktop unchanged.
- A session with no browser uses `--avoid SHELL-focus-clearance` (D-200 (5)). It never reports this row blocked.

## 7. Definition of done
- [ ] The test file is red first, then green.
- [ ] `pnpm check`, the focused tests and `pnpm build` pass.
- [ ] The design-token audit passes.
- [ ] The proof in §6 is on the pull request.
- [ ] Required CI is green on the exact head, and the row is set to `done`.

## Status

- SHELL-focus-clearance: takeover resumed by Instinct Agent · 23bd (Oct 26 16:19 UTC+5:30) per the official picker verdict TAKE OVER SHELL-focus-clearance after the accidental LAUNCH-live-qa marker (22b82faf) decayed past the documented 2h quiet window and was handed out (D-085); owner ruling on #623 comment 6411927587 still open. Red test (c3b1b821) and implementation (fef78166: data-goal-bottom-bar + scroll-padding rule) pushed to the claimed branch as a plain fast-forward; full gate + real-viewport proof re-run against latest main follows before the draft PR. Earlier held-claim note: claimed (f33e2a99, Oct 26 14:16 UTC+5:30); the release-gap question to the queue owner stands recorded for the picker release verb.
