# Payments testing runbook (provider matrix, two Chargebee sites)

Founder instruction, Oct 14 2026 (relayed): record the payments testing setup and rules in the repo docs.
This runbook supersedes the "test site only" framing in `docs/QA_PAYMENTS.md` where they differ. Keep both.
Razorpay can rotate test cards, so section 2a lists only the recurring cards that were read from the Razorpay page on Oct 16 2026. Re-read the docs below before relying on them.

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

## 2a. INR recurring card tests (subscriptions): use the recurring test cards

Why: a plain test card such as 4111 1111 1111 1111 is not a recurring card. Razorpay returns "not eligible for recurring payments" and the Chargebee card leg fails. That is a wrong test card, not an app bug. Do not retry with the same card.

Sources: https://razorpay.com/docs/payments/recurring-payments/cards/test-cards and https://www.chargebee.com/docs/payments/2.0/payment-gateways-and-configuration/razorpay-cards

Domestic cards (read from the Razorpay page, Oct 16 2026): any future expiry, any 3-digit CVV.
- Visa 4100 2800 0000 1007 (the older Visa 4718 6091 0820 4366 still works for mandate registration)
- Mastercard 5305 6200 0006 0000
- RuPay 6527 6589 0000 1005
Steps: enter the card, tick the tokenisation / recurring consent, then click Success on the mock 3DS (AFA) page. A mandate is not created without a successful 3DS step.
Caution: the Razorpay page also lists 5305 6200 0006 0000 in its `payment_timed_out` failure table, so if that Mastercard times out, use the Visa or RuPay card above and tell QA.

International / Export presentment (Chargebee page, only when international payments are enabled on the Razorpay account): Visa 4012 8888 8888 1881; Mastercard 5555 5555 5555 4444 or 5105 1051 0510 5100. Not yet run by QA. Domestic and Import use different Razorpay test accounts and different cards; do not mix them.

Browser: Chargebee support says to use a regular headed browser with pop-ups allowed. The hCaptcha is passive and headless automation can trigger it; a captcha frame on the page is not by itself a blocked payment. There is no TEST-only switch to turn it off.

Unverified until QA confirms: the Chargebee page lists a Rs 15,000 maximum amount for this flow, and Razorpay says an auto-debit reaches Success or Failure about 5 minutes after it is created. Treat both as unverified here.

Razorpay approved skipwait.chargebee.com on Oct 16 (BUGFREE_GATE 4.14, cleared by the owner). Live payments stay the owner's own: one ₹99 UPI buy-and-refund (D-065); agents never pay.

Merchant eligibility (Razorpay, recorded Oct 17 2026): SBI credit-card EMI (rejected Oct 16) and HDFC credit-card EMI (rejected Oct 17) are not allowed for the skipwait.me business. Ordinary cards, UPI and recurring are not shown to be affected. Keep both EMI banks out of any availability or marketing claim; if EMI is ever offered, re-verify the eligible banks on the Razorpay dashboard first.

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
4. No writes on the live site beyond the test transactions themselves (no catalog, plan, customer or subscription edits). Catalog item prices are created by the owner, or by the admin catalog sync's apply step at `/admin/catalog-sync` that the owner triggers after reading its dry run (D-069); the sync only creates and never edits a provider object.
5. Keys live in the vault and are never printed, logged, committed or pasted into chat or docs.
6. Agents never make real payments (D-065; `AGENTS.md` and `docs/QA_PAYMENTS.md` prohibit real-money QA). Live-site cells are the owner's own: one ₹99 UPI buy-and-refund, and a USD test needs a buyer outside India (D-065).
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

How a payment becomes credits: checkout creates a `pending:<hostedPageId>` row in `paymentFulfillments` tied to the checkout intent. A paid Chargebee event (`payment_succeeded`) at `/api/chargebee/webhook` is matched to that row by hosted page and intent, amount and currency are compared, and credits are added in ONE database transaction (status `credited`, wallet balance, ledger row). The ledger row is keyed to the payment (`payment-credit-<paymentId>`, reference `payment_fulfillment`), so the database refuses any second credit of the same payment, by any path. Redelivery of the same event, or a second event for the same checkout (including the real webhook arriving after credit recovery or the reconcile job already credited it), returns `duplicate` (`payment_already_reconciled` when the payment is parked, rejected or refunded) and adds nothing, without an unmatched-payment alert. A paid event that cannot be tied to a checkout, or whose amount differs, is parked as `requires_review` and the admin is alerted. A failed transaction returns 500 so Chargebee retries.

