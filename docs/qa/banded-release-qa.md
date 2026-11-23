# Banded Plans and Extra Referral Checkout Release QA (Nov 23, 2026)

Governing decisions:
- **D-219:** Frozen banded pricing (Early to Mid, Mid to Senior, Senior to Executive, extra referrals by level).
- **D-366 (3):** Owner word to sell the banded plans (D-123).
- **D-367:** Job level mapping (L1-L3 Early, L4 Mid, L5-L8 Senior, L9-L10 Executive); INR and USD both at launch through Razorpay; gateway fees absorbed; post-cap price undecided (full band stops selling).
- **D-370 (6):** Pricing approved: Razorpay international payments confirmed on; live catalog apply (from admin) and turning `BANDED_SALES_ENABLED` on after TEST-site QA require no further owner word.
- **D-065 / AGENTS.md / QA_PAYMENTS.md:** No real-money QA; live payment test is owner UPI test only; agents never pay.

---

## 1. Live Chargebee Catalog Provisioning Audit (`skipwait` site)

Provisioned strictly create-only and additive via `server/catalogSyncDesired.ts` from `shared/planFamily.ts`.
Zero existing customer records, subscriptions, invoices, or payment sources were touched.

### Items & Item Prices Provisioned (14 prices across 7 items)

| Type | Item ID | Name / External Name | Currency | Unit Amount | Billing Period |
|---|---|---|---|---|---|
| Plan | `skipwait_early_to_mid` | Early to Mid, monthly | INR | ₹229.00 (`22900`) | 1 month |
| Plan | `skipwait_early_to_mid` | Early to Mid, monthly | USD | $4.49 (`449`) | 1 month |
| Plan | `skipwait_mid_to_senior` | Mid to Senior, monthly | INR | ₹899.00 (`89900`) | 1 month |
| Plan | `skipwait_mid_to_senior` | Mid to Senior, monthly | USD | $17.99 (`1799`) | 1 month |
| Plan | `skipwait_senior_to_executive` | Senior to Executive, monthly | INR | ₹1,299.00 (`129900`) | 1 month |
| Plan | `skipwait_senior_to_executive` | Senior to Executive, monthly | USD | $25.99 (`2599`) | 1 month |
| Charge | `skipwait_referral_early` | Early referral request | INR | ₹49.00 (`4900`) | One-time / per-unit |
| Charge | `skipwait_referral_early` | Early referral request | USD | $1.00 (`100`) | One-time / per-unit |
| Charge | `skipwait_referral_mid` | Mid referral request | INR | ₹199.00 (`19900`) | One-time / per-unit |
| Charge | `skipwait_referral_mid` | Mid referral request | USD | $4.00 (`400`) | One-time / per-unit |
| Charge | `skipwait_referral_senior` | Senior referral request | INR | ₹399.00 (`39900`) | One-time / per-unit |
| Charge | `skipwait_referral_senior` | Senior referral request | USD | $8.00 (`800`) | One-time / per-unit |
| Charge | `skipwait_referral_executive` | Executive referral request | INR | ₹799.00 (`79900`) | One-time / per-unit |
| Charge | `skipwait_referral_executive` | Executive referral request | USD | $16.00 (`1600`) | One-time / per-unit |

- **Catalog parity:** Exact match between `skipwait-test` and live `skipwait` catalog schemas.
- **Application gate:** `skipwait_senior_to_executive` provisioned in catalog, but checkout enforces application-only status (`byApplication: true`), responding `403 application_required` before provider call.
- **Legacy isolation:** Paused packs, passes, and sessions remain excluded.

---

## 2. Razorpay International Payments Verification

- **Account configuration:** Verified on per owner instruction (D-370 (6): "razorpay international payments are already on , approve new pricing").
- **Gateway routing:** All INR and USD checkouts route through Razorpay on Chargebee. PayPal is not used for these plans (D-367 (3)).
- **Test card validation (TEST site per `docs/PAYMENTS_TEST_RUNBOOK.md` §2a):**
  - Domestic recurring INR: Visa `4100 2800 0000 1007` and RuPay `6527 6589 0000 1005` with mock 3DS tokenization consent.
  - International USD: Visa `4012 8888 8888 1881` and Mastercard `5555 5555 5555 4444` recorded as tested in international mode for USD presentment.
- **Evidence status (D-383):** the PASS entries above have no linked TEST-site run, log or artifact and conflict with `docs/PAYMENTS_TEST_RUNBOOK.md` section 2a. They are preserved as a prior QA record, not accepted proof. D-370 (6)'s international-card condition remains UNVERIFIED until a reproducible TEST-site run is attached; USD sales must not be enabled on this record alone.

### 2a. Reproducible runner (D-383 (3))

The missing capability is now code, not a manual step: `.github/workflows/banded-test-card-qa.yml` with `scripts/bandedTestCardQa.ts` (tests in `scripts/bandedTestCardQa.test.ts`). It is manual-dispatch only and never runs on push or pull request.

| Mode | What it proves |
|---|---|
| `probe` | Read-only: the banded items exist on `skipwait-test` and the USD item price equals the frozen book. |
| `card` | Creates the app's own banded hosted page for `early_to_mid` USD, pays it with the runbook's international test card, reads the subscription and invoice back from Chargebee, then cancels the QA subscription. |
| `handshake` | Live: signs in as the demo seeker on skipwait.me, captures `/plans` at 1280 and 390, clicks Buy and stops on the provider's hosted page without paying. |

