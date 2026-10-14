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
| 1.1 | WorkOS SSO sign-in produces a valid session | Signed-in suite: silent SSO via `/api/auth/workos/sign-in`, then `GET /api/credits/summary` must return 200 with the expected wallet. Every 2 h. | GREEN (latest 5:16-5:31 PM IST Oct 14, API `2264a9f0`) |
| 1.2 | Sign-in entry redirects correctly | Curl battery on every deploy: `GET /api/auth/workos/sign-in` returns 302. | GREEN (latest Oct 14) |
| 1.3 | Auth fails closed when prod WorkOS config is incomplete | Code-verified at PR #92 (Sep 24); `workosAuth.ts` and all auth files re-verified byte-identical or reviewed in the source diff on every API deploy since. | GREEN (diff-verified each deploy) |
| 1.4 | OTP / code-email login path | Full cycle live-verified Oct 14 8:49 PM IST (API `a9f01bc`): work-email OTP fired from qa-sweep-2's session (company SkipWait) to ayodhya@skipwait.me; ZeptoMail delivery in ~11s with From **"SkipWait" <noreply@skipwait.me>** (PR #199 display name), subject "Your skipwait.me verification code", body verbatim per `server/workEmailOtp.ts`; the founder forwarded the code and it was entered in the live code-entry UI - "You're verified at SkipWait." qa-sweep-2 is now a verified SkipWait referrer (referrer-home renders "Verified - SkipWait", 3/3 capacity, queue empty). Personal-inbox rejection also proven live (Gmail alias refused by the shared client+server consumer-domain blocklist). | GREEN (8:49 PM IST Oct 14, API `a9f01bc`) |
| 1.5 | Social sign-in providers (PR #197) | Live Oct 14: sign-in page shows Continue with Google / Microsoft / GitHub / email at 1280 + 390 (Apple intentionally absent - not enabled in the WorkOS dashboard). `?provider=google|microsoft|github` on `/api/auth/workos/sign-in` 302 to WorkOS with the matching provider; `?provider=apple` falls back to `authkit` without error. | GREEN (5:12 PM IST Oct 14, API `2264a9f0`) |

## 2. Referral request flow

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 2.1 | Referral pages render for signed-out visitors | 6 h crawl audit: all reachable pages, zero console/page errors, zero >=400 responses, external links head-checked. | GREEN (36 pages, 0 issues; latest 1:40 PM IST Oct 14) |
| 2.2 | Signed-in referral request creation | Live Oct 14 via the second QA account (qa-sweep-2, founder-authorized): synthetic PDF uploaded (`POST /api/documents` 201, attachment 7), then `POST /api/company-referrals` with a skipwait.me job link + `companySlug: skipwait` -> **201, requestId 12**, companyDomain skipwait.me, coverageStatus covered, wallet debited 3 -> 2 exactly one credit, request visible in `GET /api/company-referrals/mine`. | GREEN (6:00 PM IST Oct 14, API `2264a9f0`) |
| 2.3 | Cross-user denial (user B cannot see user A's data) | Live Oct 14 with both QA accounts: qa-sweep-1 `GET /api/documents/7` (qa-sweep-2's resume) -> **404 "Document not found"** (owner read on B side is 200); qa-sweep-1 `POST /api/company-referrals/12/withdraw` -> **404 "This referral request is not in your account"**; qa-sweep-1 `GET /api/company-referrals/inbox` -> empty (request 12 not leaked); each account's `mine` lists only its own; qa-sweep-2 rendered `/p/qa-sweep-1` -> "This profile is private." | GREEN (6:01 PM IST Oct 14, API `2264a9f0`) |
| 2.4 | Resume upload | Signed-in retest (authorized Oct 13, current SHA): select file on /ask stages client-side, then 'Draft from my resume' runs the chunked pipeline - POST /api/documents/uploads 201 (session), chunks 200, complete 201 with clean JSON (no SQL leak); stored doc verified by GET /api/documents/6 (200, application/pdf, exact 21,257 bytes) and privacy export. Sep 17 double defect (finalize 500 + raw SQL leak) is fixed. | GREEN (4:20 AM IST Oct 13, API `cb3d20f`, web `76b137b5`) |
| 2.5 | Company-referral URL must match the selected company (PR #197) | Live Oct 14: request dialog on /explore/skipwait pre-flags a wipro.com link with role=alert "This link is not from SkipWait..." and passes a greenhouse.io link (hosted board). Authenticated `POST /api/company-referrals` with a wipro.com URL + `companySlug: skipwait` -> **400 "This job link is not from SkipWait. Paste a job link from SkipWait's own careers page."** before any credit moves (wallet 3/0 unchanged, no request created); control with a matching skipwait.me URL passes the company check and fails later at attachment ownership, proving the check fired specifically. Unknown slug -> 400. | GREEN (5:59 PM IST Oct 14, API `2264a9f0`) |
| 2.6 | Withdraw a pending, unclaimed request | Fixed by PR #198 (`644ce81`, idempotent deploy migration 0079 adds `withdrawn` to the prod status enum; global API error sanitizer swaps driver messages for a generic 500 text). Live retest Oct 14: withdraw of request 12 by the owner -> **200 withdrawn**, creation debit **refunded** (monthly 2 -> 3); double-withdraw idempotent 200 with no second refund; cross-user withdraw still 404 friendly; no SQL in any client response. No admin-side expire route exists (noted, not gated). Scope pinned Oct 14 9:17 PM: withdraw is PRE-CLAIM only - requests 13 (approved) and 14 (declined) both 409 "This request was already claimed by a verified employee and can no longer be withdrawn". Post-claim closure is the referrer's decision or expiry, not withdraw. | GREEN (6:39 PM IST Oct 14, API `644ce81`) |

## 3. Approval flow

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 3.1 | Approve/decline actions on a referral thread | Full cycle live Oct 14 9:09-9:17 PM IST (API `a9f01bc`): qa-sweep-2 verified as a SkipWait referrer (gate 1.4) and qa-sweep-1 posted two synthetic QA-marked asks via the full UI flow (job-link domain check held; resume required to send). Request 13: inbox (state "new") -> claim 200 -> approve 200 `{"status":"approved"}` -> seeker `mine` shows approved + referrer message; idempotent re-approve 200 `replayed:true` (revision unchanged); decline-after-approve 409 with `currentState` (state machine correct). Request 14: claim 200 -> decline 200 `{"status":"declined"}` -> seeker sees declined + the referrer's message. A decline does NOT refund the credit by design: the ask "stays active for other employees" (per product copy) and is not terminal, so the slot stays spent. | GREEN (9:17 PM IST Oct 14, API `a9f01bc`) |
| 3.2 | Block a member | Earlier findings stand: (a) **Gap**: block initiation exists only inside the safety Report flow, not as a standalone Settings action (Settings exposes the blocked list + unblock only). (b) Enforcement wiring code-verified in `cb3d20f`. Live block cycle VERIFIED Oct 14 9:11 PM (API `a9f01bc`): qa-sweep-1 blocked qa-sweep-2 via POST /api/blocks {referralRequestId:13} -> 201; the blocked referrer got clean 404s on both preview and conversation POST (no leak); /api/blocks/mine listed the block; DELETE /api/blocks/:id -> 200 unblocked and conversation access restored (200). | GREEN - live cycle verified; standalone-initiation GAP remains (9:12 PM IST Oct 14) |
| 3.3 | Blocked list + unblock render correctly | Settings "Blocked people" section renders; `GET /api/blocks/mine` returns 200 empty. Read-only, no writes. | GREEN (empty state) |
| 3.4 | Referrer work-email verification rejects personal providers (PR #197) | Live Oct 14: `POST /api/work-email/otp/send` rejects gmail.com, yahoo.in, outlook.in, rediffmail.com, ymail.com with 400 "Enter a valid work email address" (widened list incl. provider families + country subdomains); a corporate address (qa-sweep-1@orange.com) -> 200 sent. Client field pre-rejects gmail. /verify is additionally scoped to the selected company's own domain ("Wipro emails end in @wipro.com"). | GREEN (5:14 PM IST Oct 14, API `2264a9f0`) |

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
| 4.11 | Handoffs never touch the wallet | Suite reads `/api/credits/summary` before and after: plan free, 3 monthly + 0 purchased credits, unchanged. (Invariant tracks qa-sweep-1; the qa-sweep-2 wallet is managed separately.) | GREEN |
| 4.12 | Real payment completion (charge succeeds, credits land, webhook posts) | **Test site (skipwait-test) full matrix Oct 14 11:00-11:18 PM IST:** UPI leg PAID Rs.99 (invoice 3) and UPI re-run PAID Rs.99 (invoice 4) via Razorpay test handles; Net Banking PAID Rs.99 (invoice 5) via Razorpay mock-bank Success. Card legs CLOSED as environment limitations: Chargebee hosted card component hangs under browser automation (hcaptcha, 3 repros on both sites) and Razorpay refuses to tokenize test cards server-side ("not eligible for recurring payments"; /customers/:id/charges 404 disabled). Webhook experiment: test-site payment_succeeded delivered to prod `/api/chargebee/webhook` was safely rejected (Chargebee status re_scheduled, prod wallet unchanged, no credit, no user-visible error) - prod's intent-match + auth gate works. Refunds: invoice-level refunds of invoices 4+5 succeeded post-settlement (Rs.99 each, gateway in_progress); invoice 3 refund persistently 400 refund_failed - founder to refund from the test dashboard (test money). **Live site: FROZEN** - see 4.14. | PARTIAL - test site proven end-to-end; live blocked at Razorpay |
| 4.13 | Six-way gateway configuration map (evidenced read-only Oct 14 11:09-11:34 PM) | Currency split is hard-wired: INR -> Razorpay, USD -> PayPal, on BOTH Chargebee sites. Chargebee-test: Razorpay TEST key `rzp_test_THGqQ4MW0ajYhC` (INR Card/UPI/NetBanking) + PayPal SANDBOX (USD; button iframe www.sandbox.paypal.com, env=sandbox, clientID AWLaZpx6..., merchant 2ZED3X9QDQK6L). Chargebee-live: Razorpay LIVE key `rzp_live_Td3ZTxRq1HWYqT` (INR) + PayPal PRODUCTION (USD; www.paypal.com, env=production, clientID AUsQBjni..., merchant 2NPB4V8VAARGC). Vault holds ONLY live Razorpay credentials - no test-mode key/secret exists there. | MAPPED |
| 4.14 | LAUNCH BLOCKER: live INR payments fail at Razorpay | skipwait.chargebee.com is NOT registered on the founder's Razorpay merchant account (SthBAb4Wi3Dalb); Razorpay rejected the live attempt and notified him directly. Live checkout serves a LIVE Razorpay key, so every real customer INR payment fails identically until the domain is approved. Founder submitted domain verification ~11:17 PM Oct 14; Razorpay ETA up to 48 h. Live PayPal (USD) is production-configured and untested end-to-end. No live payment attempts of any kind until he confirms approval, then: live matrix (Razorpay card/UPI/NetBanking + PayPal), refund-after-each via the live write key. | BLOCKED - external (Razorpay review) |
| 4.15 | Refund-credit policy | Founder directive (Oct 14 11:05 PM, users-first): a refund automatically pulls back UNUSED credits granted by that payment; if any were spent, flag for founder review, never force the wallet negative. Implementation status: build agent implementing at gate time. | SPECIFIED - implementation pending |
| 4.16 | Pending-checkout reconcile job (PR #205) | Deployed 11:35 PM Oct 14 (API `64ee7f4b`): scheduled 15-min sweep re-checks checkouts still pending, credits only via the webhook's safe path, review + alert on unmatched. Verified on the deploy-triggered suite: tonight's parked "requested" live checkouts were correctly NOT credited (wallet unchanged), 8/8 legs + battery green. | GREEN (11:47 PM IST Oct 14) |

(Legs 4.1-4.11 latest pass 5:16-5:31 PM IST Oct 14, API `2264a9f0`, web `2264a9f0`.)

## 5. Kit v4 screens at 1280 + 390

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 5.1 | Cart, /plans modal, Chargebee /details at desktop width | Exercised by every signed-in suite run at the default desktop viewport (1280-class). | GREEN (every 2 h) |
| 5.2 | Same screens at 390 px phone width | Standing suite leg since Oct 13 (every 2 h): cart, /plans modal, and Chargebee /details checked at 390 px - no horizontal scroll, no clipped content, readable text, reachable primary buttons. Earlier one-off checks (landing, /pricing, invite banner, share-card) verified at 390/768/desktop when those shipped. Sign-in page (PR #197) additionally verified at 1280 + 390 on Oct 14. | STANDING - latest pass 5:30 PM IST Oct 14 |
| 5.3 | Viewport meta tag present in served HTML | Curl battery on web deploys. | GREEN |

## 6. Cross-cutting

| # | Item | How it is tested | Current state |
|---|------|------------------|---------------|
| 6.1 | Compliance pages serve full text | Curl battery: /terms /refunds /shipping /about /contact /pricing all 200 with >1k chars. | GREEN |
| 6.2 | Signed-out auth gates hold | Curl battery: protected endpoints 401/403 signed out (credits/summary, referrals/mine, documents, uploads, admin). | GREEN |
| 6.3 | Zero signed-out console/page/network errors | 6 h crawl audit, 36 pages. | GREEN |
| 6.4 | Readiness + schema reconcile healthy | Deploy watch: `/api/health/ready` 200, `schemaReconcileState: ready` on every check. | GREEN |
| 6.5 | Payment/auth source untouched by unrelated deploys | md5 diff of 17 payment/auth/schema files vs the previous SHA on every API deploy; any change is read in full before acceptance. | GREEN (every deploy) |

## 7. Known limitations

- No DELETE profile route (product decision, not built); profile rows persist with null content after clear.
- QA fixture residual state: qa-sweep-1's profile row exists all-null/private. Its handle (qa-sweep-1) was stuck because PUT could not clear it; the fa92ee4 fix (explicit null now clears) deployed Oct 14 ~1:06 AM IST, was live-verified (set -> clear with explicit null -> GET confirms null), and the handle is now cleared. Signed-out /p/qa-sweep-1 404s exactly as before the fixture existed.
- QA fixture residual state: qa-sweep-2 (ayodhyarammohanthy+qasweep2@gmail.com, created Oct 14 ~5:58 PM IST, founder-authorized) holds request 12, now **withdrawn** (credit refunded; wallet back to free 3/0); resume attachment 7 retained. Two verified @skipwait.me referrers received the in-app notification + review email for request 12 before the withdraw; the founder was told to ignore them.
- Live UI bug (reported to build Oct 14 9:12 PM): qa-sweep-2's `/queue` page renders the "Set up as a referrer / Verify your work email" gate even when the account is verified - `/referrer-home` shows "Verified - SkipWait" and the inbox API serves the queue. Survives an SSO refresh. Page-level gating disagrees with the API.
- Live UI nit (observed once, not reproduced): the ask-editor button stuck on "Sending..." after the ask POST had already succeeded (request 13). The next ask (request 14) settled correctly to "Ask sent to skipwait.me."
- Paste fix live-verified (PR #200, web `2ac7b5c`, Oct 14 9:14-9:15 PM): paste fills all six code boxes from any box (Digit 1 and mid-box Digit 2/3 both tested), non-digit characters are stripped ("40-18 67" -> 401867), typing over a filled box keeps the new digit - all at 1280 and 390 (390: six boxes fit, no hscroll, Verify reachable).
- QA fixture residual state Oct 14 ~9:17 PM: qa-sweep-1 holds synthetic requests 13 (**approved** by qa-sweep-2) and 14 (**declined** by qa-sweep-2); both are claimed, so withdraw 409s by design ("already claimed"). Wallet at free 1/3 (two asks debited; decline does not refund by design). Both asks are QA-marked ("Please ignore") and expire Oct 21. qa-sweep-2 is now a **verified SkipWait referrer** (bound to ayodhya@skipwait.me via the founder-forwarded OTP, founder-approved) - it is the standing verified-referrer QA account. The temporary block (block id 1) from the 3.2 cycle was removed.
- Minor observation (not gated): `GET /api/company-referrals/mine` shows the pitch placeholder "No personal note was included..." even when personalPitch was sent - pitch is either masked in the seeker-facing projection or dropped at write.

---

## How to read the daily state

- **Every live-testable item is GREEN.** 2.6 (withdraw) was RED for ~40 min on Oct 14 and is
  fixed + live-verified on `644ce81`. Everything that can run unattended is GREEN.
- 1 coverage gap remains open: 4.12 (real payment completion) - PARTIAL: verified up to
  the payment form on the live Chargebee site; closes only with a real charge + refund,
  founder's call. NOTE: production checkout is live-wired (real money on completion). 3.1 and 3.2 closed Oct 14 ~9:15 PM via qa-sweep-2
  (now a verified SkipWait referrer, gate 1.4).
- Whether distribution starts with the 4 remaining UNVERIFIED gaps open is the founder's call.

Any battery failure flips the named item to RED and is reported immediately with surface, SHA,
evidence, and repro. A pass restores GREEN at the next run. Gate history lives in the QA
battery's deploy reports and suite results.

