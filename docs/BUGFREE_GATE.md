# SkipWait V1 - "Bug Free" Gate

This document is the written definition of **bug free** for SkipWait V1: the pre-distribution
gate. Distribution starts the day every gate item reports GREEN.

Gate state comes from the standing QA battery, which runs continuously against production:

- **Deploy watch** (every 15 min + hourly): `/api/health`, `/api/health/ready`, web `git-commit` meta.
  On any API SHA change: curl battery + source diff before the new build is accepted.
- **Signed-in suite** (every 2 h): full SSO + checkout-handoff pass in a real browser.
- **Signed-out crawl audit** (every 6 h): every reachable public page, console/page/network errors.

**Gate state:** GREEN when every item below passed its latest run. RED when any item fails;
the failure report names the failing items. Items marked UNVERIFIED are coverage gaps, not
failures: each carries the reason it cannot be tested live and what would close it. The founder
decides whether distribution may start with gaps open.

Current overall gate state, how each item is tested, and its latest result follow.

---

## 1. Login / OTP session

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 1.1 | WorkOS SSO sign-in produces a valid session | Signed-in suite: silent SSO via `/api/auth/workos/sign-in`, then `GET /api/credits/summary` must return 200 with the expected wallet. Every 2 h. | GREEN (latest 2:51-3:00 AM IST Oct 13, API `cb3d20f`) |
| 1.2 | Sign-in entry redirects correctly | Curl battery on every deploy: `GET /api/auth/workos/sign-in` returns 302. | GREEN (latest Oct 13) |
| 1.3 | Auth fails closed when prod WorkOS config is incomplete | Code-verified at PR #92 (Sep 24); `workosAuth.ts` and all auth files re-verified byte-identical or reviewed in the source diff on every API deploy since. | GREEN (diff-verified each deploy) |
| 1.4 | OTP / code-email login path | **UNVERIFIED - cannot test live.** The QA account has no readable inbox and policy forbids triggering a code email. Closes when a readable QA inbox exists. | UNVERIFIED |

