# P0 route account menus: messages and support

Two independent repairs under D-019, D-200, D-223, D-409 and D-412. This packet restores the existing signed-in account controls; it does not redesign these pages or change authentication. Checked through D-414.

## Evidence and priority

[Live QA run 46065479203](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46065479203), artifact `15230259128`, signed in as both demo accounts against API and web `f02de526ad1dbb29fbfb5496980c64bf17f3d12e`. Its summary records 34 of 38 checks passing. The seeker has no Account menu on `/messages` or `/support` at either 1280 or 390. All four captures were inspected. Existing issues [#1708](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1708) and [#1709](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1709) remain open.

Source inspection on main `3508530aaf046afe3145003feb2306169e617c5d` identifies separate missing-shell boundaries:

- `client/src/pages/goal/messages/GoalMessages.tsx` wraps every state in its local `main`, never the app shell.
- `client/src/pages/Support.tsx` uses the non-policy fallback of `PolicyPageShell`, whose public Legal header has no signed-in account controls.
- `GoalAppShell` already mounts the working `AccountMenu` after the D-412 repair. Reuse it, not another sign-out implementation.

These are broken access to a basic account action (D-019/D-412), so the two rows go immediately after the completed QA interaction row, ahead of new feature work. They do not replace or take over the active shell, mobile, authentication or bug-picker rows. Their production source and test paths are disjoint; the shared packet holds one Status line per row.

## 1. P0-messages-account-menu — issue #1708

Tier 1, lane `p0-messages-account-menu`, branch `agent/queue/p0-messages-account-menu`, no dependency.

### Scope

- `client/src/pages/goal/messages/GoalMessages.tsx`
- `client/src/pages/goal/messages/messagesGoal.test.tsx`
- `client/src/pages/goal/messages/messagesSignInButton.test.tsx`
- `client/src/pages/messagesIdempotency.test.tsx`
- `client/src/pages/messages.accountMenu.test.tsx` (new regression)
- This packet, Status line for this row only.

### Contract and implementation

1. Reuse the real `GoalAppShell` and its account menu around the signed-in messages surface, with Inbox as the existing navigation destination. Keep the signed-out Sign in flow unchanged.
2. Keep the menu available during loading, empty, load failure, offline, thread-open and send-blocked states. Do not make it depend on a successful DM fetch.
3. Keep one app navigation and one `main` landmark; the current local reading container must not create nested mains when the app shell is present. Preserve the current page markers and content.
4. Leave every DM endpoint, request body, acceptance/follow gate, idempotency key, retry record, response-loss handling and conversation ownership rule unchanged. No new sign-out handler, auth provider or direct session mutation.
5. Preserve mobile composer reachability and the app's bottom-navigation inset. Use the existing shell/tokens; no CSS or design-system expansion.

### Regression and verification

The live failure is the repro; do not rerun it merely to confirm it. Add a component regression that renders the real menu in the route, opens Account menu, exposes Sign out and calls the mocked session sign-out exactly once when selected. Exercise a failed or pending DM list as well as the normal empty/open-thread path so account recovery cannot disappear with the data. Do not replace the shell/menu with a fake button in this regression.

Run the new route regression with `messagesGoal.test.tsx`, `messagesSignInButton.test.tsx` and `messagesIdempotency.test.tsx`, then typecheck, token audit and production build. Update only fixture/provider setup required by the real shell; retain consumer-visible privacy and retry assertions. Required exact-head CI and the release checks below still apply.

## 2. P0-support-account-menu — issue #1709

Tier 1, lane `p0-support-account-menu`, branch `agent/queue/p0-support-account-menu`, no dependency.

### Scope

- `client/src/pages/Support.tsx`
- `client/src/components/PolicyPageShell.tsx` (bounded support framing only)
- `client/src/pages/support.accountMenu.test.tsx` (new regression)
- `client/src/pages/support.promises.test.tsx` (provider setup only unless a source-shape pin becomes obsolete)
- This packet, Status line for this row only.

### Contract and implementation

1. Signed-in `/support` gets the existing app shell and working account menu. Signed-out visitors can still read support and use its existing links without signing in.
2. Preserve all existing support content, the exact support mailto, self-service destinations, title, canonical metadata and footer links. Do not reword money, privacy or legal text or add response-time, deletion or payment promises.
3. Keep support content shared between the signed-in and signed-out frames. If `PolicyPageShell` needs an optional framing input, default it to its existing behavior and enable it only from Support; actual policy routes must not acquire an app shell as a side effect. Inspect references before changing the exported component contract.
4. Avoid duplicate public/app headers, duplicate account controls or nested `main` landmarks. Do not add a second account menu or a new sign-out state machine. Do not change `GoalAppShell`, navigation IDs, global route ownership or release switches.
5. Preserve existing tokens on the reading content; this is the missing authenticated frame, not an unapproved support redesign or kit retirement.

### Regression and verification

Add a route regression using the real menu: signed in, Account menu opens and Sign out invokes the mocked session sign-out exactly once; signed out, support, its mailto and self-service links remain accessible with no account menu. Include an actual policy-page caller as a negative control if shared framing changes, proving it retains its existing reading frame. Do not use source-text assertions for the new behavior.

Run the new regression with `support.promises.test.tsx`, then typecheck, token audit and production build. Source-format pins may be removed if made obsolete by the repair, but the rendered support identity, mailto, links and truthful-content contracts remain. Required exact-head CI and release checks below still apply.

## 3. Landing and live acceptance — each row independently

- Claim only through the official picker on the row's own branch; retain every existing writer's work. Registration is not a runtime claim or completion.
- Follow D-370: green required CI, current-main integration and protected merge commit, no model/review dependency or bypass. Keep normal main/release safety gates.
- After the changed web release is ready, dispatch the existing signed-in Live QA workflow in navigation mode. Demo credentials remain in Actions secrets; no manual sign-in, admin, payment, form submission or live sign-out. The runner opens the account menu and presses Escape only.
- Inspect the route's menu captures at 1280 and 390 on the exact observed web/API SHAs. Require visible Sign out, usable page content and no new failure/overflow. A current passing run, not the workflow's source SHA or an upload, is production acceptance.
- Use `Refs #1708` or `Refs #1709`, not a merge-triggered closing keyword. D-409 leaves issue closure to the subsequent passing live-QA run. Do not exclude either route or weaken the runner to make it green.
- Record the implementation/PR/run and remaining verification in the row's one-line Status. Mark the runtime row done only with its required release evidence; the separate docs registration must not make either row look landed.

## Status

- P0-messages-account-menu: registered — GPT-6.1 Sol · ee18 — 2026-11-28 — existing [#1708](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1708) repro inspected; runtime implementation and live acceptance unverified.
- P0-support-account-menu: registered — GPT-6.1 Sol · ee18 — 2026-11-28 — existing [#1709](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1709) repro inspected; runtime implementation and live acceptance unverified.
