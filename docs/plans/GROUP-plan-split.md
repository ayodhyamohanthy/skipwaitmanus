# Group Plan: execution packets for purchases, candidate activation and delegated referrals

Read `docs/BRIEF.md`, the assigned subsection below and `GROUP-bulk-oct31.md`. This is the
implementation split of the owner's October 31 direction, decided under D-200/D-223;
it is not approval of new commercial terms or a production switch. No Group Plan flow is built by this document.

| Field | Contract |
| --- | --- |
| Parent / growth loop | GROUP; L6 saved progress, with candidate-approved referrals feeding L3 |
| Registration | `GROUP-plan-split`, packet-only; `GROUP-recipients` keeps its existing branch and holder |
| Baseline | Main `47e8f6645`, November 25, 2026; register through D-399; claim `d16a563a7`, GPT-6.1 Sol · 01aa |
| Instruction refresh | D-400's founder-protection amendment read on main `30d2f6ebe`: preserve the fixed super administrator and consume existing admin/alert helpers |
| Prior outcome | October 31 direction recorded; #1601 registered the parser and this packet task; no Group runtime or migration exists at this baseline |
| Branches / files | Each row's exact `branch`, `owns` and dependencies are in `assignments.json`; every child updates only its own Status line here |
| Landing | Protected merge-commit auto-merge and required CI, every tier; no independent-review/model gate (D-370) |
| Activation | Group switches start off; only `GROUP-release` can propose activation after the commercial answers and full acceptance |

## 1. Goal and user model

A group buyer pastes candidate emails, checks the recipients and server quote, pays through Chargebee,
and can recover each candidate's allocation. A candidate retains their own account, balance, documents
and decisions. After that candidate grants permission, the buyer can prepare referral requests for the
candidate to approve and send through the existing referral flow. Initial seats and later one-seat additions
are part of the same group; a failed addition cannot damage a paid original purchase.

The buyer expects an exact bill and truthful progress, the seeker expects control of their identity and
applications, and the referrer expects the same private, relevant requests as today. Preview before commitment,
explicit candidate approval and recoverable partial fulfillment follow the existing D-096/D-097 principles;
these are design judgments, not measured conversion gains. Measure aggregate recipient-validation completion,
quote-to-checkout, verified-paid-to-claimed/active, oldest failed activation/email, and proposed-to-approved-to-sent.
Never put recipient addresses, notes or documents in analytics. No new tracking SDK or service.

## 2. Binding rules

- October 31: "Groups can buy a certain number of seats or can increase 1 by 1 post a group buy."
- `GROUP-bulk-oct31.md` §Product contract 1: "Validate, normalize and deduplicate; preview invalid/duplicate
  rows before checkout; never silently charge for dropped recipients. Existing-account lookup must not
  expose account existence or private data to an institute."
- The same contract: "Payment is not proof the buyer controls a candidate's identity, email, resume or
  referral consent" and "Do not quietly reduce that intent to gifting only."
- The same contract: "Paid-but-partly-activated must remain visible and recoverable"; do not invent expiry,
  redistribute candidate balances, remove existing benefits or charge again to recover.
- D-219: "buying never unlocks another level"; spending order is included at the level, free allowance,
  then purchased; founding places are issued and never recycled. `docs/PRICING.md` owns the frozen book.
- D-367: "the price shown is the price charged, with no fee line"; no GST while D-007 applies.
- D-019(e)/D-030/D-049/D-057: the candidate's normal sign-in and verified aliases remain authoritative;
  a referrer sees the name/files only after their own acceptance. No group login or impersonation.
- D-034/D-047/D-147: spend only at first visibility, hold when allowance is missing, and keep the charge
  spent on every employee decline. A group purchase buys no outcome, rank, referrer access or first look.
- D-060: pending-action transactional email, preferences respected, at most one per person per day.
- D-065: no agent real-money QA. TEST provider keys are used only inside Actions under D-387 (4).

## 3. Current behaviour, verified in code

Line anchors are on the baseline above; builders locate the named function again before editing.

