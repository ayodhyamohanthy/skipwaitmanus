# UI-messages-signin-button

The released signed-out `/messages` goal screen wraps `GoalButton` inside
`SignInButton`. The latter adopts literal button children only; `GoalButton`
is a component, so actual production-bundle DOM contains nested buttons and
two accessible Sign in buttons. Existing tests replace the wrapper with a div
and cannot detect that invalid DOM.

## Boundaries

Tier 1 sign-in work per `docs/DELEGATION.md` section 3. The runtime delta is
bounded UI markup and action wiring, but it starts sign-in and is not exempt
from Tier 1. Keep one existing styled GoalButton
and call the existing `useAuth().openSignIn()` without arguments. This is the
same function the wrapper calls, not a change to auth destination, mechanism,
return handling, cookies, permissions or policy. No signed-in message, request,
sendBlock, privacy, fetch, server or idempotency behavior changes. No feature
flag or shared auth wrapper edit. No new dependency or spending.

Own exactly GoalMessages.tsx and the two named tests in the registration.
The current graph has no unfinished row owning these exact paths. This is not
proof of unpublished state; preserve other work and coordinate new overlap.

## Acceptance

- Red-first regression detects the actual nested-button behavior. Corrected
  DOM has no button descendants in a button, one accessible Sign in action,
  and clicking it calls the unchanged action exactly once with no arguments.
- Existing signed-out rule/goal/no-GET checks remain. Replace the old mocked
  wrapper-specific assertion explicitly, do not drop it silently. All signed-in
  messaging/privacy/idempotency controls remain and pass.
- Build and inspect actual 1280/390 production-bundle pixels and DOM. Local
  synthetic signed-out checks do not establish real WorkOS/provider acceptance.
- Separate final source review, exact required CI and current-main checks
  pass before normal protected merge. No admin or code owner-only exception.
- After merge, verify live release identity and signed-out button behavior;
  do not claim real provider login or all-role acceptance without that evidence.

Status: blocked registration proposal. Actual external review FAIL on
`c951200862db4c23086740eaf41832dc6eb0caf9` identified the Tier 2
under-classification. Correcting the tier does not grant a pass. Actual
underlying builder-model identity/independence evidence remains unresolved;
no invented model identity, review marker, cosmetic rewrite or history wash
may clear it. Keep this proposal and isolated prep held pending a genuine
qualified Tier 1 review and landing route. Do not repeat static review only
to reconfirm the identity gap.

Registration only. Isolated local red-green tests and before/after
captures exist separately; no implementation or release is asserted here.
