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

## Macaly service qualification amendment (November 10)

PR #1100 normally merged the prospective NVIDIA routes and requirements at
`48e93b3454c7dbb79b07055964f1f5288cd26a35`; its postmerge required checks
passed. It shipped no Messages implementation. The actual operator subsequently
made ordinary qualified build claim
`6ed758fc4d168a5c6c78185f8d78e7b38e754434` with route
`messages-author-mistral-nov10`. The bounded NVIDIA playground attempts produced
no adopted product or test bytes, no red-first result and no completed execution
receipt. Preserve that empty claim, failed attempts and the older unused prep;
none is a completed author contribution or a product release.

### Service terms and evidence scope

The current [Mistral model card](https://build.nvidia.com/mistralai/mistral-large-4-1t-a52b/modelcard)
expressly incorporates the [NVIDIA API Trial Terms](https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA%20API%20Trial%20Terms%20of%20Service.pdf).
Sections 1.2 and 1.4 limit trial service and generated content to internal testing
and evaluation, excluding production use absent separate rights. Section 4.2 also
restricts distribution of generated content. A technically available free direct
endpoint does not supply those production rights. Do not use either NVIDIA route
for future production authoring, review or landing qualification under this packet.
The registry retains both original records, not renamed or deleted. The unused
NVIDIA reviewer route is revoked. The old author's record stays structurally
qualified only to let the existing resolver verify the already-created empty
claim's zero-contribution interval; revoking it would make that supported proof
fail closed. This historical record is no permission for another NVIDIA claim,
execution or production contribution. No temporal-revocation capability is
asserted, and no historical claim or verdict is rewritten.

Prior observed review PASS/FAIL facts remain evidence of what was observed, not
production-use permission. Internal static evaluation is a stated trial purpose;
that does not establish permission to republish raw generated verdict output or
to rely on it alone for future product acceptance. Do not republish additional
raw NVIDIA verdicts. This amendment does not retroactively erase observations,
assert a license waiver, change historical review outcomes or silently remove
public records. Future source acceptance uses a separately qualified service
and an independent actual review model with sufficient rights for that use.

[Macaly's terms](https://www.macaly.com/terms-of-service), sections 3.10 and 3.12,
permit commercial use, modification and distribution of generated app code,
subject to their restrictions including reusable template resale. Section 8.3
permits Free-plan customer data and generated content to become community
templates. Supply already-public repository code and sanitized requirements only,
never private account data, credentials, transcripts or unreleased private input.
The [Free-plan guide](https://www.macaly.com/docs/en/welcome/pricing) requires a
paid upgrade to continue after free credits are exhausted. Stop rather than
upgrade, top up or use paid export. This packet authorizes no purchase or new
billing obligation. A free balance is not evidence of model identity or execution.

### Prospective Macaly routes, not label substitution

Continue the same task, branch, Tier 1 requirements and exact product/test
allowlist. Register new service-specific route IDs
`messages-author-macaly-mistral-nov10` (build/fix) and
`messages-review-macaly-deepseek-nov10` (review/land), with the actual operator's
own retained selection observations and independently qualified public model
identities. The proposed canonical identifiers `mistral-large-4` and
`deepseek-v4.1-flash` normalize only the observed public family/version labels,
not a hidden checkpoint or provider endpoint. The Mistral family is not treated
as independent from the earlier NVIDIA Mistral identity. Homepage selection
qualifies only the prospective route: before submitting project source or using
a response, confirm the selected model and absence of a project-level override
on the actual new task composer, and retain that evidence with the execution.
Do not copy an NVIDIA observation, rename its route, infer a hidden
endpoint from a visible label, or count different service labels for the same
model as independent. An unqualified or uncertain identity holds that route.

The carrier must receive separate exact-version review, required green CI,
current-main checks and ordinary non-packet-writer protected landing before the
new routes are used. A static carrier review is not a completed product execution
receipt. The actual operator then uses the ordinary picker with its exact
admitted route and supported session-scope restrictions; no targeted fabricated
claim, duplicate row, queue jump or history rewrite. The old claim remains. A new
qualified build claim can treat that interval as non-contributing only if the
landed provenance resolver proves its entire single-parent interval empty.

Start fresh product work from pristine then-current main plus that ordinary
claim. Supply current public source and these requirements, not the unused prep,
its tests or captures. The actual selected model writes every product/test byte.
If free ZIP or GitHub export is unavailable, retain a complete textual patch or
complete-file response through ordinary chat; do not buy an export or silently
rewrite generated semantics. Retain exact input, raw sanitized response, selected
model, applied bytes and resulting commit range. If the service cannot return
usable complete bytes within its free allowance, report that measured blocker;
no fabricated receipt or successful execution.

Independently review and merge each exact build/fix/review execution receipt onto
main before completion markers. Keep every real contribution and exclude its
actual model from its own review/landing. Macaly route qualification alone proves
neither productive generation nor tests. All original red-first, signed-in
privacy/idempotency, exact-head, provider-continuity and released 1280/390 pixel
acceptance remains. The unchanged sign-in behavior, money/legal/auth-policy
boundaries and unknown-prep hold remain intact.