| Evidence | Consequence for this build |
| --- | --- |
| `server/bandedCheckout.ts:135`, `startBandedPlanCheckout`: one user, one plan, active-plan and application refusals; `:158` creates one intent and founding reservation | A buyer's existing checkout cannot activate an uploaded list of candidates. Do not loop it with their ids or change the consumer gate. |
| `server/bandedCheckoutProvider.ts:42`, `createBandedPlanPage`: quantity 1 on `checkout_new_for_items`; `:57`, `createBandedReferralPage`: item-price charge lines and fixed-amount discount | Bulk recurring quantities, mixed plans and added-seat proration are not proven by the consumer adapter. Row 6.2 must prove the provider contract first. |
| `server/bandedGrantStore.ts:47`, `createBandedCheckoutIntent`; `drizzle/schema.ts:1500`, `bandedCheckoutIntents`: one user and unique site/invoice | A group needs separate immutable order/allocation receipts. Reusing one invoice as many consumer intents collides. |
| `server/bandedGrants.ts:91`, `fulfillBandedPlanSubscriptionTx`: sets one user's wallet and included cycle; `:246`, extras: purchase key is site/invoice/level | Replaying this function once per candidate can overwrite a plan or collapse ledger keys. Group grants need allocation-specific provenance and a typed adapter. Existing loose adapter types are not a template for new code. |
| `server/bandedSpend.ts:20`, `readBandedAllocationTx`; `:39`, `spendBandedReferralTx`; `:97`, `refundBandedDebitTx` | Retain the existing balance/spend order and lot links. Test group grants through real spend/reversal/refund paths, including later purchases. |
| `server/bandedCheckoutStore.ts:26`, `reserveFoundingPlace`: counter then membership locks; `drizzle/schema.ts:1476`, membership has unique site/subscription | Bulk founding allocation needs a compatible reservation design; one shared group subscription cannot simply be inserted once for every candidate. Never change the cap. |
| `server/db.ts:166`, `resolveLoginIdentity`; `drizzle/schema.ts:59`, `verifiedLoginAliases` | Exact verified alias and canonical owner are the identity source. An uploaded email and `users.email` alone are not proof. |
| `server/chargebeeRoutes.ts:414`, authenticated webhook: independent subscription/payment obligations; `server/chargebeePendingReconcile.ts:78`, recovery through provider truth | A group dispatch must own its event without falling through to legacy grants, while preserving non-group obligations and recovery. |
| `server/privateReferralRoutes.ts:801`, create route; `:852`, `createCompanyReferralRequest` call | Delegation calls the same creator as the candidate, with fresh company, document, cost, block and cap checks. No second referral engine. |
| `server/agentSendApproval.ts:73`, `decideAssistantApprovalWithAgentSend`; `shared/seekerAgents.ts:57`, seeker-created grants | Existing agent grants belong to the seeker, not an institution. Borrow the approve-every-send pattern; never hand a group an agent key or infer consent from payment. |
| `server/emailDelivery.ts:71`, `createTransactionalEmailSender` returns provider acceptance, not inbox delivery | Persist an outbox, leases and attempt results. "Sent" cannot mean the person received or opened an email. |

## 4. Contracts every child preserves

### 4.1 Flags, authorization and routing

`GROUP-contracts` declares `GROUP_PLAN_ENABLED=false`, `GROUP_DELEGATED_SEND_ENABLED=false` and
`VITE_GROUP_PLAN=false` in `.env.example`; server readers enable only the exact string `true`.
Forward server keys through `src/worker.ts`, validate config, and test the declarations/passthrough.
The separate send switch requires the group switch. Off means no menu/CTA, no group database/provider/email
mutation, and 404 from new application routes before reads. The capabilities response may expose only disabled
booleans, without authentication/account data. Existing consumer routes and flags are unchanged.

Recovery of an already-created group payment, grant, refund or outbox obligation continues while new sales are
off (D-042). Distinguish create/consent gates from recovery dispatch. UI hiding is never authorization.
No new auth provider, account role, dependency or paid service. New routes use the existing session resolver,
same-origin mutation protection, Zod validation, bounded inputs and `private, no-store` responses.

Proposed routes: buyer `/groups` and `/groups/:groupId`; candidate `/groups/claim` and
`/groups/permissions`; APIs under `/api/group-plans`. The mount row binds exact methods/paths from the
shared contracts once. Place the buyer entry in existing account navigation; the candidate's paid activation
email and their own Requests/approvals flow are entry points. There is no standalone contact-sales substitute.

### 4.2 Orders, allocations and money

`GroupPlanOrder` is an immutable, versioned server snapshot: group/buyer/site, initial or add-seat intent,
normalized recipient set, per-recipient plan/level quantities, currency/billing route, catalog and approved-policy
versions, integer minor-unit amounts, discount allocation, total and fingerprint. A changed recipient, quantity,
currency, policy or catalog needs a new confirmation. The client supplies neither a price nor eligibility.
Duplicates/invalid entries must be reviewed; never silently omit them at quote or checkout.

Every paid seat has its own allocation, independent of the payer's wallet, plus provider-component receipts.
Seat count derives from verified-paid allocations, never a client increment. An add-seat order belongs to an
existing buyer-owned group and adds exactly the confirmed candidate(s); a one-seat order is valid. Replaying an
addition adds nothing; failing it changes no original allocation. No unassigned paid seats or minimum quantity
are invented: initially seats correspond to the confirmed recipient list (a changeable implementation assumption).

No paid entitlement or activation email before a verified matching payment. Claim and activation are separate:
a paid allocation may await the candidate's existing secure sign-in and consent. Do not provision a user, alias,
password or session from a buyer's email list. Once claimed, grants go only to that canonical candidate.
An existing paid plan, conflicting alias, deleted/suspended account or elapsed paid term is a visible candidate/admin
review state, never an overwrite, merge, new full term or buyer-visible account-existence answer.

The quote can build against fixtures for explicit policy versions. Production returns
`group_terms_unconfirmed` before creating a payable intent if any commercial dimension in §8 is unresolved.
No undefined choice is represented as a zero discount or an implicit term. The 10% permission applies only
to institution purchases; buyer text cannot assert entitlement. How institution eligibility is evidenced is part
of the approved policy, not a new automatic email-domain test.

### 4.3 Persistent schema and transactions

Contract row defines the typed states and exact DDL blueprint before the migration row starts. Required entities:

