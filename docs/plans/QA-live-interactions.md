# Packet QA-live-interactions: signed-in live QA clicks the account menu, not just loads pages

Row `QA-live-interactions` (Tier 2). Ruling: D-412 (7)(a). Part of the D-409 loop.

## Why
`scripts/live-qa-signed-in.mjs` is navigation-only. On Nov 27 the goal-shell avatar was dead on `/explore`, `/requests`, `/ask` and `/inbox` (no way to sign out) and every live QA run passed, so QA-auto-issues filed nothing.

## Change
After each signed-in route loads at 1280 and 390, the runner clicks the visible `button[aria-label="Account menu"]`, requires a visible `menuitem` named "Sign out" within 5 s, then presses Escape. It never selects Sign out or any other item. A missing button or a menu that does not open is a failing check for that route and width (recorded in `live-qa/summary.json` like a page error), so the existing QA-auto-issues step files or updates one `bug` + `automated` issue and closes it when a later run passes. `/admin` stays out; no form, no money, nothing else is clicked.

## Tests
`scripts/liveQaSignedIn.test.ts`: the interaction step is in the plan for every route and width; a missing button and a menu with no "Sign out" each produce a failing check; Escape is the only follow-up action (no menu item is ever selected).

## Owns
`scripts/live-qa-signed-in.mjs`, `scripts/liveQaSignedIn.test.ts`, this packet.

## Done when
Required CI green; the first live QA run after release shows the account-menu check passing on every signed-in route at both widths (after `P0-goal-shell-sign-out` is live), with its run link in Status.

## Status
