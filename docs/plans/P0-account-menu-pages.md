# Account menus on Messages and Support (D-019, D-409, D-412)

Two independent Tier 1 P0 repairs. Each row has its own branch and source files;
status belongs here, not in the shared D-212 plan row. This is restoration of the
existing account control, not a new sign-in method or a page redesign.

## Evidence and visual target

[Live QA run 46065479203](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46065479203)
used API and web `f02de526ad1dbb29fbfb5496980c64bf17f3d12e`.
Its `live-qa-f02de526ad1dbb29fbfb5496980c64bf17f3d12e` artifact
([15230259128](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/46065479203/artifacts/15230259128))
contains `seeker/messages-1280.png`, `messages-390.png`, `support-1280.png`
and `support-390.png`; all four were inspected. The account-menu check fails
on both routes at both widths, while 34 other checks pass. Existing automated
issues [#1708](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1708) and
[#1709](https://github.com/ayodhyamohanthy/skipwaitmanus/issues/1709) are the
reproductions; do not rerun the failure merely to confirm it.

Source inspected on main `3508530aaf046afe3145003feb2306169e617c5d`:
`App.tsx` routes directly to `Messages` and `Support`. `GoalMessages` renders
only its local main element; `Support` uses the non-policy fallback in
`PolicyPageShell`, which renders the legacy public header. Neither renders
`AppShell` or `GoalAppShell`. The completed `P0-goal-shell-sign-out` repair
therefore cannot supply their account controls.

Reference lock: the existing `AppShell`/`AccountMenu` and `DESIGN.md` own the
account interaction, focus, goal tokens and responsive chrome. Keep each page's
content, one next step and primary action. Reuse the menu, never clone its
sign-out code or add another auth provider. No new visual world or external
component/dependency is needed.

## P0-messages-account-menu

Branch `agent/queue/p0-messages-account-menu`; issue #1708; loop L6.

### Contract and implementation

- Add the existing authenticated app shell at the Messages page boundary,
  once, for signed-in loading, empty, populated, recoverable-error, offline
  and open-chat states. `AppShell` already supplies the shared account menu
  and hides the mobile bottom bar on `/messages`; preserve that behavior so
  the composer is not covered. Do not nest app shells.
- Preserve signed-out sign-in behavior and auth-loading behavior. Keep
  `GoalMessages`, `GOAL_PAGE` and `orderChats` exports and the existing DM
  acceptance/follow refusal, ownership, fetching and idempotent-send paths.
- Menu opening, Escape/focus return and Sign out use the existing account
  control. Sign out clears private referral browser data and calls the
  session's sign-out once, exactly as it does on working shell routes.

### Owns

- `client/src/pages/Messages.tsx`
- `client/src/pages/goal/messages/GoalMessages.tsx`
- `client/src/pages/goal/messages/messagesAccountMenu.test.tsx`
- `client/src/pages/goal/messages/messagesGoal.test.tsx`
- `client/src/pages/goal/messages/messagesSignInButton.test.tsx`
- `design/goal-ui/captures/messages/**`
- This packet's Messages Status line.

The shared shell and `AccountMenu` are read-only dependencies, not another
implementation target. If their API proves insufficient, name the exact
additional path and evidence before widening the normal task plan.

### Verification and completion

Add the missing consumer-visible regression: mount the page with the real
shell/menu boundary and deterministic auth/data fixtures; cover menu access
while list data is pending, empty, failed and while a chat is open. Assert
Escape returns focus, Sign out clears private data/calls sign-out once, and
the signed-out control still opens the existing sign-in flow. Do not replace
existing DM privacy or idempotency assertions with shell mocks.

Run the focused new and existing Messages tests, the shared account-menu/sign-out
regressions, typecheck, token audit and production build once on the composed
candidate. Required CI must pass. After deployment, use the existing signed-in
Live QA workflow with demo accounts, inspect `/messages` at 1280 and 390, and
record the actual API/web SHAs and passing menu checks. Exercise sign-out only
in an isolated authorized demo session or the existing local fixture, never in
the navigation-only live runner. No real message is sent. The issue remains
open until the later passing live run closes it; use `Addresses #1708`, not an
automatic `Fixes`/`Closes` directive in the implementation PR.

## P0-support-account-menu

Branch `agent/queue/p0-support-account-menu`; issue #1709; loop L6.

### Contract and implementation

- Supply the existing authenticated app shell/account menu on `/support`
  once, without changing signed-out public access or the page's SEO,
  breadcrumbs, support links, mailto action, content or legal/payment wording.
- Keep the actual policy routes on their existing released frame. If a narrow
  `PolicyPageShell` content/chrome split is necessary to avoid nested public
  and app headers, scope it to the Support use case and preserve defaults
  for all other callers. Do not wrap all legal pages in an authenticated shell.
- Preserve loading/unknown-auth, signed-out and signed-in states without
  inventing an authenticated identity. Reuse `AccountMenu` and its existing
  cleanup/sign-out behavior; never add a local sign-out implementation.

### Owns

- `client/src/pages/Support.tsx`
- `client/src/App.tsx` (Support lazy route binding only; default Support remains auth-free for public prerendering)
- `client/src/components/PolicyPageShell.tsx`
- `client/src/pages/supportAccountMenu.test.tsx`
- `client/src/pages/goal/policy/policyText.goal.test.tsx`
- `design/goal-ui/captures/support/**`
- This packet's Support Status line.

No Terms, Privacy, Refund, Cancellation or shared money string is editable.
Shared shell/menu components are read-only dependencies as for Messages.

### Verification and completion

Add the missing regression with the real shell/menu boundary: signed-in Support
opens the menu, Escape returns focus, Sign out clears private data and invokes
session sign-out once; signed-out Support stays readable and all existing
self-serve links remain reachable. Assert no duplicate reading/app chrome and
no app shell or changed text on the actual policy callers. Preserve existing
content tests instead of re-pinning new wording.

Run focused Support/policy and shared account-menu tests, typecheck, token audit
and production build once on the composed candidate. Required CI must pass.
After deployment, dispatch the existing demo-account Live QA workflow, inspect
`/support` at 1280 and 390 and record actual release SHAs plus passing menu
checks. Also inspect signed-out Support and a policy-route control at both
widths. Do not send support email or make a payment. Leave issue #1709 open
until a later passing live run closes it; use `Addresses #1709` in the PR.

## Guardrails

Both rows preserve D-030/D-049/D-057/D-406/D-408 login methods, D-019 privacy,
D-055 referrer boundaries and all money rules. No API, schema, migration,
provider, configuration, price, paid tool or live switch changes. No QA route
exclusion, weakened menu assertion, fabricated screenshot or early issue
closure. Protected PR and green required CI apply under D-370; implementation
and exact production acceptance are separate from this registration.

## Status

- P0-messages-account-menu: make green — Claude Code · 3770 — 2026-11-28 — takeover of #1720 (red: the AppShell wrap inside GoalMessages pulled unaudited legacy modules into a goal page, and messagesIdempotency's auth mock lacked useUser). Signed-in Messages now sits in GoalAppShell (inbox, "Messages"), the goal shell that carries the shared account menu since P0-goal-shell-sign-out; signed-out stays the bare page. 109 Messages/boundary tests pass, typecheck and token audit clean. Unverified: live /messages after deploy.
- P0-support-account-menu: in progress — GPT-6.1 Sol · ee18 — 2026-11-28 — implementation `35cfa6397`; 49 focused tests, typecheck, token audit and production/prerender build pass; six local Chromium captures at 1280/390 show working menu/Escape and unchanged public/policy frames (`design/goal-ui/captures/support/account-menu-ee18/`); required CI and exact-release QA pending.