| Entity | Minimum invariant |
| --- | --- |
| `groupPlanGroups` | Buyer canonical user, site, stable opaque id; deletion cannot cascade away paid evidence. |
| `groupPlanOrders` | Immutable snapshot/fingerprint, buyer/group foreign keys, kind, policy version; unique site/buyer/idempotency key; status and oldest-first recovery index. |
| `groupPlanAllocations` | Order/recipient index and normalized email; nullable canonical candidate bound only after proof; immutable plan/units/amount share; unique order/recipient; paid/claim/activation/review timestamps. |
| `groupPlanPaymentComponents` | Site, order/component/attempt, page/invoice/subscription binding and expected/verified amount/term; unique page/invoice binding and monotonic state/version. |
| `groupPlanProviderEvents` | Unique site/event and refund identifiers, component foreign key, validated outcome/amount/term and processing receipt; many renewal/refund events can refer to one invoice/component without colliding. No raw provider bodies. |
| `groupPlanGrantReceipts` | Unique allocation/provider-term/level/kind; exact ledger row ids and remaining/revoked provenance. Payment and candidate proof required. |
| `groupPlanEmailOutbox` | Allocation/purpose obligation, destination (private), token hash/expiry, attempts, lease, next attempt, provider acceptance and failure code; per-person/day send claim. |
| `groupPlanDelegations` | Candidate, buyer, group, explicit draft/propose scope, consent version, expiry, revocation and revision; no auth tokens. |
| `groupPlanSendApprovals` | Candidate-owned proposal, delegation revision, exact job/note/candidate-selected files and accepted quote fingerprint, expiry, idempotency key, executed request id; one committed request at most. |

Use existing ledger tables for grants/spends, not a second balance. New receipt identifiers must fit existing
column bounds; use validated digests where needed. The schema must make cross-group/order joins impossible
through foreign keys or transaction predicates and tests. All new table/query paths have ownership negatives.
Recipient lists, resume identifiers and tokens are excluded from public logs, Sentry and artifacts.

Use application timestamps. Transactions lock group/order/allocation records before candidate wallet/level
rows, with a documented stable ordering for multiple recipients. Any operation touching founding state locks
the existing site/plan counter before membership/reservation rows, and before wallet locks; plan ids and candidate
ids are sorted. No network call under database locks. The migration's unique constraints settle races.
If current locks cannot compose safely, stop that integration and amend the contract with evidence.

SQL is additive, guarded and apply-twice safe; no historical backfill, seed grants or enum reordering.
Allocate the next free migration number against main and open PRs at claim, pin that exact file in the registry,
and publish the checksum. Migration production acceptance precedes schema-dependent code. Rollback keeps
tables/receipts; forward-fix recovery, never drop purchases. This registration allocates no number or production SQL.

### 4.4 Payment and recovery state machines

Order states: draft -> quoted -> creating_checkout -> pending_payment -> paid -> activating -> complete;
refusals/failures use explicit `requires_review`/cancelled states. Multi-component payments also expose
`partially_paid`; never call the whole order paid before every priced obligation is satisfied. Per-allocation
state is independent, so a crash at candidate 10 resumes there without granting candidates 1-9 again.
Provider-contract evidence decides the supported hosted-page composition; do not pretend a many-plan cart is
one consumer subscription. Quote/confirmation must show any separate payment steps before commitment.

Webhook, authenticated return recovery and scheduled reconciliation call one settlement service. Match
site, buyer's provider customer, immutable component/intent, exact items/quantities, amount, currency, paid
invoice and term. Subscription `active` or browser success alone is not paid evidence. A recognized group event
cannot credit the buyer through a legacy path. Unknown/mismatched events create a durable review obligation;
retryable database failure returns non-2xx and rolls back. Both obligations in a combined event remain recoverable.

Grant keys include site, allocation, provider invoice/term, level and grant kind. Preserve lot ids through spend,
withdrawal and provider refund. The same invoice funding different candidates must not collide. Full refunds
revoke only that allocation's attributable unspent purchased units once; spent/partial/ambiguous amounts go to
review under existing policy, never a negative balance or seizure of another purchase. Refund-before-claim or
before-grant prevents later activation. Cancellation ends only the applicable included term and cannot erase
free/purchased balances. No automatic customer refund right, reassignment or unclaimed-allocation expiry is added.

Group recovery jobs are bounded, oldest first, leased and observable through the existing jobs framework.
Alerts are durable and sanitized. Crash/response loss after provider acceptance is recorded as uncertain and
reconciled; never promise exactly-once inbox delivery from an SMTP/HTTP acceptance. No blind automatic retry
around a payment failure. Recovery notes name the failing boundary and available admin action.
Use the existing admin authorization and alert envelope/recipient helpers as updated under D-400; no Group
module carries a literal administrator mailbox or new password/credential path. The permanent founder's
super-administrator access and canonical aliases can never be removed or suspended by a Group action.

### 4.5 Candidate-approved referrals on behalf

Changeable technical assumption under D-200, following the existing D-141 approve-every-send pattern:
the candidate grants a particular group buyer permission to draft and propose requests, with an expiry they
can see and immediate revocation. Each actual send still requires the candidate's own session approval.
This delivers on-behalf preparation and execution with consent; it is not gifting-only and not impersonation.
No unattended batch sends, general API key, delegated purchases or bypass of normal candidate limits.

Buyer sees their supplied recipient address, their own draft and coarse allocation/proposal progress only.
They get no candidate login method, unrelated wallet/history, resume bytes, referrer identity, private reply,
block reason or employer decision. Candidate selects their own resume and confirms the exact final note,
company/job and current cost. A group grant never unlocks candidate documents or an unaccepted referrer's DMs.

At send, re-check candidate/account state, grant revision/scope/expiry/revocation, proposal ownership/expiry,
document ownership, current quote/coverage and all existing creator rules. Revocation and execution serialize
under the grant/approval locks; the successful creator result, origin/audit and approval completion must have a
durable common idempotency/reconciliation path. Do not copy an approval-before-create gap from an older adapter.
Response loss returns the original request; it never sends twice. Candidate denial/revocation spends nothing.