| Failure | What happens in code | Human recovery |
|---|---|---|
| Missed webhook (app down, 5xx, wrong URL or credentials) | Chargebee retries a failed webhook up to 7 times: 2 min, then 6 min, 30 min, 1 h, 5 h, 1 day and 2 days apart (https://www.chargebee.com/docs/billing/2.0/kb/platform/at-which-rate-can-we-expect-the-webhook-calls-in-chargebee-will-there-be-any-performance-disruption). The scheduled job `chargebee-pending-reconcile` (hourly tick) re-reads every checkout still pending after 15 minutes from Chargebee (read only) and credits the paid, matching ones through the webhook's own safe path; paid but unmatched ones go to `requires_review` with an admin alert, and a batch where Chargebee cannot be read at all fails the window so it reaches Sentry. Rows older than 7 days are not re-checked automatically. A buyer returning also triggers: `/api/chargebee/credit-recovery` runs when the buyer returns to the app with the hosted page id. | 1. In Chargebee, find the paid invoice and the hosted page id. 2. In the database find the `pending:<hostedPageId>` row for that user. 3. Ask the user to reopen the success page (it calls credit-recovery), or replay the event from the Chargebee webhook log to `/api/chargebee/webhook`. 4. If neither works, admin review queue `credited` decision (`POST /api/admin/payments/review/:id`) after the row is `requires_review`; the review adds a pack only to a payment that was never credited, and only once. 5. Record in the gate doc. |
| Stuck pending (paid in Chargebee, row still `pending`) | Same as above; nothing alerts on a stale pending row. | Same procedure. Check the wallet and ledger before crediting by hand so it is never credited twice. A token-recovery grant (`/admin/token-recovery`) is not tied to a payment and is not guarded against a second credit: check the payment row first. |
| Delayed settlement (UPI, bank, EMI pending) | Credits land only after Chargebee reports the invoice paid. The user sees pending. | Wait for the provider event. Do not credit by hand until the invoice is paid in Chargebee. |
| Double charge (two paid hosted pages for one intent) | The second paid page does not match a pending row, so it is parked for review and the admin is alerted. Credits are not added twice. | Refund the extra payment in the Chargebee dashboard (manual). |
| Amount mismatch (tax, coupon, catalog drift) | Parked as `requires_review`, no credits added, admin alert; the amount actually paid is recorded with the park (`billing.payment_amount_mismatch`). If Chargebee then refunds it while it waits, every refund is recorded once per event and alerted. Only refunds that add up to what the buyer paid, in that currency, mark it `refund_of_uncredited_payment` (close only). A refund of just the overcharge, an unreadable amount or another currency leaves it creditable as `refund_not_full_before_credit` (review round 1, Oct 18 2026). A payment credit recovery holds before its paid webhook (hosted page mismatch or incomplete) keeps the page's invoice id and paid amount (`billing.payment_paid_evidence`), and the paid webhook fills both in when recovery could not, so its refund is matched and checked the same way. Whatever the stored reason, "Add N credits" is refused while the payment's recorded refunds add up to what was paid, refund records from before the refund currency was saved included (review round 2, Oct 18 2026). | Admin review: "Add N credits" (`credited`, once) or "Reject, add nothing" (`rejected`), with a note. The row shows what Chargebee refunded; for `refund_not_full_before_credit`, check the refunds in Chargebee and add the credits only if the buyer still paid for the pack. A payment refunded in full while it waited offers only "Close, nothing to add". |
| Failed refund (API 403, gateway refusal) | The app never calls the Chargebee refund API. Refunds are made by a person in the Chargebee dashboard, or by a script with a read-write key. The old admin `refund` route is disabled (410) because it never refunded provider money. | Refund from the Chargebee dashboard (manual fallback). If the key lacks permission, check the key's scope on the correct site, or use the dashboard. Once the refund succeeds the webhook revokes the credits (next row). Notify the founder. |
| A live Pro/Max subscription nobody knew about, or a late Pro/Max renewal or gift, after D-067 | (Live since `08d193a0`; the owner attests there are no Pro/Max users, so this is the fallback if that is wrong.) The holder is Free at once: their wallet reads as Free everywhere, and the next read or the hourly `plan-credit-cycles` run rolls it to Free through the ledger (leftover cycle and carryover credits expire with one ledger row each; purchased credits stay). Nothing is granted for the subscription again. Each Chargebee event naming a retired item price (`skipwait_pro_monthly-*`, `skipwait_max_monthly-*`), or naming no plan for a wallet or intent still stored as Pro/Max, is recorded once as a `subscriptionEvents` receipt with status `ignored` and reason `plan_retired` (a replay of the same event id returns `duplicate`, and is not alerted again); the wallet and any pending intent are unchanged; a `billing.retired_plan_event` activity is written and the administrator is emailed "cancel the subscription and refund the customer" (`createRetiredPlanAlerter`; `system.retired_plan_alert_sent` records whether the email went out). A renewal arrives as several events with different ids, each alerted: one retired-plan email for the renewal event, one for the payment event (and one for a renewal reminder if that webhook is on), plus one unmatched-payment email for the payment (parked `requires_review` with `alertUnmatchedPayment` and a `billing.payment_unmatched` activity). Expect at least three emails for one renewal, all naming the same subscription; they are one renewal, not several. A claimed gift of a retired plan is recorded (the receipt), parked as `plan_retired` and never fulfilled into a wallet, and alerted once per gift, by whichever event or claim parks it; a redelivered event or a repeat claim gets the same answer with no second email, and a gift credited before D-067 asks for nothing. A claim attempt answers 409 `plan_retired` and writes `billing.gift_claim_refused` every time. | A person cancels the subscription and refunds each payment in the Chargebee dashboard (the app cannot self-cancel it: `/billing` shows a Free plan with no cancel action). Then tell the subscriber in plain words what happened and that the refund is on its way. Record both in the gate doc. Agents never touch live Chargebee. |
| A subscription event on an item price SkipWait cannot place (not Pro/Max), after D-067 | (Live since `08d193a0`.) Possible when a subscription a wallet still holds (for example an ended kit pass, whose wallet reads Free) gets an event whose item price is not in the price book, such as a price renamed in Chargebee before the D-069 catalog sync. It is recorded once as a `subscriptionEvents` receipt with status `ignored` and reason `unsupported_plan`, grants nothing and changes no wallet; a `billing.unsupported_plan_event` activity is written and the administrator gets an "unrecognised plan event" email with no Pro/Max label and no refund instruction (`system.unsupported_plan_alert_sent`). A paid invoice in the same delivery is also parked and alerted as unmatched (row above). | Check in the Chargebee dashboard which plan the subscription is on. If it is a current plan whose item price was renamed, fix the price book (or run the D-069 sync) so that subscription's next event applies, and tell the owner; the recorded event itself replays as a duplicate. Refund only what the customer paid for and did not get. If it turns out to be Pro/Max, follow the row above. |
| A referrer-role checkout after the D-055 switch-off | (Live since `08d193a0`.) `POST /api/chargebee/checkout` or `/api/chargebee/subscription-checkout` with `role: "referrer"` answers 403 `referrers_never_pay` ("Referrers never pay on SkipWait. Nothing has been charged.") after sign-in and before any availability probe, provider call or checkout intent, with a denied `billing.credit_checkout_refused` or `billing.subscription_checkout_refused` activity. A referrer payment started before the switch still recovers (`/api/chargebee/credit-recovery`), credits through the webhook and refunds normally, because those paths read the role stored on the intent. | None for the refusal (nothing was charged). To sell to referrers again, the owner flips `REFERRER_PURCHASES_ENABLED` in `shared/referrerPurchases.ts` (D-042: switched off, not deleted). |
| Refund made at the provider (dashboard or API) | The webhook handles `payment_refunded`. A FULL refund of a credited pack takes that payment's credits back, only if all are still in the wallet (balance never goes negative); the row becomes `refunded`. A partial refund, a refund after the credits were spent, or an unreadable refund is parked as `requires_review` (reason starts with `refund_`) with NO wallet change and an admin email. A refund that maps to no credit purchase also alerts. Each refund is recorded on the payment with its Chargebee event id (`billing.refund_needs_review`, or `billing.refund_credits_revoked` for the automatic take-back), so a redelivered or replayed event does nothing, even after the payment was credited, and a new refund of a payment that is no longer credited always alerts. A later refund of a payment still parked after its credit, or already closed by the admin's review, puts it back in the queue as `refund_repeated`; a later refund of a payment refunded in full or rejected is recorded and alerted, unchanged. Policy decided by the founder via main on Oct 14 2026 and flagged as changeable. The admin review never credits a refund-parked payment again (the pack was already added): `credited` and `rejected` are refused with 409 (P0-refund-review-double-credit, Oct 18 2026). | Check the refund in Chargebee (the row shows what Chargebee refunded), then in Admin > Payments (`/admin/payments`) choose one: "Take back unused credits" (`revoke_unused`) removes up to the pack's credits from the purchased balance only, never below zero; enter the credit count that matches the refund (required for a partial or repeated refund). The result says how many were taken back and how many had already been used; the row becomes `refunded` (`refund_reviewed_revoked`). Take-backs are counted across refunds and never exceed the pack: the first ledger row is keyed `payment-refund-<paymentId>` (the same key as the webhook's full-refund revocation), each later round `payment-refund-<paymentId>-<round>`. "Keep credits and close" (`keep_credits`) closes it as `refunded` (`refund_reviewed_kept`) with no wallet change. Subscription refunds are not handled here and will alert as unmatched. |

