# Hark fix round on PR #734 (row FIX-share-hub-link-ready) — captures at adb1f490

Not product code; never merged (same rule as `../README.md`, D-205).

- Product code captured: branch `agent/queue/fix-main-eb0fd8cd` at `adb1f490` (merge of main `e6b785a0`, red tests `f19be229`, fix `adb1f490`).
- Real Chromium (Playwright headless shell), full-page, 390x844 @2x and 1280x900 @1x. Vite dev server with `VITE_GOAL_SURFACES=share`; API mocked at the network layer, fictional data only (invite code FICTION-7Q). Script: `share-capture-states.mjs`.
- States: `loading` (invite held), `ready`, `locked-null` (200 `{ invite: null, locked: true }`, D-155) and `signin-*` (auth.me held so the page renders signed out, then released: `isSignedIn` false -> true on the same mount, invite held, then released).
- `report.json`: per state, every status line from the first DOM frame (MutationObserver), `readyWithoutLinkFrames` (frames saying "Your link is ready." with no `/start?invite=` on the page: empty in all 8 runs), the Copy button's `aria-disabled` (`absent` when locked), `sameMountNode: true` for the sign-in runs, and page errors (none).
- Logs: `red-f19be229.log` (2 new tests fail on the old component), `red-final-tests-old-component.log` (final test file vs the old component: same 2 fail), `green-focused-adb1f490.log` (shareHubGoal 7/7, shareHub 7/7, goalBoundary 3/3).