## 5. Execution order and ownership

All new rows append at the FIFO tail; no existing row is reordered or claimed here. Each row is one file-owned
slice, its own branch/lane, and shares this packet's invariants. `dependsOn` names output, never a shared file.
Overlaps with current billing, schema, notification, navigation and agent work are announced at claim; the later
lander merges main and preserves both changes (D-309/D-314). No ACK from a particular model is a gate.

| Row | Tier | Output needed before it | Outcome / section |
| --- | --- | --- | --- |
| GROUP-terms | 3 | none; owner answer | Record the single commercial answer batch in §8; no runtime or legal edit |
| GROUP-contracts | 1 | GROUP-recipients | Shared schemas, pure state transitions, DDL blueprint, disabled flag readers; §6.1 |
| GROUP-provider | 1 | GROUP-contracts | Source-backed hosted-page/payment component adapter and fixtures; §6.2 |
| GROUP-migration | 1 | GROUP-contracts | Empty durable tables, actual MySQL/apply-twice and production checksum; §6.3 |
| GROUP-schema | 1 | GROUP-migration | Matching Drizzle models and readiness, no behavior switch; §6.3 |
| GROUP-orders | 1 | GROUP-schema | Owned draft/order/allocation repository and initial/add-one operations; §6.4 |
| GROUP-quote | 1 | GROUP-contracts | Frozen-book server quote, explicit policy or refusal; §6.4 |
| GROUP-checkout | 1 | GROUP-orders, GROUP-quote, GROUP-provider | Immutable intent before provider call and recoverable page binding; §6.5 |
| GROUP-payments | 1 | GROUP-checkout | Verified-paid group receipts and one settlement service; §6.5 |
| GROUP-claim | 1 | GROUP-payments | Inbox-proven canonical candidate binding without account creation; §6.6 |
| GROUP-grants | 1 | GROUP-claim | Per-candidate keyed paid-term/extra grants into existing ledger; §6.6 |
| GROUP-notifications | 1 | GROUP-payments | Capped paid-activation email outbox and retry, no marketing; §6.7 |
| GROUP-recovery | 1 | GROUP-grants, GROUP-notifications | Refund/cancellation, reconcile, daily checks and audited review; §6.7 |
| GROUP-delegation | 1 | GROUP-claim | Candidate grants/revokes draft/propose access; §6.8 |
| GROUP-send | 1 | GROUP-delegation, GROUP-grants | Candidate-approved send through existing creator; §6.8 |
| GROUP-api | 1 | GROUP-recovery, GROUP-send | Mount the complete services, jobs and authorization once; §6.9 |
| GROUP-buyer-ui | 1 | GROUP-api | Existing-account entry -> recipients -> quote -> checkout -> progress/add one; §6.10 |
| GROUP-candidate-ui | 1 | GROUP-api | Sign-in -> claim -> benefits -> consent -> approve/decline/revoke; §6.10 |
| GROUP-qa | 1 | GROUP-buyer-ui, GROUP-candidate-ui | Isolated full-stack journeys, negative/race/recovery proof; §6.11 |
| GROUP-release | 1 | GROUP-qa, GROUP-terms, BANDED-release | Explicit Group activation word, exact-SHA release/rollback proof; §6.11 |

`GROUP-terms` is the only owner-parked decision row: its release condition is an authenticated answer to §8,
recorded in the register and pricing/contract docs. Other rows build and land disabled against explicit policy
fixtures; no commercial answer is inferred. `GROUP-release` waits on that output and its own explicit activation
authority. D-399 permits build-ahead preparation, never choosing a reserved answer or landing an owner-held row.

## 6. Per-row build and red-first verification

Every subsection is its row's execution packet. Before edits, name exact planned paths from that row's `owns`,
re-read them and their callers, write its regression/contract tests, run them red, then implement and commit/push
the coherent green change. First commit updates that row's Status. No child changes prices, login, legal copy,
another row's status, or enables a flag. New module names below are planned, not claims that they exist.

### 6.1 GROUP-contracts

Own `shared/groupPlan.ts`, its tests, `server/groupPlanFlags.ts`, config-contract tests, `.env.example`,
Worker passthrough, and `docs/plans/GROUP-schema-contract.md`. Export inferred Zod types for GroupPlanOrder,
GroupPlanAllocation, GroupPlanQuote, GroupPlanPolicy, ProviderComponent, CandidateClaim, Delegation and SendApproval;
closed state/error unions, strict request/response allowlists, safe integer amounts, normalized parser output,
versioned policy/fingerprint inputs and transaction dependency interfaces. Keep Node crypto out of browser contracts.
Write the exact column/index/FK/check DDL blueprint for §4.3; migration builder does not invent new states.
Tests reject unknown fields, duplicate recipients/levels, negative/overflow amounts, cross-currency sums,
missing consent/payment evidence, invalid transitions and enabled-send-with-group-off. Round-trip valid payloads.
Pin public DTOs without private candidate/referrer fields and no I/O in shared modules. No database queries yet.

### 6.2 GROUP-provider

