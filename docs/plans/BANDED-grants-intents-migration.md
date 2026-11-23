# BANDED-grants-intents-migration: durable checkout ownership before fulfillment

## Goal and authority

Supply the missing persistence prerequisite of the already-approved `BANDED-grants` contract (D-219, D-366, D-367 and D-370), under D-200/D-223. This is the migration-first split used by `BANDED-schema-migration`, not a new price, refund policy or sale permission. Loop L6: a seeker can recover a confirmed purchase without losing progress or receiving duplicate referrals.

The preserved inspection on main `e8b1bc83d` found that extra-referral checkout stores buyer/cart evidence only in an optional, unawaited activity log after creating the provider page. It creates no pending row for recovery. Plan checkout also writes its intent after page creation. The aggregate per-level balance cannot establish a particular invoice's unspent entitlement. Runtime grant work must close these boundaries before sales activate.

## Task and scope

- ID: `BANDED-grants-intents-migration`; branch: `agent/queue/banded-grants-intents-migration`; lane: `banded-grants-intents`; Tier 1; epic: `BANDED-release`.
- Targets: `@drizzle/deploy/0124_banded_checkout_intents.sql` (provisional number; confirm against main and open migration work at claim), `@e2e/banded-grants-intents.e2e.ts`, and this packet's Status. The owning row may update its own registry status after production acceptance.
- No runtime schema model/readiness, checkout, grant, spend, provider, sales flag, workflow, secret or dependency change in this row. `BANDED-grants` consumes the verified migration afterward.
- If 0124 is allocated before this row starts, choose the next free number, update this packet and the row's exact SQL owns together, and never edit an applied migration.

## Additive storage contract

Create one initially empty `bandedCheckoutIntents` table, using the repository's MySQL migration conventions and application-clock timestamps:

| Field group | Required contract |
| --- | --- |
| Identity | Auto-increment primary key; `site` is `test` or `live`; `checkoutIntentId` supports the existing 96-character checkout key. Unique `(site, checkoutIntentId)`. |
| Owner and immutable request | `userId` references users; account deletion sets it to NULL and preserves the receipt. `kind` is `plan` or `referral`. Store the selected `planId`, billing route (`IN`/`INTL`), currency (`INR`/`USD`), exact expected total in minor units, and a 64-character request fingerprint. An orphaned owner may never be rebound by a webhook or recovery request. |
| Immutable priced cart | Versioned JSON containing the frozen plan price or distinct per-level item-price IDs/quantities/unit amounts/line amounts, subtotal, discount percentage, discount amount and total. Runtime Zod validation and fingerprint generation belong to BANDED-grants; this row preserves exact JSON on replay. JSON validity and non-negative/positive amount checks are enforced where applicable. No client price is authoritative. |
| Provider binding | Nullable `hostedPageId`, initial `invoiceId` and `subscriptionId`, supporting existing provider ID bounds. Unique `(site, hostedPageId)` and `(site, invoiceId)`; multiple NULLs are allowed before binding. An initial subscription invoice cannot fulfill another checkout. Renewal grants remain keyed separately by confirmed subscription term and level. |
| Recovery state | `status`: `creating`, `pending`, `fulfilled`, `requires_review`, `cancelled`. Persist `createdAt`, `updatedAt`, checkout expiry and the provider replay deadline; nullable bounded failure reason, last-checked and fulfilled timestamps. Index status/last-check/creation for bounded oldest-first reconciliation and owner/site/creation for authenticated recovery. |

Use explicit unique and foreign-key names within MySQL identifier limits. Retain all existing data, ENUM ordinals, defaults and migration SQL. No fake purchase, grant, founding place or wallet conversion is seeded. The table is unused until dependent runtime lands. Existing binaries remain compatible with the additional empty table.

## Runtime consumer contract (BANDED-grants; not implemented by this row)

