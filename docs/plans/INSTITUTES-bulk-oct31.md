# Institute bulk plans and referrals - founder build packet

Status: AUTHORIZED FEATURE, implementation pending. This packet is not a product-pass, sales enablement, ownership claim or deployment approval.

## Original direction and scope
On October 31, 2026 at 11:36 IST the founder requested institutes buying bulk plans and referrals for candidates using their email addresses in the easiest format, permitted a 10% discount, and requested account activation plus activation emails to the list once paid. At 11:38 IST he said to push this to the repo for building.

Source: authenticated owner messages `phonemsg-01M6892F33T035JZSAA1917NKY` and `phonemsg-01M6896AS74F9S9T45Y9M9FY75`. The original request uses referrals (credits); public product copy continues to say referrals / referral requests. The new request authorizes this feature despite the earlier generic new-work pause. It does not reopen unrelated consumer prices, legal copy, referrer fairness, production/migration holds, or arbitrary activation-email sends.

Build the full flow, not a contact-sales form presented as checkout: institute enters candidate email list, picks plans/referral quantities, sees validated recipients and a server quote with the institution discount, pays through the existing supported payment path, then receives truthful activation/delivery progress. Only verified payment may unlock paid entitlements and queue activation emails. No actual customer list or payment has been supplied with this request.

## Current grounded architecture
Read current main before implementation. Initial research base: `c78379131280a9423a9bf2ae69f2854f89148da9`.
- `docs/PRICING.md` / D-219 record the frozen banded catalog. PR #666 (`agent/pricing/banded-plans-oct25`) implements it; legacy main pricing is not a valid substitute. Do not revive retired Pro/Max gifts or fixed-term passes. `shared/giftSubscriptions.ts` and `giftSubscriptionFulfillments` are historical receipts-only.
- Chargebee hosted checkout, server-authoritative intents, verified provider events and recovery are the existing money architecture (`server/chargebeeRoutes.ts`, `kitCheckout.ts`, `chargebeeSubscriptionApi.ts`). Browser return/success text, a quoted amount or an email address is not payment proof.
- Ledger changes are idempotent and transaction-bound (`server/creditLedger.ts`, `paymentFulfillments`). A bulk purchase needs durable per-recipient allocation and reconciliation, not repeated unkeyed wallet increments.
- Existing seeker-agent delegation is draft-only (`shared/seekerAgents.ts`, `server/seekerAgentRoutes.ts`). It is not institute send authority. Candidate identity/verified aliases and existing privacy/block/acceptance rules must remain intact.

## Product contract
1. Accept easy email-list input. Paste/newline/comma entry and optional CSV preview are proposed reversible UX, not a requirement for a paid import service. Validate, normalize and deduplicate; preview invalid/duplicate rows before checkout; never silently charge for dropped recipients. Existing-account lookup must not expose account existence or private data to an institute.
2. The founder permits a 10% institute discount. Compute it server-side from the approved catalog in integer minor units, bind quote/version/recipients/quantities/currency to an immutable intent, reject client price tampering. Do not alter consumer prices. Interaction with D-219 top-up volume discounts, minimum bulk quantity, rounding allocation, term/renewal and founding-cap allocation remains OPEN until grounded in existing rules or resolved by the legitimate product process. Do not silently stack discounts or sell an unsupported term.
3. A buyer can purchase benefits for listed candidates. Payment is not proof the buyer controls a candidate's identity, email, resume or referral consent. Preserve existing accounts and entitlements; do not merge accounts or grant institute login access because it supplied an email. Candidate activation must establish control of the target email using the existing secure sign-in/claim pattern.
4. The founder explicitly wants referrals on behalf of candidates. Do not quietly reduce that intent to gifting only. Design the delegated action/consent route against current identity/privacy rules: candidate-approved, scoped, auditable and revocable action; same official job-link, resume, matching, request-spend and pre-acceptance privacy rules. The precise delegation grant and allowed institute visibility are OPEN design work, not authorization to impersonate a candidate or send requests solely from an email-list upload. Resolve via existing rules first and bring only a genuinely unresolved founder-only choice to Instinct.
5. Verify provider payment against exact intent, amount, currency, customer and invoice/hosted page; reject unsigned, unpaid, wrong-amount/currency, replayed and cross-buyer events. Grant each candidate allocation once. Activation emails are transactional fulfillment of a paid allocation, not marketing; delivery attempts need durable idempotency, retry and truthful status. No credentials, tokens or recipient list in logs/public artifacts. Model provider acceptance separately from inbox delivery.
6. Paid-but-partly-activated must remain visible and recoverable; no double grant on duplicate webhook, timeout, crash, retry or recipient's existing account. Refund/reversal/cancellation and unclaimed/invalid-recipient states need explicit money-safe handling before sales enablement. Do not invent expiry, redistribute candidate balances, remove existing benefits or charge again to recover.
7. Goal UI throughout, one clear next step, mobile390 and desktop1280. Handle loading, empty, validation errors, payment pending/refused, partial activation, email retry and offline. No promised guaranteed referral/interview/job, no fake counts or live-looking sample data.

## Ownership and legitimate implementation route
This is a new explicit founder feature, not permission to take another row's files. No implementation row or writer is claimed by this docs PR. Register bounded Tier 1 build slices through the existing ownership/review process before writers start; retain the one durable feature outcome and do not substitute an advisory-only task.

Proposed new-file first slice, subject to path collision check: `shared/instituteBulk.ts` and tests, `server/instituteBulkService.ts` and tests, `server/instituteBulkRoutes.ts` and tests, `client/src/pages/goal/institutes/**` and captures. These are proposed paths, not an owns grant. Contract/service tests can use dependency injection and synthetic fixtures while integration handoffs are pending; no fake production adapter completion.

Shared integration must obtain exact limited-hunk ACK / scope registration BEFORE edit:
- PR #666 pricing holder: approved catalog / institutional quote adapter, no frozen consumer change.
- Payment/webhook and identity holders: route registration, verified provider reconciliation, candidate activation and refund integration.
- Shared DB/schema and notification holders: durable purchase/allocation/outbox schema and ledger writes, email delivery; no migration execution or shared lifecycle edit on this packet alone.
- App routing/goal shell holders: navigation registration and new route, no parallel shell/settings rewrite.
Record actual accepted holder, owned paths and exact source head. No forced claim/lease release, self-review, manual pass or review-gate waiver. Claude reasons; verified available development models implement, with actual model-history-independent Tier 1 review.

## Proof and delivery gates
- Red-first list parser/duplicates/invalid input, 10% quote arithmetic/tampering, cross-institute access and identity binding.
- Payment-negative and duplicate/reordered webhook tests; partial failure/restart/idempotent grants and notification outbox tests; refunds and recovery without duplicated balances.
- Candidate activation collision/verified alias/revoked delegation and privacy negatives; no request without the accepted delegation scope.
- Real local full-stack flow with synthetic recipients/provider TEST or mocks, exact base/head and limitations. No real charge/email/production DB test without its separate authority.
- Inspect actual390/1280 pixels and retain screenshots; full current-main gate, independent review and exact required CI. Verify deployment only after normal authorization and landing. Schema-dependent code cannot activate before its migration is separately approved/applied/verified.
- Report separately: directions published, docs merged, implementation built, payment verified, entitlements activated, provider email accepted, actual user journey verified. Never label the feature shipped from this packet or a green unit suite.

## Next action
Publish these instructions now as requested. Resolve catalog/discount/delegation/shared-path questions through current sources and existing owners while a verified available development session receives a bounded first slice. Keep previous repair obligations intact. Bring blockers to Instinct first; no founder relay for ordinary coordination.
