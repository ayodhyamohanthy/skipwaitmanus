# Payments testing runbook (provider matrix, two Chargebee sites)

Founder instruction, Oct 14 2026 (relayed): record the payments testing setup and rules in the repo docs.
This runbook supersedes the "test site only" framing in `docs/QA_PAYMENTS.md` where they differ. Keep both.
Card numbers are NOT stored here. They rotate; always read them from the Razorpay docs below.

## 1. The two Chargebee sites

| Site | What it is | Wired to |
|---|---|---|
| `skipwait` | LIVE Chargebee site | Production checkout (skipwait.me) |
| `skipwait-test` | Chargebee test site, catalog mirrors production | Nothing by default |

- Production checkout talks to the LIVE `skipwait` site. A payment started on skipwait.me is a real charge unless the gateway behind it is in test mode.
- Before any card entry, confirm which site and gateway mode the hosted page belongs to. If it is not what the run expects, stop and report. Do not pay.
- The vaulted entry "Chargebee skipwait site TEST-environment API key" is production write access. No agent uses it without explicit founder approval for that specific action. The `skipwait-test` key is a separate vault entry.

## 2. Razorpay test references (read numbers from here, do not copy them)

- Root documentation (founder's pointer, all Razorpay docs): https://razorpay.com/docs/home
- Cards: https://razorpay.com/docs/payments/payments/test-card-details
- UPI: https://razorpay.com/docs/payments/payments/test-upi-details
- Chargebee side (founder: "if anything is needed on chargebee side you can check this website"): https://www.chargebee.com/docs/
- Chargebee + Razorpay card/UPI testing: https://www.chargebee.com/docs/payments/2.0/kb/billing/how-to-test-card-upi-payments-via-razorpay-with-chargebee-integration
- Success UPI handle: `test@razorpay` (confirm in the UPI doc before use)

## 3. Provider matrix (run on BOTH sites)

Every row runs on `skipwait-test` and on the live `skipwait` site. Record result, transaction id and refund id per cell.

| Method | Variants |
|---|---|
| Cards | Visa, Mastercard, RuPay, Diners, Amex |
| Card type | credit and debit |
| EMI | at least one EMI plan |
| UPI | success handle and a failure case |

Run one qty-1 INR credits pack (the smallest one-time purchase) as the unit of test unless the founder picks another.

## 4. Rules

1. Refund after every payment. No payment is left unrefunded at the end of a step.
2. Wallet-verify between payments: read `/api/credits/summary` before and after each payment and after each refund; the balance must return to the starting value.
3. Stop on a decline. Do not retry with a different card to get around it; report the decline and its message.
4. No writes on the live site beyond the test transactions themselves (no catalog, plan, customer or subscription edits).
5. Keys live in the vault and are never printed, logged, committed or pasted into chat or docs.
6. Real charges need the founder's go. `AGENTS.md` and `docs/QA_PAYMENTS.md` prohibit real-money QA by default. A run on the live site needs explicit founder approval for that run.
7. Credits move only through the in-app flow with the exact cost shown.
8. Capture evidence for each cell: hosted page URL (site name visible), success redirect, wallet delta, Chargebee transaction, refund id and status.

## 4a. Failure rule (standing, founder Oct 14 2026)

Any payment-path failure triggers an immediate notification to the founder in his iMessage thread, naming the failing leg and attaching the evidence. This is a standing instruction for every payments run, not only one run. Failures covered: checkout page generation, hosted page, webhook delivery, credit landing, provider decline, refund failure. Agents report the failure to the main agent at once with the leg, the evidence (URL, transaction id, response, screenshot) and what was left unrefunded; the main agent owns the message to the founder. Do not wait for the end of the run, and do not retry around the failure first.

## 5. Webhook flip procedure (test window only)

The app receives billing events at `/api/chargebee/webhook`, authenticated with the webhook credentials of the site that sends them. The `skipwait-test` site must reach production only during the test window.

1. Founder approves the window (start and end time).
2. Note the test site's current webhook URL and credentials location (do not print secrets).
3. Point the `skipwait-test` webhook at `https://skipwait.me/api/chargebee/webhook`. Confirm production accepts that site's authentication; if it rejects the events, stop and report instead of loosening verification.
4. Run the matrix on the test site. Watch for unmatched-event handling in the webhook route.
5. Revert the webhook URL to its original value immediately after the window.
6. Verify the revert: the dashboard shows the original URL, and a test event no longer reaches skipwait.me.
7. Record the window and the revert in the gate doc.

Do not set `TRUST_CLOUDFLARE_CONNECTING_IP`, and do not change webhook verification code to make a test pass.

## 6. Open items

- Which Razorpay gateway mode (test or live) is attached to each Chargebee site is to be confirmed from the Chargebee dashboard and recorded here.
- Matrix results go in `docs/BUGFREE_GATE.md` item 4.12, which QA owns.

## 7. Failure-mode recovery (what the code does today, and what a human does)

Source: code audit of `server/chargebeeRoutes.ts`, `server/db.ts` (`fulfillChargebeePayment`, `resolveRequiresReviewPayment`, `revokeCreditedPaymentCredits`) and `server/privateReferralRoutes.ts`, Oct 14 2026. Any failure here also triggers the section 4a notification.

How a payment becomes credits: checkout creates a `pending:<hostedPageId>` row in `paymentFulfillments` tied to the checkout intent. A paid Chargebee event (`payment_succeeded`) at `/api/chargebee/webhook` is matched to that row by hosted page and intent, amount and currency are compared, and credits are added in ONE database transaction (status `credited`, wallet balance, ledger row). Redelivery of the same event, or a second event for the same checkout, returns `duplicate` and adds nothing. A paid event that cannot be tied to a checkout, or whose amount differs, is parked as `requires_review` and the admin is alerted. A failed transaction returns 500 so Chargebee retries.

| Failure | What happens in code | Human recovery |
|---|---|---|
| Missed webhook (app down, 5xx, wrong URL or credentials) | Chargebee retries a failed webhook up to 7 times: 2 min, then 6 min, 30 min, 1 h, 5 h, 1 day and 2 days apart (https://www.chargebee.com/docs/billing/2.0/kb/platform/at-which-rate-can-we-expect-the-webhook-calls-in-chargebee-will-there-be-any-performance-disruption). The scheduled job `chargebee-pending-reconcile` (hourly tick) re-reads every checkout still pending after 15 minutes from Chargebee (read only) and credits the paid, matching ones through the webhook's own safe path; paid but unmatched ones go to `requires_review` with an admin alert, and a batch where Chargebee cannot be read at all fails the window so it reaches Sentry. Rows older than 7 days are not re-checked automatically. A buyer returning also triggers: `/api/chargebee/credit-recovery` runs when the buyer returns to the app with the hosted page id. | 1. In Chargebee, find the paid invoice and the hosted page id. 2. In the database find the `pending:<hostedPageId>` row for that user. 3. Ask the user to reopen the success page (it calls credit-recovery), or replay the event from the Chargebee webhook log to `/api/chargebee/webhook`. 4. If neither works, admin review queue `credited` decision (`POST /api/admin/payments/review/:id`) after the row is `requires_review`. 5. Record in the gate doc. |
| Stuck pending (paid in Chargebee, row still `pending`) | Same as above; nothing alerts on a stale pending row. | Same procedure. Check the wallet and ledger before crediting by hand so it is never credited twice. |
| Delayed settlement (UPI, bank, EMI pending) | Credits land only after Chargebee reports the invoice paid. The user sees pending. | Wait for the provider event. Do not credit by hand until the invoice is paid in Chargebee. |
| Double charge (two paid hosted pages for one intent) | The second paid page does not match a pending row, so it is parked for review and the admin is alerted. Credits are not added twice. | Refund the extra payment in the Chargebee dashboard (manual). |
| Amount mismatch (tax, coupon, catalog drift) | Parked as `requires_review`, no credits added, admin alert. | Admin review: decide `credited` or `rejected`, with a note. |
| Failed refund (API 403, gateway refusal) | The app never calls the Chargebee refund API. Refunds are made by a person in the Chargebee dashboard, or by a script with a read-write key. The old admin `refund` route is disabled (410) because it never refunded provider money. | Refund from the Chargebee dashboard (manual fallback). If the key lacks permission, check the key's scope on the correct site, or use the dashboard. Once the refund succeeds the webhook revokes the credits (next row). Notify the founder. |
| Refund made at the provider (dashboard or API) | The webhook handles `payment_refunded`. A FULL refund of a credited pack takes that payment's credits back, only if all are still in the wallet (balance never goes negative); the row becomes `refunded`. A partial refund, a refund after the credits were spent, or an unreadable refund is parked as `requires_review` (reason starts with `refund_`) with NO wallet change and an admin email. A refund that maps to no credit purchase also alerts. Redelivery does nothing. Policy decided by the founder via main on Oct 14 2026 and flagged as changeable. | Review parked refunds in Admin > Payments requiring review. Decide whether to leave the credits, or use `revoke-credits` if they are still there. Subscription refunds are not handled here and will alert as unmatched. |

Not covered: `credit_note_created` is not used (it also fires for non-refund credit notes); subscription refunds do not adjust entitlements; partial revocation of the unspent part of a spent pack is not done (needs a product call). The scheduled reconcile job covers the missed-webhook and stale-pending gaps.

Check the job: admin scheduled-jobs status (`/api/admin/jobs`) shows the last run of `chargebee-pending-reconcile`; a failed window means Chargebee could not be read or a row errored.

## Verified credit semantics for asks (QA, live, request 13, Oct 15 2026)
Observed behaviour, not a new policy:
- Closing an ask after `intro_made` does NOT refund the monthly credit. A closed (hired or otherwise) ask keeps its credit consumed.
- The only credit-return path is withdrawing BEFORE acceptance.
- Withdrawing AFTER acceptance correctly returns 409. An accepted-then-closed ask consumes the credit for good.
- A pass by a referrer still spends the credit while the ask stays open for other employees (founder decision).
Do not change any of this without the founder's explicit say-so via the parent.