1. Persist the immutable owner/site/request/cart/fingerprint before a hosted-page call for both checkout kinds. Same-key replay requires identical stored ownership and request. Bind the provider response afterward under the same unique intent. A response-loss retry stays inside the provider's original idempotency window; outside it, recover the original page or park visibly, never silently create another chargeable page.
2. Recovery authorizes by the stored owner before any provider call. Webhook, return recovery and hourly reconciliation settle the same durable intent; paid amount, currency, item lines and provider identifiers must match. Database failures roll back the entire grant and request provider redelivery. Mismatches park with a durable reason and alert. Late payment on a released founding reservation never oversells: issue only if the locked counter can safely accommodate it, otherwise park for refund/review without an invented price.
3. Included grants need no new table: use one keyed `plan_grant` per site/subscription/confirmed term start/level with the included balance mutation in the same transaction. A different event for the same term cannot refill spent allowance or overwrite a newer term. Term expiry/cancellation removes only the applicable unspent included amount; free calendar allowance and purchased balance stay separate.
4. Purchased lots reuse the append-only ledger: one keyed purchase row per site/invoice/level. Each purchased debit records the supplying purchase-row ID in a documented, validated ledger provenance field distinct from its referral-request reference. A request reversal retains that provenance. Serialize grant/spend/refund under the wallet then level locks; founding operations additionally preserve the established counter-before-membership lock order.
5. Deduplicate refund transactions by site and provider refund ID. Revoke only that purchase's own available unspent units, capped by its grant and prior revocations. Partial or ambiguous refunds park for review under existing policy. A later withdrawal must not restore entitlement revoked by a provider refund, and a refund of an earlier purchase never consumes a later purchase. Aggregate `purchasedRemaining` is reconciled against the attributed ledger lots. Historical unattributed debits are a visible review case, never guessed into a purchase.
6. Extend the daily money check to compare per-level included/purchased balances, cycle/lot grants, debits/reversals/revocations, duplicate invoice/term grants, paid unfulfilled intents and invalid founding counts. Do not route a banded intent through legacy scalar pack crediting or admin review. Keep legacy recovery intact and sales off until BANDED-release.

## Verification and release

1. Write real-MySQL checks before SQL: apply the actual migration to an isolated CI database with representative existing wallet/ledger/0123 rows. Confirm old rows/defaults/ENUM ordinals and balances remain unchanged.
2. Exercise valid plan/referral intent inserts, JSON preservation, invalid state/currency/amount rejection, duplicate checkout/page/invoice rejection, TEST/LIVE isolation and owner deletion retaining the receipt with NULL owner. Verify the declared recovery index columns/order.
3. Prove concurrent same-key inserts leave one durable owner/cart; competing invoice binding succeeds once. Replay the guarded migration runner and show zero files applied without changing pending/fulfilled JSON or money/founding rows.
4. Run migration lint, focused migration/deploy tests, compiler and build. Required CI includes the real MySQL cases and apply-twice proof. No test skip, fixture-only fake database proof, direct SQL against production or edited historical migration.
5. Land through protected merge-commit auto-merge only with required PR CI and main CI green and the D-212 release hold clear. Deploy using the ordinary exact-green-main API migration workflow. Record SQL SHA-256, merged SHA, main CI and the production migration job's apply/checksum or matching skip receipt. Verify canonical release/readiness under the existing deploy classification, distinguishing unchanged runtime from a new image.
6. Only production-verified migration/checksum acceptance completes this row. BANDED-grants then merges main, adds the matching schema model/readiness and runtime contracts, and passes fresh CI. Keep the additive table during rollback; repair forward through the guarded runner, never drop purchase evidence or enable sales to test it.

## Status

BANDED-grants-intents-migration: done — agent/queue/banded-grants-intents-migration — 9be773683 — [PR #1468](https://github.com/ayodhyamohanthy/skipwaitmanus/pull/1468). Empty `bandedCheckoutIntents` table in `drizzle/deploy/0124_banded_checkout_intents.sql`; tests in `e2e/banded-grants-intents.e2e.ts`. Merged to main at `9be773683`; satisfies the durable checkout intent persistence prerequisite of `BANDED-grants`. Reconciled done under D-381.

Registration — GPT-6.1 Sol · cfad — November 21, 2026 — main `d9e28de10`, decisions through D-374. Preserves the packet and consumer contract from prior holder GPT-6.1 Sol · 8aac's claim `93154537b` and handoff `8f03fbf3b`; official takeover is `c8bc301e9`. Registration is published separately from the original work branch so its docs merge cannot hide unfinished fulfillment. No SQL, runtime schema, grant, provider call, payment, flag activation or production application is included. Implementation, real-MySQL proof, required CI and production acceptance remain pending a normal picker assignment.