Own `server/groupPlanProvider.ts`, provider tests and `docs/qa/group-provider-contract.md`.
Read current official Chargebee docs for item-price quantity/discount/recurring checkout, one-time checkout,
invoice/payment/renewal/refund events, pagination and idempotency. Cite URLs and checked dates; mock HTTP first.
Export a typed provider adapter for the immutable component contract, never the recipient list. Prove how a
single-band group, mixed-band order and one added seat map to existing item prices and payer/customer receipts.
If the provider requires separate hosted pages, expose exact components/payment progress for confirmation;
never introduce an unapproved Group SKU or claim cross-page atomicity. Economics/proration come only from policy.
Tests verify exact form fields, nonempty idempotency key, bounded deadlines, safe provider response validation,
wrong-site refusal and page-loss recovery. Any TEST I/O uses the existing Actions-only key, no automatic card
attempt, captcha workaround, live customer/price modification or settings change. An unsupported API is reported
with its documented limit and a bounded alternative, not hidden behind a successful fixture.

### 6.3 GROUP-migration and GROUP-schema

Migration owns only next-free `drizzle/deploy/*_group_plan.sql`, `e2e/group-plan-schema.e2e.ts` and this packet;
schema row owns matching `drizzle/schema.ts`, `server/schemaReconcile.ts` and `server/groupPlanSchema.test.ts`.
Follow §4.3 and pin the exact SQL path at allocation. Test real MySQL uniqueness, foreign keys, invalid states,
orphaned account retention, TEST/LIVE separation, immutable receipt binding and concurrent same-key inserts.
Apply twice with existing representative identity/wallet/ledger rows; zero original rows or balances change.
Record production migration/checksum acceptance before the schema row lands. Schema row compares models/readiness
to the accepted SQL and keeps all old consumers compatible. No runtime service or fake allocation seeds.

### 6.4 GROUP-orders and GROUP-quote

Orders owns `server/groupPlanStore.ts`, `server/groupPlanOrders.ts` and their tests. Export buyer-scoped
create/read/update-draft, lock-order/allocate and add-seat operations against §4.2/4.3. Closed/paid snapshots
cannot be edited. Caller-supplied buyer/candidate ids are never trusted. Foreign group/order/allocation is 404.
Tests use two buyers, two candidates, same-key changed bodies, concurrent additions and failed-addition rollback;
one paid seat appears once and existing seats never change. No account-existence lookup in buyer responses.

Quote owns `server/groupPlanQuote.ts`, its tests and the shared quote schema only. Derive item prices and
units from `shared/planFamily.ts`, `shared/bandedCatalog.ts` and the parser, not copied amounts. Export
`quoteGroupPlan` with a server-supplied approved-policy witness or `group_terms_unconfirmed`.
Known 10% arithmetic is integer-only, with a documented deterministic line-allocation algorithm whose shares
sum to the exact invoice total; a rounding witness cannot change the approved total. Do not choose stacking,
pooled volume thresholds, eligibility, renewal/addition discount or founding treatment. Tests cover each explicit
policy fixture, INR/USD, rounding, safe-integer overflow, 500/501 recipients, stale catalog/policy,
outside-band/application restrictions, and a missing policy before any payable intent or provider request.

### 6.5 GROUP-checkout and GROUP-payments

Checkout owns `server/groupPlanCheckout.ts`, `server/groupPlanCheckoutRoutes.ts` and tests. Buyer confirmation
binds the complete quote/recipient/component fingerprint to a durable order before provider access. Check both
flags and policy, canonical buyer, exact group ownership, application gate and founding reservation outcome.
Re-check catalog/provider price and handle reservations under the established counter order. Persist each page
binding before returning it; response loss reconciles the same component inside provider replay rules. Old keys
never silently open another chargeable page. Tests assert zero provider calls on every refusal, cross-buyer
recovery 404 before lookup, changed-body conflicts, provider timeout and uncertain-bind recovery.

Payments owns `server/groupPlanPayments.ts`, `server/groupPlanPaymentStore.ts`, their tests and the
`server/chargebeeRoutes.ts` group dispatch hunk plus tests. Export one typed settlement function for webhook,
return and reconcile. Preserve existing webhook auth and independent non-group obligations. Group invoice
recognition is a durable binding, never a prefix from untrusted `pass_thru_content` alone. Tests include unsigned,
unpaid, wrong customer/site/amount/currency/item/quantity, unknown invoice, delayed/reordered duplicate events,
subscription-active-but-unpaid, partially paid components and a transaction failure after several allocations.
Assert no legacy/buyer grant, no email on unpaid, and no partial committed receipt on failure.

### 6.6 GROUP-claim and GROUP-grants

Claim owns `server/groupPlanClaim.ts`, `server/groupPlanClaimRoutes.ts` and tests. Export paid-allocation
claim/read functions using only the caller's exact verified alias and canonical person, plus a hashed,
short-lived claim token when the email link needs one. The token is not login authority: GET never consumes;
the existing sign-in returns to a token-free path and candidate POST confirms. No token/email in URLs sent to
analytics, logs, referrers or sign-in return parameters; use the existing fragment/claim pattern where needed.
Tests cover unverified/wrong alias, token theft/replay/expiry, simultaneous aliases, suspended/deleted accounts,
refund-before-claim, second candidate and buyer attempting the claim. Payment alone binds no identity.

Grants owns `server/groupPlanGrants.ts`, `server/groupPlanGrantStore.ts`, tests and narrowly scoped existing
ledger/spend integration tests. Grant only a paid, candidate-bound allocation for the confirmed provider term.
Do not overwrite an existing personal or group subscription, refill a spent cycle on replay, or restart an elapsed
term. Park the unsupported state privately. Store allocation-specific ledger receipt keys and source provenance;
use typed adapters and the existing banded included/free/purchased rules. Tests execute grant -> spend ->
pre-pickup withdrawal, claim/decline -> withdrawal, provider refund and later-purchase isolation, two recipients
funded by the same invoice, repeated term events, cancellation/late renewals and concurrent claim/refund.
Purchased units must retain lot attribution; test actual creators/ledger consumers, not only a mock increment.

