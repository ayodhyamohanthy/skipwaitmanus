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

## Prospective qualified execution amendment (November 10)

The earlier Tier 2 review FAIL and the unknown-model isolated implementation
prep remain recorded and held. No existing code/test contribution is renamed,
adopted or cleared. This packet and queue row are requirements/process docs,
not proof that their author wrote future product code. D-151 concerns actual
build/takeover/fix contributions; D-190 separately bars a packet writer from
landing its packet. A fresh external implementation must retain these facts.

After this complete carrier and its proposed routes receive separate review,
required exact-head CI and ordinary non-writer protected landing, the registered
future task may be claimed by its qualified actual operator. Start from pristine
then-current main plus the ordinary qualified claim, not the unused local patch,
test bodies or captures. Supply the public current source and these requirements
to the selected author model. Retain the actual supplied input, raw public output,
observed selection and exact applied output bytes. The actual external author must
write all product/test changes; an operator semantic edit remains a contribution
and cannot be called transport. Do not import the unknown prep into its history.

The future implementation uses task `UI-messages-signin-button` and the same
registered branch. No duplicate row or cosmetic rewrite clears the old prep.
Proposed actual transport session: `Instinct · public-model-review-nov10`.
Mistral route `messages-author-mistral-nov10` supports build and fix only.
Kimi route `messages-review-kimi-nov10` supports review and land only.
Both refer to public NVIDIA-hosted selected models, not internal metadata.
They are proposals until independently qualified and merged on main. Their
qualificationReview points to this carrier's public review thread, not an
assertion that a candidate file is trusted or already approved.

Route qualification is not completed execution qualification. Before accepting
any future PASS/Fixed marker, the exact task/role/operator/claim/input/output
receipt must itself receive separate review and merge to main. Every real
contributor is retained and excluded from its own review/landing. All Tier 1
red-first, existing test, exact-head, provider-continuity and released-pixel
acceptance above remains. Unknown or insufficient evidence still holds work.

This amendment changes only the prospective carrier's execution-readiness path
under landed D-311. It does not assert an implementation, qualified execution,
provider login, product release or retrospective author identity. It does not
waive the prior hold on unused prep or substitute repeated static review for it.