Not covered: `credit_note_created` is not used (it also fires for non-refund credit notes); subscription refunds do not adjust entitlements; taking back the unused part of a refunded pack is an admin decision (above) and the server does not yet suggest the credit count from the refunded amount; the take-back cap counts credits actually taken back, so check what earlier refunds covered before entering a count; a payment back under review drops out of the buyer's receipts until it is closed again; a refunded row counts its full amount in the admin revenue summary; the first-paid-invoice promo grant (off while `PROMO_GRANTS_ENABLED` is false) is not taken back on a refund. Refunds are deduplicated by the event id recorded in the operational activity log in the same transaction (no refund table or migration yet). The scheduled reconcile job covers the missed-webhook and stale-pending gaps.

Check the job: admin scheduled-jobs status (`/api/admin/jobs`) shows the last run of `chargebee-pending-reconcile`; a failed window means Chargebee could not be read or a row errored.

## Verified credit semantics for asks (QA, live, request 13, Oct 15 2026)
The founder has since ruled changes to these rules (D-034, D-035 with D-052, D-038 with D-050, D-047, D-061, D-066); the code follows them as each slice ships, so re-verify then.
Observed behaviour, not a new policy:
- Closing an ask after `intro_made` does NOT refund the monthly credit. A closed (hired or otherwise) ask keeps its credit consumed.
- The only credit-return path is withdrawing BEFORE acceptance.
- Withdrawing AFTER acceptance correctly returns 409. An accepted-then-closed ask consumes the credit for good.
- A pass by a referrer still spends the credit while the ask stays open for other employees (founder decision).
Do not change any of this without the founder's explicit say-so via the parent.

## Parked: work-email reverify enforcement (task 6 PR 2)

Status: DEFERRED by the founder's relay (revisit early January 2027, or sooner if referral volume matters). PR 1 (dry-run sweep, grandfathered policy in shared/reverify.ts) is live. Design, parent-approved 15 Oct 2026:
- Epoch 2026-10-16; window 90 days from max(workEmailVerifiedAt, epoch).
- Kill switch REVERIFY_ENFORCE, default OFF, dry-run logging first.
- When due, in one transaction: clear workEmailVerifiedAt (domain stays), release claimed-but-not-accepted pending asks (credit stays consumed, kind note to the seeker), notify the referrer. Accepted and in-progress asks are never touched.
- Reminders at 14 and 5 days left, deduped via a guarded additive migration (take the next free number at build time; 0084 was free on Oct 15).
- A released unclaimed ask waits and expires normally; the expiry path owns the credit.
Enforcement ships only after QA verification and an explicit OK. The credit lines above predate D-034 and D-038 (a claim that lapses spends no credit); re-check them against the register before building.