### 6.7 GROUP-notifications and GROUP-recovery

Notifications owns `server/groupPlanNotifications.ts`, its tests and templates in that module. A verified paid
allocation creates one activation obligation even when candidate activation waits. Use the existing transactional
sender and canonical public origin; no email before payment, no credentials or private candidate details in buyer
mail. Lease claims, capped exponential retries (five attempts, then durable admin review), recipient/day cap,
preferences and provider-accepted/failed/unknown states. Test crash before/after send, retry/backoff, duplicate
payment, same-person multiple allocations and no second acknowledged send. Do not claim inbox delivery.

Recovery owns `server/groupPlanRecovery.ts`, `server/groupPlanRefunds.ts`, their tests, group portions of
daily money checks and the existing audited admin review UI/API. Re-read provider records through §6.5's
settlement function, retry only failed allocation obligations, and provide authenticated buyer recovery plus
admin-only review with immutable audit. Handle confirmed refunds/cancellation as §4.4 requires, including a
refund that arrives before the paid event. No new refund promise, automatic real-money payout or raw balance edit.
Test response loss, out-of-order refund/renewal, spent shortfall, two invoices at one level, bounded repeated
job runs, transaction rollback, failed email, lost alert acknowledgement and recovery while sales are off.
Daily checks reconcile paid totals, allocation shares, grants/debits/revocations, seat counts and founding counts.

### 6.8 GROUP-delegation and GROUP-send

Delegation owns `server/groupPlanDelegation.ts`, its route/test files and shared delegation schemas.
Implement §4.5's candidate-only consent/revoke and buyer draft/propose, default no grant. Scope binds group,
buyer, candidate, explicit expiry and revision; a second buyer or revoked revision sees no candidate data.
Test denial with no consent, another group's paid allocation, suspension, expiry, revoke/regrant and
absence of documents/identities/private history in every buyer DTO.

Send owns `server/groupPlanSend.ts`, route/tests, the minimal existing creator hook and its regression tests.
Candidate approval carries the accepted cost, final note and candidate-owned attachments to the real creator.
All D-034/D-047/D-147, company cap, first-look, work-domain, block and pre-acceptance privacy tests stay green.
Tests race two approvals, revoke versus execution and provider-refund versus approval; interrupt after creator
commit before approval completion and replay to the same request. No auto-send or buyer-selected candidate identity.
Audit actor and candidate separately with sanitized ids, never misleading attribution to an AI agent.

### 6.9 GROUP-api

Own the new `server/groupPlanRoutes.ts` composition and tests, the group-only registration hunk in
`server/_core/index.ts`, group job registration/contracts/tests, and the AGENTS living map. Mount upstream
routes with real storage/provider/identity adapters, not placeholder dependencies. Register bounded group
reconcile, activation and email jobs once. Tests start the real Express route stack and prove end-to-end DTOs,
unauthenticated and cross-buyer/candidate denials, no group reads/writes when off, preserved consumer webhook
obligations and recovery while creation is off. Missing schema/config fails visibly before a provider side effect.
No unrelated refactor of the large route/db files.

### 6.10 GROUP-buyer-ui and GROUP-candidate-ui

Use `DESIGN.md`, the existing Goal primitives and approved goal doctrine. Before design work, inspect existing
flows and research references under the applicable design skill; capture existing relevant entry points. No
new visual system or nested-card scaffolding. Buyer owns `client/src/pages/goal/groups/buyer/**`; candidate owns
`client/src/pages/goal/groups/candidate/**`. Each has its own component tests and capture subfolder.

Buyer: paste -> valid/invalid/duplicate preview -> per-candidate plans/referrals -> server quote and full cost/
renewal terms -> confirmed provider component(s) -> paid/partial/activation/email progress; resume or add one
from the original group's page. Candidate: existing sign-in -> private paid-allocation confirmation -> benefit
status -> grant/deny draft permission -> exact request/resume/cost approval -> result/revoke. Payment/claim is
never consent to delegation. Component tests cover loading, empty, validation, stale quote, refused/pending/
partial payment, email retry, error and offline. Screens show one next step and one black commit.

The buyer row owns only its `/groups` route/navigation hunk; candidate row owns only its claim/permissions
route hunk and the Requests/approval entry. Both integrate current main and preserve each other's App routes.
The existing entry modules are `client/src/components/AccountMenu.tsx` and `client/src/pages/MyRequests.tsx`;
there is no `GoalAccountMenu.tsx` or `goal/requests/` route to invent.
Feature off shows no buyer entry and no new public promises. Capture actual 1280/390 pixels for every money,
consent, failure and recovery state; no product sample records. Test data stays in isolated fixtures.

### 6.11 GROUP-qa and GROUP-release

QA owns `e2e/group-plan.e2e.ts`, supporting fixtures and `docs/qa/group-plan-acceptance.md`.
Use an isolated QA MySQL database, fictional buyer/two candidates/referrer, mocked email and provider TEST/mocks;
never real recipients, payment, production SQL or unlimited demo exceptions for ordinary accounts. Prove initial
purchase, one-seat addition, partial payment, candidate claim, included/free/purchased spend, candidate-approved
on-behalf send, pre-acceptance privacy, decline/withdraw, revocation, duplicate events, refund and recovery after
process restart. Pin both flags off as the shipped default. If TEST payment automation is blocked, use the current
owner payment evidence route; never work around the provider's bot check. Record exact tested SHA/schema/policy,
real request/ledger evidence, redacted provider receipts and inspected 1280/390 captures, plus remaining gaps.

