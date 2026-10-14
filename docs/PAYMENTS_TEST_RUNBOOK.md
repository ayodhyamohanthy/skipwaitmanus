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

- Cards: https://razorpay.com/docs/payments/payments/test-card-details
- UPI: https://razorpay.com/docs/payments/payments/test-upi-details
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