## 2. Referral request flow

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 2.1 | Referral pages render for signed-out visitors | 6 h crawl audit: all reachable pages, zero console/page errors, zero >=400 responses, external links head-checked. | GREEN (36 pages, 0 issues; latest 1:36 AM IST Oct 13) |
| 2.2 | Signed-in referral request creation | **UNVERIFIED - cannot test live.** War mode: no synthetic production writes, and real referral requests are never opened or created. Closes with a disposable second account or a founder-authorized test window. | UNVERIFIED |
| 2.3 | Cross-user denial (user B cannot see user A's data) | **UNVERIFIED.** Needs a second QA account (`qa-sweep-2`); parent confirmed none exists and none will be created without the founder. Mail routing also TBD. | UNVERIFIED |
| 2.4 | Resume upload | **RED - known issue, fix in progress.** Retest is explicitly blocked until the build side names the redesigned fix SHA; then it is retested on that SHA. | RED (awaiting fix SHA) |

## 3. Approval flow

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 3.1 | Approve/decline actions on a referral thread | **UNVERIFIED - cannot test live.** The QA account has zero referral threads and there is no second test account to create one against. Closes with a second QA account. | UNVERIFIED |
| 3.2 | Block a member | Two findings, reported Oct 10: (a) **Gap**: Settings exposes only the blocked list + unblock; block initiation exists only inside the safety Report flow, not as a standalone Settings action. (b) Enforcement wiring code-verified in the `cb3d20f` source diff (block checks on thread/review actions). Live block cycle **UNVERIFIED** without a second account. | GAP + UNVERIFIED |
| 3.3 | Blocked list + unblock render correctly | Settings "Blocked people" section renders; `GET /api/blocks/mine` returns 200 empty. Read-only, no writes. | GREEN (empty state) |

## 4. Credits / payments

Every handoff is driven in a real browser from the product UI to the Chargebee hosted page and
**stops at the payment form** - no card data is ever entered and no payment is ever completed.
Each leg asserts the correct plan, currency, and amount on the Chargebee page. Every 2 h.

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 4.1 | Buy 1 credit, INR | /premium -> qty 1 -> cart -> Proceed To Checkout -> Chargebee shows **Pay Rs.99.00**. | GREEN |
| 4.2 | Buy 1 credit, USD | International payment -> Chargebee shows **Pay $1.00**. | GREEN |
| 4.3 | Buy 10 credits, INR | qty 10 -> Chargebee shows **Pay Rs.990.00**. | GREEN |
| 4.4 | Buy 10 credits, USD | qty 10 international -> Chargebee shows **Pay $10.00**. | GREEN |
| 4.5 | Pro monthly, INR | /plans -> Upgrade to Pro -> modal Pay -> cart -> Chargebee shows **Pay Rs.599.00 & subscribe**. | GREEN |
| 4.6 | Max monthly, INR | Same flow -> **Pay Rs.1,299.00 & subscribe**. | GREEN |
| 4.7 | Pro monthly, USD | International -> **Pay $7.00 & subscribe**. | GREEN |
| 4.8 | Max monthly, USD | International -> **Pay $15.00 & subscribe**. | GREEN |
| 4.9 | Gift checkout stays gated OFF | Curl battery every deploy: `POST /api/chargebee/gift-checkout` returns 503 while the flag is unset; suite asserts the Gift button is absent from /plans (0 gift mentions). | GREEN |
| 4.10 | Webhook signature gates | Curl battery every deploy: unsigned `POST /api/razorpay/webhook` -> 400; unsigned `POST /api/chargebee/webhook` -> 401. | GREEN |
| 4.11 | Handoffs never touch the wallet | Suite reads `/api/credits/summary` before and after: plan free, 3 monthly + 0 purchased credits, unchanged. | GREEN |
| 4.12 | Real payment completion (charge succeeds, credits land, webhook posts) | **UNVERIFIED - deliberately not tested.** Policy: stop at the payment form, never enter card data. Closes only with a founder-approved real test payment (requested Oct 6, still open). | UNVERIFIED |

(Legs 4.1-4.11 latest pass 2:51-3:00 AM IST Oct 13, API `cb3d20f`, web `1cf4b63f`.)

## 5. Kit v4 screens at 1280 + 390

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 5.1 | Cart, /plans modal, Chargebee /details at desktop width | Exercised by every signed-in suite run at the default desktop viewport (1280-class). | GREEN (every 2 h) |
| 5.2 | Same screens at 390 px phone width | **PARTIAL.** Viewport checks run only on parent-named targets (standing rule since Oct 3, to keep every-redeploy runs lean). Landing, /pricing, invite banner, and share-card preview were verified at 390/768/desktop when those shipped. Kit v4 checkout screens have no standing 390 px leg. | PARTIAL |
| 5.3 | Viewport meta tag present in served HTML | Curl battery on web deploys. | GREEN |

## 6. Cross-cutting

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 6.1 | Compliance pages serve full text | Curl battery: /terms /refunds /shipping /about /contact /pricing all 200 with >1k chars. | GREEN |
| 6.2 | Signed-out auth gates hold | Curl battery: protected endpoints 401/403 signed out (credits/summary, referrals/mine, documents, uploads, admin). | GREEN |
| 6.3 | Zero signed-out console/page/network errors | 6 h crawl audit, 36 pages. | GREEN |
| 6.4 | Readiness + schema reconcile healthy | Deploy watch: `/api/health/ready` 200, `schemaReconcileState: ready` on every check. | GREEN |
| 6.5 | Payment/auth source untouched by unrelated deploys | md5 diff of 17 payment/auth/schema files vs the previous SHA on every API deploy; any change is read in full before acceptance. | GREEN (every deploy) |

---

## How to read the daily state

- **Today the gate is RED**: item 2.4 (resume upload) is a known issue awaiting its fix SHA.
- Everything else that can run unattended is GREEN.
- 7 coverage gaps are open (1.4, 2.2, 2.3, 3.1, 3.2-live, 4.12, 5.2). Each lists exactly what
  would close it; most close with a second QA account or a founder-authorized live test.
- When the resume-upload fix SHA lands and its retest passes, the gate goes GREEN on every
  item that is live-testable, and that is the day distribution can start (subject to the
  founder's call on the remaining UNVERIFIED gaps).

Any battery failure flips the named item to RED and is reported immediately with surface, SHA,
evidence, and repro. A pass restores GREEN at the next run. Gate history lives in the QA
battery's deploy reports and suite results.