Release owns this packet, acceptance/pricing docs, declared config/Pages build flags and their contract tests.
First require §8 recorded answers, every child acceptance, the banded release/spend path, and explicit owner
authority for Group sales and delegated-send activation. Consumer BANDED-release approval is not Group approval.
Keep unresolved combinations disabled even if a switch is set. After protected merge and applicable exact-main
CI/deployment gates, verify canonical API/web SHAs, readiness, group capabilities and UI at both sizes. A live
checkout handshake stops on the hosted page without paying. No live email or delegated request to real users
is authorized by this packet. Disable new creation/send to roll back; accepted payment/refund/outbox recovery
continues. Done requires actual release evidence, not this packet, a fixture suite or a workflow upload.

## 7. Common verification and stop conditions

Each row: focused red-first tests and existing affected controls, `pnpm check`, `git diff --check`; runtime rows
also the applicable full gate/build and required CI on the composed head. Schema rows need actual MySQL and
production migration receipts. UI rows need inspected pixels. No skipped/weakened login, money, privacy or
existing paid-path assertions. Green required CI is the landing gate; independent review is optional (D-370).

Before calling a child complete, check with file/test evidence: (1) wrong buyer/candidate/site cannot act;
(2) no grant/email precedes paid evidence and candidate proof; (3) replay/crash/refund changes each allocation
once and leaves other purchases alone; (4) consent and current-cost checks survive a revoke/send race;
(5) off flags preserve existing users and accepted-payment recovery; (6) the row's actual API/DB/UI evidence
matches its claim. Packet-specific checks in §6 supplement, rather than replace, the existing controls.

Stop only the affected boundary and report evidence if a named current function changed, a transaction cannot
preserve existing ledger/identity semantics, the provider cannot represent the approved terms, a migration
number collides, the DTO exposes private state, or an action needs an unresolved owner decision. Update exact
scope/contract through normal docs routing; do not invent an API, balance, signup, refund or provider setting.
Push coherent work and report the real state, then take the next eligible task (D-235/D-399).

## 8. One commercial answer batch for the owner

`GROUP-terms` carries these questions together. They are unresolved in the October 31 direction and frozen
catalog; the recommendations below are proposals, not approved policy, and must not be implemented as defaults.

| Question | Recommendation, rating and strongest counterargument | Boundary waiting |
| --- | --- | --- |
| How is an institution purchase qualified, and how do 10% and volume discounts combine, including a later single seat? | Retain the institution-only 10%; explicitly approve its evidence rule and addition eligibility; choose the larger applicable discount rather than stacking, 7/10. This avoids compounded reductions; the counterargument is that institutions may expect both discounts. Non-institution buyers receive no institution discount. | Active policy and payable quotes; arithmetic/validation build against explicit fixtures. |
| Who renews/pays, when does a candidate's term start, and is a one-seat addition prorated/aligned? What happens to a paid unclaimed seat or a candidate already on a plan? | Buyer remains payer; an added seat starts its own full provider-confirmed monthly term without changing existing seats; no automatic proration, replacement, expiry or refund promise, 6/10. Independent dates are predictable but create billing clutter and can waste time before claim; approve the intended unclaimed/existing-plan treatment explicitly. | Provider payable composition, recurring grant interpretation and release; stores can retain exact provider evidence now. |
| How do group seats count toward the existing founding cap/price lock, and what initial minimum applies? | Count each issued candidate membership against the same existing cap, never recycle it, and use one candidate as the minimum, 7/10. It preserves consumer fairness but a large group can consume many founding places. Group billing cannot silently create extra caps or free places. | Founding reservation policy and release; all concurrency/storage work remains buildable. |

Separate final release question after QA: approve the exact Group sales/consent wording and production activation
with the recorded policy and acceptance report. No new Terms/Privacy/Refund sentence is authored here.
The default visibility/approve-every-send assumption in §4.5 requires no extra data use or relaxed consent;
any proposal for wider buyer access or unattended sending returns to the owner first.

## 9. Delivery evidence and Status

For every child, replace its own line with session, branch/head, decisions checked, red/green test output,
PR/required-CI link and the applicable migration/QA/release evidence. Distinguish implementation, verified
payment, claimed allocation, activated benefits, provider-accepted email and complete user journey.