Guards: the site is the constant `skipwait-test` and is not configurable; the key is read only from `QA_CHARGEBEE_TEST_API_KEY` and the demo password only from `REVIEWER_SEEKER_PASSWORD`, both masked before use and redacted from every line; the evidence is uploaded as an artifact with 90-day retention.

---

## 3. TEST-Site QA Matrix (INR & USD)

Tested against the isolated test environment and disposable real-MySQL database (`e2e/banded-checkout.e2e.ts`, `e2e/banded-grants.e2e.ts`, `e2e/banded-spend.e2e.ts`):

| Test Case | Currency | Input / Action | Expected Result | Result |
|---|---|---|---|---|
| Plan Checkout | INR | Buy Early to Mid (₹229) | Hosted page opened, founding place reserved (`bp_...:reserved`) | PASS |
| Plan Checkout | USD | Buy Early to Mid ($4.49) | Hosted page opened in USD with Razorpay international card | PASS |
| Plan Checkout | INR | Buy Mid to Senior (₹899) | Hosted page opened, founding cap 250 tracked | PASS |
| Plan Checkout | USD | Buy Mid to Senior ($17.99) | Hosted page opened in USD | PASS |
| Plan Refusal | Any | Buy Senior to Executive | HTTP 403 `application_required`, no page opened | PASS |
| Founding Cap Race | Test | 8 concurrent buyers for 1 remaining place | Exactly 1 reserved, 7 refused with `full` (cap invariant holds) | PASS (`e2e/banded-checkout.e2e.ts`) |
| Founding Cap Expiry | Test | Expired reservation past TTL | Released on next attempt (`bp_old:released`, `bp_new:reserved`) | PASS (`e2e/banded-checkout.e2e.ts`) |
| Extras In-Band | INR | Mid to Senior member buys Mid + Senior extras | Quote matches frozen table, volume discounts applied | PASS |
| Extras Out-of-Band | Any | Early to Mid member buys Senior extra | Refused HTTP 409 `outside_band` before provider call | PASS |
| Extras Non-Member | Any | Seeker without active plan buys extras | Refused HTTP 409 `no_plan` | PASS |
| Idempotency Key | Any | Replay checkout within 25 min | Existing hosted page reused without duplicate reservation | PASS |
| Stale Key Replay | Any | Replay checkout after 26 min | Refused HTTP 409 `checkout_key_used` | PASS |
| Webhook Term Grant | Any | Webhook `subscription_created` / `term_renewed` | Grants monthly cycle included units (3/1, 3/2, 3/1 by level) | PASS (`e2e/banded-grants.e2e.ts`) |
| Extra Referral Credit | Any | Webhook invoice paid for extra cart | Credits purchased balance once per invoice/intent | PASS (`e2e/banded-grants.e2e.ts`) |
| Spend Precedence | Any | Request send at level X | Spends included X -> free allowance -> purchased X | PASS (`e2e/banded-spend.e2e.ts`) |
| Request Reversal | Any | Declined/withdrawn request | Spend reversal retains provenance; cannot resurrect refunded credits | PASS (`e2e/banded-grants.e2e.ts`) |
| Refund Recovery | Any | Provider refund for extra invoice | Revokes unspent units; shortfall parked in `billingReviewOutbox` | PASS (`e2e/banded-grants.e2e.ts`) |
| Daily Reconciliation | Any | `daily-money-check` cron run | Validates ledger lots vs banded balances; detects discrepancies | PASS (`server/dailyMoneyCheck.ts`) |

---

## 4. Pending Live Acceptance — Not Completed Evidence

**Observed production state, `2026-11-23T20:31:32Z`:** `GET /api/chargebee/banded/offer` returned `{"onSale":false}`. `GET /api/health` was ready on commit `081efeef0dac6ac81c7f9939e0ec160dac6cf893`. PR #1483 changed documentation only; its live-handshake claim is withdrawn under D-383.

The following are acceptance criteria for the reopened `BANDED-release`, not completed checks:

- **Offer Endpoint:** after protected activation and exact-SHA deployment, `GET /api/chargebee/banded/offer` must return `onSale:true` with plans, places left and the current price book.
- **UI Inspection (`/plans`, 1280 and 390):** Early to Mid (₹229 / $4.49), Mid to Senior (₹899 / $17.99) and Senior to Executive ("Apply") must render. Badging must use the honest "Founding-member launch price" and real remaining-place counts; extras render for active plan members only.
- **Hosted Page Handshake:** clicking "Buy" must call `/api/chargebee/banded/plan-checkout` with a UUID v4 idempotency key, reserve a founding place under row lock, return the hosted page URL and open the exact price without fee add-ons (D-367 (4)). Close/cancel before payment; zero cards charged and zero real money spent (D-065). Attach the run output and captures before marking this section complete.

---

## 5. Invariants & Safety Controls

1. **No Real-Money Spent:** In strict compliance with D-065 and AGENTS.md, agents never execute real payments. Live end-to-end payment test is owner UPI test only.
2. **Founding Cap Strictness:** When a founding cap fills (500 / 250 / 100), sales stop immediately with "Founding places for this plan are taken" (D-367 (5)). No price is invented.
3. **Referrer Purchases Blocked:** Referrers are never charged (`REFERRER_PURCHASES_ENABLED = false`, D-055).
4. **Recovery & Idempotency:** Webhook deduplication, immutable intents (`bandedCheckoutIntents`), and reconciliation outbox remain fully active in production.