- GROUP-plan-split: original packet/registry work by GPT-6.1 Sol · 01aa — 2026-11-25 — claim `d16a563a7`, implementation `369f8d1dd`; prior evidence: `pnpm check`, focused `nextTask`/`queueGate`/`decisionIdCheck` 208/208, five registry integration tests, 455-row/20-child order validation and picker simulation passed. PR #1609 merged 2026-11-25T08:55:21Z as `dadc0528975dc4bc7fc6fefb8adc1799fe36acee` from exact head `c0cc452c8c84cb02a1ad937a5a4c55f885e87067`; required CI [run](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45579946145) passed typecheck, 3 unit shards, aggregate tests, production build and e2e journeys. Reconciled by Codex GPT-6.1 Sol · 721e against main `f7020bb37`, D-398–D-405, sources `BRIEF`, `AGENTS`, `BUILD_CONTINUITY`, `COLLABORATION`, `PRD`, `DECISIONS`, `GROUP-bulk-oct31`, packet, `PRICING`, `DELEGATION`, and actual prior outcome. Fresh standard focused run is blocked by sparse setup: missing `server/_core/testCredentialGuard.ts`; no runtime/payment/email/migration/activation.
- GROUP-terms: owner — pending the single §8 commercial answer batch; no policy default approved.
- GROUP-contracts: in progress — GPT-6.1 Sol · 9220 — 2026-11-25 — branch `agent/queue/group-contracts`, claim/HEAD `306c0ee24`; read receipt: main `dadc0528975dc4bc7fc6fefb8adc1799fe36acee`, D-398–D-402 and November 25 Group execution receipt checked; sources `docs/BRIEF.md`, `AGENTS.md`, `docs/BUILD_CONTINUITY.md`, `COLLABORATION.md`, `docs/PRD.md`, `docs/DECISIONS.md`, `docs/PRICING.md`, `docs/PAYMENTS_TEST_RUNBOOK.md`, `docs/DELEGATION.md`, `docs/plans/GROUP-bulk-oct31.md`, `docs/plans/GROUP-plan-split.md`. Prior artifacts: parser PR #1606 merged `fbd6e356a`; split PR #1609 merged `dadc05289`. Remaining: §6.1 contracts, disabled flags/config passthrough, DDL blueprint and focused contract tests; implementation/testing pending. Supports safe candidate-approved Group referrals; no new commercial rule or activation.
- GROUP-provider: todo — §6.2.
- GROUP-migration: in progress — GPT-6.1 Sol · deb9 — 2026-11-25 — branch agent/queue/group-migration; D-398–D-402 checked; build-ahead preparation only under D-315 dependency handoff, not globally blocked. Exact dependency-owned DDL blueprint unavailable at GROUP-contracts head `3b5965226db42eadfe2a780b7bafe14e319d1322` (open draft PR #1629): GitHub exact-SHA Contents read of `docs/plans/GROUP-schema-contract.md` returned 404 on 2026-11-25 09:44 UTC. No SQL or migration number allocated; the contract's exact column/state/index/FK/check definitions are required before SQL, and current main/open-PR collision checks before number allocation. Planned acceptance: real MySQL uniqueness/FKs/invalid states, TEST/LIVE separation, retained evidence/immutable receipt binding, concurrent same-key inserts, and apply twice with representative identity/wallet/ledger rows and balances unchanged; strict SQL mode on every concurrency connection. Verified harness patterns in `e2e/banded-migration.e2e.ts` and `e2e/banded-schema.e2e.ts`: fresh UUID databases, localhost/127.0.0.1-only guard and finally cleanup. Stock `e2e/playwright.config.ts` starts the application server; exact schema-only runner plan remains to confirm. Local MySQL and production migration/checksum acceptance UNVERIFIED; no test implementation or run yet. Claim d8493b7be; main preflight 3a5499212; no production effects. Draft PR #1630; implementation and schema tests remain UNVERIFIED. Pinned dependency installation stopped (SIGTERM, exit143) after local inspection found only753MiB disk free and extreme systemload; no package/lockfile contract change, no testpass claimed. Resume exact identity GPT-6.1 Sol · deb9 after dependency and localcapacity permit.
- GROUP-schema: todo — §6.3; production migration proof required first.
- GROUP-orders: todo — §6.4.
- GROUP-quote: build-ahead checkpoint — Cline GPT-6 · 73d8 — 2026-11-25 — branch `agent/queue/group-quote`, claim `0fd637d10`, main `3a5499212`, decisions through D-402. Read BRIEF, AGENTS, BUILD_CONTINUITY, COLLABORATION, PRD, DECISIONS, PRICING, PAYMENTS_TEST_RUNBOOK, this packet and GROUP-bulk-oct31. Parser #1606 and split #1609 merged; GROUP-contracts draft #1629 has no shared schema yet. Catalog-derived integer pricing and deterministic largest-remainder allocation implemented; red-first missing-module reproduction, then 45/45 focused tests passed. Token audit, migration lint, deploy-trigger check and diff check passed. Typecheck/build pending (BigInt literal target error repaired using constructors). Full `quoteGroupPlan`, approved-policy/fingerprint boundary, recipient and stale-policy/application tests await shared contracts. No commercial default, payable intent, provider call or activation. Local disk exhaustion reproduced; own partial clone removed, sparse checkout retained. Draft only; row remains todo.
- GROUP-checkout: todo — §6.5; disabled.
- GROUP-payments: todo — §6.5.
- GROUP-claim: todo — §6.6.
- GROUP-grants: todo — §6.6.
- GROUP-notifications: todo — §6.7; no real recipients.
- GROUP-recovery: todo — §6.7.
- GROUP-delegation: todo — §6.8; no permission by default.
- GROUP-send: in progress — GPT-6.1 Sol · b91a — 2026-11-25 — branch `agent/queue/group-send`; claim `75e5c5a39`, main `ae57f6cc8`, instructions checked through D-402; D-315 build-ahead of `GROUP-delegation` and `GROUP-grants`, draft only; runtime, permission and request-creation acceptance unverified.
- GROUP-api: todo — §6.9; disabled.
- GROUP-buyer-ui: todo — §6.10; hidden.
- GROUP-candidate-ui: todo — §6.10; hidden.
- GROUP-qa: todo — §6.11; full-stack acceptance unverified.
- GROUP-release: todo — §6.11; needs recorded Group activation authority, policy and QA; switches stay off.
