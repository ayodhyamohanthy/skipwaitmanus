# Backend robustness audit (Sep 24, 2026)

External audit of origin/main at 0327f3b, pasted by the founder. Stored verbatim so items can be referenced by ID (A1-A6 money, B1-B5 races, C1-C8 identity, D1-D7 runtime, E1-E9 schema/migrations, F test oracle). Claims are unverified until the matching issue says otherwise; line numbers refer to 0327f3b.

Probe results (Sep 24, 02:16 IST, read-only):
- C1: not live. /api/dev-auth/session is 404 and /api/auth/workos/admin is 403, so all three WORKOS_* secrets are set.
- E4: 6 identityLinkAudits rows with historic_duplicate_email_frozen, and none of those users is suspended. The freeze does not hold.
- A1: employerPaymentRefunds has 0 rows. Nothing has been paid out.
- E1 (resumeUploadAttempts FK blocks readiness): contradicted by prod. Readiness is "ready" on 68c34a1, so the FK check passes there. Needs a closer look before any change.
  Closer look (Oct 4, 2026, main at eb69b33, read-only): the FK the check requires is not reproducible from the repo. `resumeUploadAttempts` and the column `resumeUploadChunks.acceptedAttemptId` appear nowhere in the schema of record: not in `drizzle/schema.ts` (the chunks table at :662 has no such column), not in any `drizzle/*.sql` migration (0041, 0042 and 0050 checked; nothing creates an `accepted_attempt` FK), and not in any `drizzle/meta` snapshot. The only references in the whole repo are `server/schemaReconcile.ts:229` and its test. Two consequences: prod passes the check only because prod's live schema has drifted ahead of the repo, so a fresh environment built from the repo's own migrations fails this check at every boot and holds /api/health/ready at 503; and the F-section note is confirmed, schemaReconcile.test.ts:17 hand-invents the phantom FK row, so "accepts the migrated schema" proves the fixture, not the repo. Needs a founder decision: (a) ship a migration creating the table, column and FK so the check is reproducible, or (b) drop or downgrade the check to match the schema of record.

```text
<inbound_phone_message conversation="phoneconv-01M16TPX5E0PZXFWYYBM0C5144" delivery_delay="2.0s" event="message.received" from="+917207234883" message="phonemsg-01M380707M0747J72439GZ159T" participants="+917207234883" provider="linq" provider_message="2ec3a2a3-b358-4814-a17d-b7ce3e20cb97" received_at="Thursday, September 24, 2026, 2:14:44 AM IST" service="iMessage" to="+16465039406" type="dm">
The phrase reads like a category heading rather than a specific defect, and I can't find it anywhere in the repo (todo.md, docs, AGENTS.md) — so I don't want to guess and start refactoring the wrong surface.



Good — that's a read-only pass. Let me map the surfaces first, then run parallel deep-dives and hand you a prioritized report with no edits.



Repo mapped: server/ ~15.9k lines, server/db.ts 2,637, drizzle/ 64 migrations (I already spot two 0031_ files sharing an ordinal), and docs/RISK_REGISTER.md + docs/BUG_INVENTORY.md exist for cross-referencing. Launching five read-only deep-dives in parallel.



AUDIT: referral + credits + rewards concurrency/atomicity

BLOCKER — the audited tree does not compile. Commit c575dd7 ("0") on fix/privacy-compliance-disclosure committed unresolved conflict markers: server/db.ts:5,205,677,915,1109,1283,2234 and server/privateReferralRoutes.ts:65,128,199,819,838,942 (origin/main is clean). Two divergent implementations of claimCompanyReferralRequest (db.ts:1110-1118 transactional/CAS vs 1120-1126 non-transactional) and oneClickReviewReferralRequest (915-917 vs 918-925) coexist. The stashed side calls grantPendingActionRewards() (db.ts:923) — a symbol that no longer exists; the upstream side calls notifyInApp/notifyEmail (privateReferralRoutes.ts:820,839,944) — never defined or imported. Every source-text test below is reading marker-polluted text. SEV P0 | resolve the conflict against origin/main before any other fix. Test coverage: NONE.

SEV  Location  Defect + triggering interleaving

P0  server/db.ts:1485 (and :619)  Coverage-reward lifetime cap is an unlocked SELECT on companyCoverageRewards.inviterUserId. inviterUserId has only a plain index (schema.ts:485); uniques exist on invitationId and joinerUserId only. Interleaving: inviter X holds two active coverage invitations (one per waiting-for-coverage request, created at :786); joiners A and B redeem concurrently → each tx locks its own invitation row, both evaluate priorForInviter = empty (each other's insert uncommitted) → X receives two invite_reward_pending credits (:1494). Sequential claims are correctly blocked; only the concurrent path leaks.
P1  server/db.ts:1479,1488,1496  fulfillCompanyCoverageInvitation reads the invitation with no FOR UPDATE and writes status with no current-status guard — so the :1488 "ineligible" write can clobber a row another tx just completed, and two requests may both observe active. completeWorkEmailOtpEnrollment (:617 lock, :625 guarded update) is the correct twin; the two paths for the same invariant have different locking.
P1  server/db.ts:1806,1824,1825  spendToken: wallet read inside db.transaction has no .for("update"), then an absolute-value UPDATE ... WHERE id= and a ledger row with no idempotencyKey/referenceType. Two spends at balance 1 both read 1, both write monthlyCreditsRemaining=0, two -1 ledger rows → one credit destroyed. token_transactions_debit_reference_unique cannot help (MySQL uniques ignore NULLs). No production caller today (grep: tests only), but it is exported and is the reference "spend" API.
P1  server/db.ts:1747-1751  ensureTokenWallet: unlocked read → absolute write of monthlyCreditsRemaining/monthlyCycleKey, outside any transaction. Rollover racing a decrement restores a spent monthly credit. Also called at :760 before the referral transaction opens.
P1  server/db.ts:1015-1020  openCompanyReferralAvailability CAS (isNull(referrerId) AND waitingForCoverage) is correct, but the loser continues inside the same REPEATABLE READ snapshot, re-selecting the identical candidate row every iteration → burns all slotCount4 attempts and returns allocatedCount: 0 while queue rows exist. Needs FOR UPDATE SKIP LOCKED.
P1  server/db.ts:1185-1190  Reward-qualification hole: the one-click approve path calls grantPendingActionRewardsTx (:916); reviewReferralRequest (POST /api/company-referrals/:id/review, routes :798) never does. A referrer who claims then reviews via the UI permanently strands their pending invite credits.
P1  db.ts:784 + privateReferralRoutes.ts:513,526  referralReviewDeliveries rows are committed pending inside the create transaction but drained only by that same HTTP request. Request aborted after commit → permanently stuck pending (no drainer exists anywhere; grep for claimReferralReviewDelivery finds only these two call sites). Violates the durable-outbox invariant.
P2  db.ts:764-765 vs :983-988  Lock-order inversion: create = wallet→request→ledger; withdraw = request→ledger→wallet. Same seeker creates + withdraws concurrently → ER_LOCK_DEADLOCK surfaced as a 500 with no retry.
P2  db.ts:1785  SELECT ... FOR UPDATE on tokenTransactions filtered by kind/rewardStatus — neither is indexed (schema.ts:464). InnoDB takes next-key locks over the scanned range, serializing reward accrual with every ledger insert.
P2  db.ts:1468-1471,1501-1504  addCoverageRewardCredit / addPersonalReferralRewardCredit: dead helpers doing unlocked read → absolute balance write. Delete, or they become the next double-grant.
P2  db.ts:738,783,1022,1279,1495,1553,1739,1797  Notification inserts omit eventKey; the unique index (schema.ts:425) therefore dedupes nothing (only :1181 sets it).
P2  db.ts:1093-1095  getCreditLedgerAudit issues one ledger query per wallet (≤500 sequential round-trips) on an admin GET.
P2  db.ts:1541  Two transaction-scoped queries via Promise.all on one pooled connection — ordering depends on driver queueing.

ALREADY CORRECT (do not re-do)
transitionReferralRequestTx (db.ts:1165-1183): operation-key replay read → FOR UPDATE → authorize() → allowedFrom check → CAS WHERE status=? AND revision=? → event insert → notification keyed on request:vN:status. Backed by uniques in 0058.
createCompanyReferralRequest (:761-788): wallet FOR UPDATE as the per-seeker serialization point, same-key replay with fingerprint conflict → ReferralIdempotencyConflictError→409, attachment rows locked and re-counted (:768,779), debit tagged referral_request+requestId+idempotency key, reward grant strictly after the debit.
grantPendingActionRewardsTx (:1788) pending→granted is monotonic: locked read + conditional UPDATE ... WHERE rewardStatus IN (NULL,'pending') + affected-rows check + relative balance + total + idempotencyKey:"reward-"; a reward can never be granted twice or re-granted after withdrawal.
withdrawCompanyReferralRequest (:980-995): request FOR UPDATE, already-withdrawn short-circuit, reversal protected by token_transactions_reversal_unique, source-aware refund with old-cycle expiry, transitionReferralRequestTx runs after the ledger insert so a crash leaves a recoverable pending row.
referral_requests_seeker_idempotency_unique + gap-locked replay read (:765); admin_token_adjustments_case_unique genuinely enforces the comment at :1731; fulfillChargebeePayment claims via CAS (:1881); claimPersonalReferralInvite joiner dedupe is DB-enforced (schema.ts:502) + ER_DUP_ENTRY mapping; saveCompanyReferralRequest/rotateReferralReviewGrant lock before mutating.

Verification gap (root cause, not a band-aid): referralTransitionIntegrity.test.ts, rewardIntegrity.test.ts, paymentWalletConcurrency.test.ts and workEmailOtpConcurrency.test.ts all readFileSync(db.ts) and assert toContain('.for("update")') — they cannot observe a race. db.promoCredits.test.ts's fake (:56-107) has no MVCC: .for() is a no-op returning the shared live array, so every "concurrency" test runs on a single interleaving. walletAtomic.mysql.test.ts is real InnoDB but is describe.skip unless WALLET_MYSQL_ACCEPTANCE=1 (never set in CI) and exercises hand-written SQL against throwaway wallets/requests/txs tables — not db.ts. Fix test-first: point that MySQL acceptance suite at the exported functions (vitest.env DATABASE_URL against the existing local MySQL service) and add two cases — N=20 concurrent fulfillCompanyCoverageInvitation on distinct codes for one inviter expecting exactly one reward; concurrent openCompanyReferralAvailability against a 1-row queue.

UNVERIFIED / NEEDS PROD STATE
Azure MySQL isolation level and innodb_lock_wait_timeout; if a session runs READ COMMITTED, openCompanyReferralAvailability degrades differently.
Whether the deployed schema actually carries the 0043/0048/0058 uniques (server/schemaReconcile.ts boot path was not in scope) — every "DB-enforced" claim above assumes it does.
Whether any external cron/Worker drains referralReviewDeliveries (none found in server/, src/).
Which conflict side is intended; I could not infer authority from code.
spendToken's real reachability if a tRPC/worker path outside scope imports it — grep found only tests.
Pointers for other auditors (not examined): db.ts:2234-2637 contains a fully duplicated B2B/employer block behind markers; server/_core/index.ts:174 wiring; paymentWebhooks.ts/chargebeeRoutes.ts also carry markers.

FINDINGS

P0 | server/payments.ts:34,57-58; server/paymentWebhooks.ts:75-79,95-118; server/db.ts:5-9,2234-2637; server/_core/index.ts:115-121; drizzle/schema.ts:21,100; drizzle/meta/_journal.json:249 | Committed unresolved git stash pop conflict markers on HEAD (commit c575dd7, tree clean) in every money-plane file | Not a runtime race — the whole B2B fulfillment block db.ts:2234-2635 and the fulfillUnlockCredits/applyUnlockRefund wiring exist on only one side; the other side silently drops them, so a "resolution" either pays employers or acks captures with no credit. tsc/build cannot run | coverage: NONE (unparseable) | fix: resolve deliberately upstream-first, re-run pnpm check, re-apply 0043-0061 to the journal (two files are both 0061_)|

P0 | server/db.ts:2625 + 2567-2592 | refund-before-capture is recorded requires_review/creditsReversed:0 and never re-applied | Razorpay does not guarantee event order; refund.processed arrives first (paymentWebhooks.ts:116 acks 200), then payment.captured runs fulfillUnlockCreditPurchase which never consults employerPaymentRefunds → employer keeps full pack and the money | coverage: NONE | fix: inside the fulfillment tx, re-apply pending requires_review refunds for that paymentId|

P1 | server/db.ts:2567 via server/paymentWebhooks.ts:107,116 | Both early returns exit before deps.record(...) at :123, and the refund branch discards the returned status | A captured unlock with a missing note field is acked 200 with zero durable trace; Razorpay stops retrying | coverage: paymentWebhooks.test.ts:207 asserts only the 200 body | fix: record before returning, and surface requires_review|

P1 | server/db.ts:1879 + server/chargebeeRoutes.ts:202-218 | checkout_amount_mismatch returns ignored and is never escalated; the row stays pending | If catalog price drifts from CHARGEBEE_TOKEN_PACKS (chargebee.ts:7-8) for quantity=1 (no amount sent, chargebee.ts:186), the user is billed, Chargebee gets a 200 and never retries, and listRequiresReviewPayments (db.ts:1910) filters on requires_review so it is invisible to every admin query | coverage: NONE | fix: set requires_review with the reason|

P1 | server/db.ts:2006,2026 | Subscription activation never validates the charged amount; ParsedSubscriptionEvent (chargebee.ts:36-48) carries none, and subscriptionCheckoutIntents.amount (schema.ts:598) is written and never compared | A discounted/alternate item price attached to our hosted page + our pass_thru grants full monthlyAllowance | coverage: db.subscriptionActivation.test.ts never varies amount | fix: parse invoice total and require === intent.amount|

P1 | server/chargebeeRoutes.ts:91-103 + server/db.ts:1998 | Intent row is written after the provider page exists; a subscription_created delivered in that window returns ignored: checkout_intent_mismatch without inserting a subscriptionEvents row, then acks 200 | Chargebee never re-delivers → paid subscription never activates, unrecoverable | coverage: chargebeeRoutes.test.ts:275 (happy path only) | fix: persist the event row, or 500 to force retry|

P1 | server/chargebee.ts:162-169 + server/db.ts:1840 | Up to 25 sequential retrieveChargebeeHostedPage calls, each two 8s fetches (chargebee.ts:139,149) = ~400s inside the webhook whenever payment_succeeded lacks pass_thru (chargebeeRoutes.ts:196-201) | Provider times out and retries, amplifying across container instances | coverage: NONE | fix: bound/parallelize and short-circuit on invoiceId match|

P1 | server/paymentWebhooks.ts:145,62-73,161 | PayPal route registers plain express.json and never calls captureRawBody (present at :37-41 for Razorpay); :68 sends re-serialized req.body to verify-webhook-signature, whose signature covers exact raw bytes | Legitimate deliveries verify FAILURE → 400 at :165 → permanent retry loop, nothing recorded. :161 also reads a non-existent PAYPAL-AUTH-TIMEOUT header | coverage: every test injects a fake verifier; the real verifier is 0% covered | fix: pass the captured raw buffer|

P1 | server/chargebeeLiveCredential.test.ts:17-24 | Un-gated live call to https://skipwait.chargebee.com with CHARGEBEE_LIVE_API_KEY; only if (!apiKey) return | pnpm test in any shell with prod secrets hits production billing, violating "no real-money QA" | coverage: n/a; sibling chargebeeCredentials.test.ts:14 does gate correctly | fix: add the same it.runIf(RUN_EXTERNAL_CREDENTIAL_TESTS)|

P2 | server/chargebee.ts:285-289 | only provider POST with no AbortSignal.timeout → hung socket pins cancellation | fix: add signal
P2 | server/adminBillingCatalog.ts:17-21,87-89 | diagnostic requires pricing_model per_unit, but buildCheckoutForm sends no quantity for 1 and ad-hoc charges[amount] for >1 (chargebee.ts:183-194, chargebee.test.ts:99-113) — it flags a correct catalog as the checkout breaker | fix: derive from the form builder
P2 | server/chargebee.ts:83 | payment_refunded/payment_failed are 202-dropped (chargebeeRoutes.ts:216) with no row, so status 'refunded' (0033) is unreachable and getRevenueSummary.refundedTotalByCurrency (db.ts:1971) is permanently 0
P2 | server/chargebeeRoutes.ts:37 + db.ts:509 | billing activity is fire-and-forget and silently no-ops without a DB
P2 | server/chargebeeRoutes.ts:173 | resolveChargebeeWebhookSecret throws outside try/catch in an async handler → hang instead of 401
P2 | server/employerRoutes.ts:111 | Razorpay rail has no BILLING_ENV-style test/live gate (contrast chargebeeEnvironment.ts:18-26)
P2 | server/paymentWalletConcurrency.test.ts:14-31 | asserts on source text, not behavior; no MySQL concurrency test exists for fulfillChargebeePayment/fulfillUnlockCreditPurchase

ALREADY CORRECT
Consumer claim is an atomic conditional write (db.ts:1881) backed by payment_fulfillments_provider_event_unique (schema.ts:549/0007); the pre-read at :1875 is only a fast path.
Razorpay HMAC over exact raw bytes, timingSafeEqual, before any write (paymentWebhooks.ts:37-48,86-87); 503 when unconfigured.
Employer unlock: create-lease + receipt-based reconcile (db.ts:2555-2561), single-winner pending→processing with isNull(providerPaymentId) (:2580), credits+terminal state in one tx (:2585-2588), provider amount re-checked against the catalog constant (:2575).
Refund replay durable via employer_payment_refund_event_unique (schema.ts:588); cumulative proportional reversal + creditDebt (db.ts:2627-2629).
Gateway webhooks never grant entitlements — recordGatewayPaymentEvent is read-only (db.ts:1860-1866); unverified PayPal → 202, no correlation.
Recovery is provider-attested (chargebee.ts:157-159 requires page succeeded + invoice paid + amountPaid>=total; chargebeeRoutes.ts:152-160 re-checks pass_thru/amount/currency); Premium.tsx:59-73 only renders server state.
Price is server-owned: quantity 1..1000 (chargebee.ts:65-67), amount from constants (:192), billingCountry↔currency pairing (chargebeeRoutes.ts:50).
No in-memory money fallback (db.ts:24-42 → fail closed); admin decision is FOR UPDATE + conditional claim (db.ts:1920-1931); legacy fake-refund route is 410 (privateReferralRoutes.ts:1014).

UNVERIFIED / NEEDS PROVIDER STATE
Live Chargebee item-price ids/pricing_model (needs GET /api/admin/billing/catalog on live).
Azure MySQL session isolation level and innodb_lock_wait_timeout — decides whether any non-locking pre-read can yield two winners.
Whether Express/Cloudflare re-serialization empirically breaks PayPal verify-webhook-signature (needs one real test delivery).
Whether Razorpay actually emits refund.processed before payment.captured in production, and whether Containers currently runs >1 instance receiving the same event.
Whether any real payment is already sitting in pending with an amount mismatch (needs a DB query; read-only audit ran no builds/queries).

FINDINGS

P0 | server/_core/workosAuth.ts:91-115 (also server/db.ts:5,205,677,915,1109,1283,2234; server/_core/index.ts:43,63,99,115,148,173; server/_core/devAuth.ts:64; server/privateReferralRoutes.ts ×6; drizzle/schema.ts ×2; drizzle/meta/_journal.json) | 38 tracked files contain unresolved >>>>>> Stashed changes markers, and they are COMMITTED (HEAD c575dd7, message "0"; git status --porcelain is clean). | The tree cannot parse. Worse, the two sides are semantically different auth implementations: the "Stashed changes" bearer branch (workosAuth.ts:106-113) maps identity via db.upsertUser(payload.email) instead of resolveLoginIdentity, bypassing the active-account gate, canonical-person resolution and alias binding. index.ts:185 wires workEmailOtpService.hasRecentVerification, a method that does not exist. db.ts:1109-1127 stashed side replaces the transactional FOR UPDATE referral claim with read-then-write. | deployMigrations.test.ts/_journal.json — the journal is invalid JSON and its stashed side drops idx 35 = 0036_users_suspended. | Resolve to the "Updated upstream" side deliberately, per file, with the owner; then pnpm check. Nothing else in this audit is actionable until this is fixed.

P1 | drizzle/0057_canonical_identity.sql:61-63 | The historic-duplicate freeze never revokes sessions. | MySQL evaluates SET left-to-right: u.suspended = true runs first, so IF(u.suspended, u.sessionsValidAfter, CURRENT_TIMESTAMP) reads the new true and keeps the old timestamp. A frozen ambiguous-identity user keeps a working app_session_id (and bearer JWT up to 1 h) with suspended set — the exact "freeze pending operator review" bypass. | server/db.suspendReview.test.ts covers setUserSuspended, not this SQL: NONE. | SET u.sessionsValidAfter = CURRENT_TIMESTAMP, u.suspended = true (order swapped) or IF(1=1, ...).

P1 | drizzle/0039_session_revocation.sql:1, drizzle/schema.ts:7,23, server/_core/sdk.ts:38 | sessionsValidAfter defaults to the DB clock (CURRENT_TIMESTAMP), but revocation compares it against JS/app-clock iat. resolveLoginIdentity (db.ts:162) and upsertUser never supply it. | Violates AGENTS invariant #5: if Azure MySQL runs >1 s ahead of the container, Math.floor(sessionsValidAfter/1000) > payload.iat is true for every freshly minted token → instant sign-in loop on boot/first login, per instance. | sdk.security.test.ts:16 only tests a 99 ms same-second skew, with both sides from Date.now(): no clock-skew test. | Default the column to a fixed epoch/'1970-01-01', or write new Date() explicitly on insert.

P1 | server/db.ts:137-157 | Legacy-row adoption keys on LOWER(TRIM(users.email)) with no check that the stored row ever verified that email. | Attacker hits POST /api/dev-auth/login {email:"victim@acme.com"} (devAuth.ts:103-113 → upsertUser, canonicalPersonId NULL), accumulates credits/referrals, keeps the cookie; on the victim's first WorkOS/OTP login, db.ts:157 attaches the attacker's row to the victim's canonicalPersonId, and the attacker's still-valid dev_ cookie resolves through verifiedLoginAliases.openId → full read/write of the victim's wallet, documents, referrals. Also directly contradicts "never merge on an unverified email". | NONE (no test for emailCandidates + loginMethod:"dev"). | Restrict emailCandidates to rows whose loginMethod is a verifying plane (workos with verified evidence, otp_work_email); never adopt loginMethod = "dev".

P1 | server/_core/devAuth.ts:42 + server/privateReferralRoutes.ts:468-477 | emailField() hardcodes verification.status:"verified" for self-asserted dev emails, and the verify-work-email route trusts identity.emailAddresses[].verification.status === "verified" to call saveVerifiedWorkEmail with no OTP receipt*. | On the dev plane, POST /api/dev-auth/login {email:"x@stripe.com"} then POST /api/company-referrals/verify-work-email {email:"x@stripe.com"} yields a verified-employee profile for any domain — full access to that company's pending referral requests (db.ts:878 routing). Guarded only by workosConfigured(), which merely warns unless NODE_ENV==="production" (workosAuth.ts:46). | workosIdentity.test.ts covers the bearer path only: NONE for this precedence. | Carry emailVerified from the provider into DevEmailAddress.verification and require a receipt when status is not provider-attested.

P1 | server/db.ts:243-253 (updateUserProfileByWorkosId) | Webhook rewrites users.email on the canonical row with no email_verified attestation, no canonicalPeople.normalizedVerifiedEmail/verifiedLoginAliases update, and no convergence re-run. | A WorkOS email change to an unverified address silently re-keys the account's email identity; a subsequent resolveLoginIdentity email-candidate pass or admin lookup reads a value the provider never attested. | workosWebhooks.test.ts:83 asserts sync happens, never that verification is required: NONE. | Only apply email when the event payload asserts primary_email_verified === true, and update the canonical/alias rows in one transaction.

P2 | server/workEmailOtp.ts:33,76,96-105 | Code hashing is unsalted sha256(email + ":" + 6 digits) — 10⁶ preimages; any read replica/backup leak recovers live codes for the 10-minute window. Consumption itself is correct (see below). | workEmailOtp.test.ts:39 rewards the email-salt design. | HMAC with a server-side secret (JWT_SECRET-class) instead.

P2 | server/workEmailOtp.ts:107-115 | issueEnrollmentReceipt(email, userId) mints an enrollment receipt without any evidence that a workEmailOtpCodes row is consumedAt for that email — safety is purely the call-site ordering at privateReferralRoutes.ts:447-450. | Any future caller (or a refactor under the current conflict mess) issues unlimited enrollments with no OTP. | workEmailOtpReceipt.test.ts is a readFileSync+toContain source grep, not behavior: NONE real. | Insert the receipt inside verifyCode's transaction, FK-linked to the consumed code row id.

P2 | server/workEmailOtp.ts:16,120 | domainCache is an unbounded module-level Map keyed by attacker-supplied domains (no eviction, per-instance), and registerFailedAttempt is a non-transactional read-modify-write that races verifyCode's locked attempts counter — an attacker bypassing the route-level limiter can lose increments. | NONE. | Reuse BoundedTtlCache; delete registerFailedAttempt (dead in the current wiring).

P2 | server/_core/workosAuth.ts:94,103 vs server/_core/sdk.ts:38 | Bearer path compares revocation at raw milliseconds; cookie path deliberately truncates to seconds with a comment explaining why. Two credential planes disagree, so a same-second revoke leaves the WorkOS JWT accepted or the cookie rejected depending on plane. | workosIdentity.test.ts:68 tests the createdAt guard only. | Share one isSessionRevoked(iatMs, sessionsValidAfter) helper.

P2 | server/workosWebhooks.ts:23-24,82-105 | Only user.deleted / user.updated are acted on; session.revoked and user.authentication. are acknowledged as no-ops. | A WorkOS-side session revoke leaves the local app_session_id valid for its full TTL and does not raise sessionsValidAfter. AGENTS claims "revocable sessions". | NONE.

P2 | server/db.ts:217-221 (isUserSuspended) | Checks only users.suspended for one row — ignores canonicalPeople.suspended and every other alias, unlike getUserByOpenId (db.ts:198-201). db.ts:119 freezes only canonicalPeople, so provider_subject_conflict yields "suspended" to resolveLoginIdentity and "active" to isUserSuspended. | Any caller of isUserSuspended is an auth bypass. | NONE. | Route every suspension read through getUserByOpenId.

P2 | server/_core/context.ts:22,26 — identity?.account as User is an unchecked cast; the dev plane's memoryAccounts Map (devAuth.ts:50) is an explicit process-memory session store, so a suspended in-memory dev identity is only stopped by verifySession — acceptable in dev, undocumented as prod-forbidden. | NONE.

ALREADY CORRECT
workEmailOtp.ts:93-105: SELECT … FOR UPDATE on the newest unused/unexpired code, then a conditional UPDATE … consumedAt IS NULL AND attempts  x.trimStart().startsWith("SELECT")), test:21). | DESIRED_TABLES[].createSql (:10-20) is dead code, and POST /api/admin/schema/reconcile reports success while applying nothing — it masks a missing reviewed migration. The stale test mock at server/adminSchemaReconcileRoutes.test.ts:58 still asserts an ALTER TABLE … was "run". | Fix the comments and route wording, or delete createSql.

P1 | server/schemaReconcile.ts:13, :14, :15, :17, :18 | The dead createSql definitions contradict the real migrations: :13 providerOrderId NOT NULL vs 0044:4→0054:9 NULL; :14 lacks creditDebt/approvalStatus; :18 partnerName varchar(160)/headline varchar(255)/description NOT NULL vs 0037:51-54 (120/180/nullable). :220-222 validate existence only — never type, nullability, length, or ON DELETE. | Whichever path created a table wins silently and permanently; a drifted NOT NULL/width passes validation then fails at INSERT. | Make validation compare COLUMNS.COLUMN_TYPE/IS_NULLABLE, not just presence.

P1 | server/schemaReconcile.test.ts:17 | Fixture hand-invents the resumeUploadAttempts FK row, so test:21 "accepts the migrated schema" proves the mock, not any migration. | Same class of masking as above. | Derive the fixture from the migration set.

*P1 | Missing hot-path indexes (all verified absent from every CREATE INDEX in drizzle/.sql):
profiles(workEmailDomain, accountType, workEmailVerifiedAt) — db.ts:770 runs this inside the referral-creation transaction under .for("update"); db.ts:561, :643 too. Unindexed FOR UPDATE locks every scanned row + gaps → referral submission serializes on the whole profiles table.
users(canonicalPersonId, email) / functional index — db.ts:143 isNull(canonicalPersonId) AND LOWER(TRIM(email))=? .for("update") on every sign-in: full scan, table-wide lock.
jobs(publishedAt DESC) — db.ts:696 orderBy(desc(publishedAt)) with no LIMIT.
referralRequests(jobSeekerId, updatedAt) + (referrerId, updatedAt) — db.ts:730 OR across two single-column indexes with ORDER BY updatedAt → filesort on the largest table.
notifications(userId, createdAt DESC) — db.ts:1414 unbounded.
operationalActivityLogs(actorUserId, action, createdAt) — db.ts:515.
messages(recipientId, readAt) — db.ts:409 unread count.
users(createdAt) — db.ts:208 admin directory orderBy + 200-row limit.
Declared-FK columns with no child index: referralRequests.jobId (schema.ts:225), employerPaymentRefunds.fulfillmentId (:581), companyCoverageInvitations.joinerUserId (:473), employerTalentRefs.consentId (:164), profileUnlocks.consentId (:174) — InnoDB auto-creates unnamed indexes, which generate will then try to drop.

P1 | Uniqueness holes (read-then-write only):
0052:36-38 and :55-58 DROP employerTalentRefs and profileUnlocks pair-uniques, replaced by non-unique (employerUserId, seekerProfileUserId, revokedAt). "One active ref/unlock per pair" and schema.ts:169's comment "one unlock row per (employer, seeker) pair, ever" are now enforced only in code → concurrent double-spend of employer credits. Fix: the repo already owns the right pattern — NOT NULL generated activeKey + UNIQUE, as at schema.ts:372 (referralAvailabilitySlots) and :671 (privacyRequests).
notifications.eventKey (schema.ts:422, 0049) is a nullable UNIQUE; 14 of 17 insert(notifications) sites in db.ts omit it (644, 738, 783, 922, 1022, 1125, 1279, 1413, 1686, 1739, 1797 …). MySQL permits unlimited NULLs, so dedupe is off by default.
No unique preventing a second active referralRequests per (jobSeekerId, jobId); only idempotencyKey is guarded (0043:3), and it is nullable.
employerPaymentFulfillments.checkoutKey/fingerprint/providerReceipt are added nullable (0054:6-8) then tightened only after an UPDATE (:12-20) — if the UPDATE aborts mid-migration the NOT NULL MODIFY fails and leaves the table half-migrated with no unique.

P1 | drizzle/0031_missing_columns.sql:3-4 | ADD COLUMN IF NOT EXISTS is MariaDB syntax — MySQL 8.0 (Azure) rejects it. The file also lacks --> statement-breakpoint between the two ALTERs, so drizzle-kit submits them as one query. It is not in the journal, so only scripts/apply-missing-columns.mjs can reach it. | Delete the file; apply-missing-columns.mjs:28 DESIRED is already a fourth independent copy of the desired-column list (alongside schema.ts, DESIRED_COLUMNS, DESIRED_INDEXES). Collapse to one generator.

P1 | drizzle/0037_b2b_monetization.sql:24, :62 | ON UPDATE NOW is not valid MySQL grammar (ON UPDATE CURRENT_TIMESTAMP). | 0037 cannot be re-applied cleanly from scratch; boot reconciles around it via the divergent createSql.

P2* | 0054:12-20 UPDATE + three MODIFY … NOT NULL on a live payments table = copy-table, not online. | 0052's dynamic DROP INDEX (via REPLACE(pair_index,'')) deletes whichever unique matches a column set — an operator-added unique on the same columns is destroyed without review. | No CHECK anywhere: employerAccounts.creditDebt (:111), refundedAmount (:569), creditsRemaining (:520), tokenCount, amount can all go negative. | Stringly-typed state: tokenBalances.subscriptionStatus varchar(32) (:437) gated by === "active" at db.ts:1406; referralTransitionEvents.fromStatus/resultingStatus varchar(32) (:248-249) mirror referralRequests.status enum with no constraint. | Money as unnamed int: paymentFulfillments.amount (:542), employerPaymentFulfillments.amount (:561), subscriptionCheckoutIntents.amount (:598), employerPaymentRefunds.amount (:582) — vs budgetMonthlyUsdCents; units are tribal. | JSON in text: identityLinkAudits.evidence (0057:46 text receiving JSON_OBJECT() at :54), operationalActivityLogs.metadata, talentDiscoveryConsents.disclosedFields, profileUnlocks.profileSnapshot — should be json + JSON_VALID CHECK. | Redundant index: resume_upload_chunks_session_idx (schema.ts:651) duplicates the unique on the identical column pair. | jobs.company varchar(160) stores a domain matched against profiles.workEmailDomain varchar(255) (:72, :55) — a 161+ char domain silently never resolves. | userFollows (schema.ts:389) lacks CHECK (followerUserId <> followingUserId). | No CHARACTER SET/COLLATE/ROW_FORMAT in any migration, yet scripts/apply-deploy-migrations.sh:23 deliberately sizes its PK at varchar(191) (=764 bytes under utf8mb4) — that implies a 767-byte prefix limit, under which documentBlobs.fileKey varchar(512) UNIQUE (schema.ts:696, 2048 bytes) cannot be created. Identity uniqueness also currently depends on an undeclared case-insensitive collation.

Migration journal health
drizzle/meta/_journal.json is broken in seven distinct ways: (1) conflict markers at :249/:285-286 — invalid JSON; (2) 40 entries vs 64 files on disk — 24 SQL files are unreachable by drizzle-kit migrate (0031_missing_columns, 0035, 0039, 0040, 0043–0052, 0053–0061 ×2); (3) idx and filename prefix diverge from entry 35 onward (idx 35 → 0036_users_suspended … idx 38 → 0041_…), so the 0031/0061 prefixes appear twice on disk while only one of each is journaled; (4) two when regressions — idx 30 = 1796160000000 then idx 31 = 1788305367230, and idx 37 = 1797196800000 then idx 38 = 1789545218278. drizzle-kit gates on created_at/folderMillis, so any DB that applied 0030 or 0038 permanently skips 0031_drop_legacy_payment_columns and 0041_atomic_resume_upload_finalization — including the resume-upload lease columns that DESIRED_COLUMNS:37-39 expects; (5) entry 30's "version": "\"7\"" (:217) is double-encoded where siblings are "5"; (6) snapshots stop at 0029 and 0022_snapshot.json is absent — everything from 0030 is hand-written, so the next drizzle-kit generate diffs against the 0029 snapshot and will re-emit drops for 32 migrations; (7) drizzle/deploy/0062_deploy_ledger_proof.sql + scripts/apply-deploy-migrations.sh is a parallel, journal-less path with its own schemaDeployMigrations ledger (this one is sha256-idempotent and re-runnable — the only sound mechanism in the repo). package.json:15 wires db:push to generate && migrate, i.e. the destructive path.

Re-runnable backfills: 0022_queue_open_alert_backfill.sql is genuinely idempotent — WHERE waitingForCoverage = FALSE self-excludes after the first pass and COALESCE preserves coverageQueuedAt. Good. 0054's backfill is not (see above). 0057:53-58 is re-runnable via NOT EXISTS, but its :59-63 suspension effect is broken (P0).

Riskiest pending change / backfill+rollback shape: re-journaling 0041/0043–0061 under strictly increasing when values. It needs: a pre-flight SELECT of __drizzle_migrations.created_at max per environment; a forward-only drizzle/deploy/0063_ that re-applies the skipped 0041 columns idempotently via information_schema guards (the 0052/0053 stored-procedure pattern, but without dynamic DROP INDEX); no MODIFY … NOT NULL without a separate reviewed backfill step; and an explicit rollback note, since DROP COLUMN/DROP INDEX reversal is impossible once the new revision writes to the column.

ALREADY CORRECT
OTP reuse is constraint-free but race-proof: SELECT … FOR UPDATE (workEmailOtp.ts:96) plus CAS UPDATE … WHERE consumedAt IS NULL AND attempts =5 terminal gate at :808.
db.ts:2556-2561, employerRoutes.ts:114-120 checkout: DB lease (createLeaseExpiresAt, 30 s) → provider call outside the transaction → reconcile path re-resolves by receipt and escalates >1 match to requires_review. No duplicate-charge on expired lease.
db.ts:1406 DM send claims by idempotencyKey + fingerprint inside the tx; notifications.eventKey unique index (schemaReconcile.ts:71) makes status notifications replay-safe.
workEmailOtp.ts:96 SELECT … FOR UPDATE with JS timestamp operand; limits consumed transactionally (:37-48).
schemaReconcile.ts:186-188 runtime validation is SELECT-only — health traffic can never run DDL; backoff capped (:177).
containerRecovery.ts:19-25 never replays non-safe methods to a stopped container.
src/worker.ts:58-61 route/host pinning rejects forged Host; deploy-api.yml:27-29 serialized concurrency, :45-57 migration-before-runtime gate.

UNVERIFIED — needs live infra
Actual concurrent instance count for skipwaitmanus-api- (a fixed DO id vs max_instances:3); whether WORKOS_API_KEY/WORKOS_COOKIE_PASSWORD are presently set in the Worker secret store (the dev-auth P0 above is conditional on that); whether the skipwait.me/api/ zone route outranks functions/api/[[path]].ts:4, whose DEFAULT_API_ORIGIN points at a workers.dev host that src/worker.ts:59 would 404 — and which deploy-pages.yml never sets API_ORIGIN for; real Azure↔app clock skew; actual wrangler secret list contents; whether Cloudflare sends SIGTERM or SIGKILL at container stop.

Five independent audits, one unanimous blocker: they all report unresolved git conflict markers committed at HEAD. Verifying that directly before I write anything up.



HEAD is broken but origin/main is clean — so the fix is likely re-integration, not hand-resolving 34 files. Let me pin the branch relationship and re-validate the top findings against origin/main, since the agents read marker-polluted text.



Confirmed against origin/main: the migration SET-order bug, the DB-clock sessionsValidAfter default, the phantom FK readiness check, and the un-gated live Chargebee credential test are all real on main. Finishing the comparison that errored out.



origin/main already contains 25 newer commits — including #76 "money race", #53 "park paid invoices with amount mismatch", #51 "quantity 1 checkout" — so several audit findings are stale duplicates of already-shipped fixes. Re-verifying every claim against main, not the broken branch.



MONEY PLANE

Refund-before-capture — STILL-PRESENT
server/db.ts:2639 parks refund_before_capture_or_unknown_payment (creditsReversed:0, fulfillmentId null); db.ts:2581-2604 fulfillUnlockCreditPurchase never reads employerPaymentRefunds and always credits expected.credits; server/paymentWebhooks.ts:111 acks 200 on requires_review. No drainer exists (see #17).
Failure: Razorpay sends refund.processed 2s before payment.captured → capture credits 10 credits → employer keeps ₹ refunded.

Early returns skip deps.record — STILL-PRESENT
server/paymentWebhooks.ts:102, :105, :111 all return before the deps.record(...) at :116-123.
Failure: captured payment with a missing/NaN amount note → 200 ack, zero durable trace, provider stops retrying.

checkout_amount_mismatch — ALREADY-FIXED (bd0124f, #53)
db.ts:1890-1893 parks status:"requires_review" + operationalActivityLogs; server/chargebeeRoutes.ts:220-222 fires alertPaymentReview; db.ts:2157 admin queue selects requires_review. Claim #3 was correct on the audited branch only.

Subscription amount never compared — STILL-PRESENT
server/chargebee.ts:119-131 ParsedSubscriptionEvent has no amount field; db.ts:2009-2021 compares currency/plan/owner only, never subscriptionCheckoutIntents.amount; db.ts:2041,2048 grants SUBSCRIPTION_PLANS[plan].monthlyAllowance.
Failure: a 90%-off Chargebee coupon on Pro activates Pro with full monthly allowance; intent flips activated at db.ts:2073 with no mismatch signal.

Subscription intent written after hosted page — STILL-PRESENT
server/chargebeeRoutes.ts:97 creates the page, :109 writes the intent. db.ts:2013 returns {ignored, checkout_intent_mismatch} without inserting a subscriptionEvents row; chargebeeRoutes.ts:190-197 sets handled=true and :235 acks 200.
Failure: card-less/UPI subscription_created lands during the ~1-2s window → 200 ack, no event row, no reconciliation → paid subscription never activates.

25 sequential hosted-page fetches in webhook — STILL-PRESENT
server/chargebee.ts:164 loops .slice(0, 25), each iteration up to two 8s-timeout fetches (:139, :149); wired into the webhook at server/_core/index.ts:184-187, db.ts:1842 caps pending intents at 25.
Failure: one orphaned payment_succeeded with a full pending queue → ~50×8s serial fetches → container timeout → Chargebee retries ×N.

PayPal raw body + bogus header — STILL-PRESENT (both parts)
server/paymentWebhooks.ts:138 registers express.json({ limit: "256kb" }) with no verify: captureRawBody (only :130/:134 Razorpay have it); :68 signs a JSON.stringify(req.body) re-serialization; :154 reads PAYPAL-AUTH-TIMEOUT before PAYPAL-TRANSMISSION-TIME; :158 returns 400.
Failure: any PayPal delivery containing a nested number/key that round-trips differently → verification_status: FAILURE → permanent 400 retry loop.

Ungated live production credential test — STILL-PRESENT
server/chargebeeLiveCredential.test.ts:17-20: if (!apiKey) return; then a real HTTPS call to https://skipwait.chargebee.com/... with CHARGEBEE_LIVE_API_KEY. Sibling server/chargebeeCredentials.test.ts:19 correctly uses it.runIf(process.env.RUN_EXTERNAL_CREDENTIAL_TESTS === "true"). pnpm test in a prod-seeded shell hits live billing.

Catalog per_unit diagnostic — ALREADY-FIXED (da4e468, #51)
server/chargebee.ts:183-188 now always sends item_prices[quantity][0] = "1"; server/adminBillingCatalog.ts:87-89's per_unit requirement now matches the form builder. No false positive remains.

Unbounded provider POST — STILL-PRESENT (one site)
server/chargebee.ts:286-290 cancel_for_items POST has no signal. All of server/payments.ts:24/36/46/59/72 and chargebee.ts:139/149/236/267 are timeout-bounded. chargebeeRoutes.ts:196/226 return 500 for provider retries, which is correct.

REFERRAL / CREDITS / OUTBOX PLANE

spendToken — PARTIAL (race FIXED by 47ad386, #76)
#76 added db.ts:1806 .for("update") on the wallet read plus affectedRows guards at db.ts:1818 (promo claim) and db.ts:1829 (debit). Still open: db.ts:1829's non-promo ledger row is {userId, role, tokenCount:-1, kind:"direct_request"} with no referenceType/referenceId/idempotencyKey, so token_transactions_debit_reference_unique and ..._idempotency_kind_unique (drizzle/schema.ts:463) cannot dedupe NULLs; the write at db.ts:1828 is still an absolute balance: set, correct only while the lock is held. Other wallet mutators are guarded: db.ts:753 (create), db.ts:968 (withdraw), db.ts:1792-1795 (rewards, relative sql\+ \`), db.ts:1735/db.ts:1943 (relative).

ensureTokenWallet — STILL-PRESENT (untouched by #76)
db.ts:1744-1757: unlocked db.select (:1747) → absolute db.update(normalized.patch) (:1751) outside any transaction; called pre-transaction at db.ts:1804 and db.ts:749.
Failure: month rolls over — request A's ensureTokenWallet commits monthlyCreditsRemaining = 3, monthlyCycleKey = new, while B's tx commits a decrement to 2 → A's absolute write restores 3. One free credit per race. :1756 also inserts without onDuplicateKeyUpdate → concurrent first-touch throws ER_DUP_ENTRY → 500.

Coverage reward cap — STILL-PRESENT
db.ts:1468-1469 reads with plain select; drizzle/schema.ts:484 has uniqueIndex on invitationId and joinerUserId but only index("coverage_reward_inviter_idx") on inviterUserId. Same pattern at db.ts:612-615.
Failure: inviter shares two invite codes; two employees redeem concurrently → two invite_reward_pending rows for the same inviter (db.ts:1477).

fulfillCompanyCoverageInvitation — STILL-PRESENT
db.ts:1462 invitation read has no .for("update"); db.ts:1479 set({status:"completed"}).where(eq(id, invitation.id)) has no current-status guard. Redeeming one code twice concurrently yields both completions.

openCompanyReferralAvailability — STILL-PRESENT
db.ts:995-1000: CAS is correct (:999, affectedRows at :1000) but the candidate select at :997 has no FOR UPDATE SKIP LOCKED; under REPEATABLE READ the retry continue re-reads the same snapshot row every pass, so attempts =5.

Lock-order inversion — STILL-PRESENT
Create: wallet db.ts:753 → request db.ts:754 → ledger db.ts:767. Withdraw: request db.ts:963 → ledger db.ts:966 → wallet db.ts:968. ER_LOCK_DEADLOCK appears nowhere in server/ or src/ (only in adminSchemaReconcileRoutes.test.ts) → surfaces as a 500 with no retry.

insert(notifications) without eventKey — 13 sites in db.ts
617, 637, 727, 772, 1002, 1249, 1380, 1395, 1478, 1536, 1680, 1739, 1797. Only db.ts:1151 and db.ts:1375 set eventKey, so the nullable UNIQUE dedupe is inert for every referral/credit notification.

Test-quality claim — STILL-PRESENT
server/referralTransitionIntegrity.test.ts:4-6 (readFileSync + toContain at :12-17), server/rewardIntegrity.test.ts:2-8, server/paymentWalletConcurrency.test.ts:4,16-28, server/workEmailOtpConcurrency.test.ts:2,5-7 — all assert source text, not behaviour. server/walletAtomic.mysql.test.ts:4-5 is describe.skip unless WALLET_MYSQL_ACCEPTANCE==="1"; .github/workflows/ci.yml sets no such env and declares no MySQL service. #76's own server/spendTokenConcurrency.test.ts:1-20 repeats the same text-matching pattern (asserts .for("update") appears in a string slice) — it cannot detect a lock-order or SKIP LOCKED regression.

NEW defects on main (not in the claim list)

server/chargebeeRoutes.ts:208-218 — if resolveHostedPage scans 25 pages and misses, fulfillPayment still runs with passThruContent: undefined; db.ts:1873+ then falls back to the tokenPackFromAmount arm and credits a pack multiple with no checkout-intent attribution (amount-only fulfillment).
server/paymentWebhooks.ts:111 — applyUnlockRefund is invoked for every refund.processed, including Razorpay refunds unrelated to unlock packs; each unknown-payment refund inserts an employerPaymentRefunds row with reason:"refund_before_capture_or_unknown_payment", so unrelated refund traffic permanently occupies the admin review queue.
server/db.ts:2638 — the refund lookup keys only on providerPaymentId, which fulfillUnlockCreditPurchase:2594 clears semantics on: a refund arriving for an intent still in pending (order bound, providerPaymentId NULL) is indistinguishable from a genuinely unknown payment.
server/db.ts:1001 — referralAvailabilitySlots.activeRequestKey is written as a plain string; if that column is not UNIQUE (unlike the surrounding CAS discipline at :999), the same request can hold two allocated slots across allocator restarts.
server/adminBillingCatalog.ts:119-121 — for...await over ~14 item prices at up to 10s each with no aggregate deadline; the admin GET can run ~140s and outlive its own request.

All verdicts below cite origin/main (0327f3b) content and line numbers. No files were modified.

IDENTITY / AUTH

PARTIAL. Only guard today: workosAuth.ts:43-49 — throws only when NODE_ENV==='production' && anyConfigured && !allConfigured. If all three WORKOS_ are unset/empty it returns false → server/_core/index.ts:143-144 if (workosConfigured()) createWorkosAuthRoutesRegistrar()(app); else registerDevAuthRoutes(app) with no NODE_ENV check (ENV.isProduction exists at _core/env.ts:9, unused here; no test covers it). src/worker.ts:43 (value.length > 0) makes "" ≡ unset. resolveSyncedUserRole (db.ts:49-57) blocks only admin promotion for loginMethod:"dev" (:51-55, proven by db.roleSync.test.ts:16); it does not block session minting. Exploit: clear WORKOS secrets → POST /api/dev-auth/login {"email":"someone@acme.com"} → 200 + real app_session_id (devAuth.ts:120-121, 30 min) → full authenticated surface.

STILL-PRESENT. db.ts:138-140: isNull(users.canonicalPersonId) AND LOWER(TRIM(users.email)) = ? .for("update"); loginMethod is not a predicate (db.ts:135-136 states this is deliberate), and :153 writes canonicalPersonId. upsertUser (db.ts:169, sole prod caller devAuth.ts:58) never sets canonicalPersonId → permanently adoptable. Chain: dev row for victim@corp → victim's emailVerified:true sign-in (otpLogin.ts:62 hardcodes true; workosAuth.ts:264) adopts it → attacker's live cookie resolves through getUserByOpenId (db.ts:188-197) to the victim's canonical id → wallet/documents/referrals.

STILL-PRESENT. devAuth.ts:41-42 hardcodes verification:{status:"verified"}; privateReferralRoutes.ts:457 selects on that field and :466 calls saveVerifiedWorkEmail with no receipt. WorkOS plane maps real state (workosAuth.ts:115).

STILL-PRESENT. db.ts:236-246 updateUserProfileByWorkosId writes users.email from any webhook data.email (workosWebhooks.ts:98-100) — never reads emailVerified, never updates canonicalPeople.normalizedVerifiedEmail (schema.ts:5,11) or verifiedLoginAliases.normalizedVerifiedEmail (schema.ts:36). Alias table and users row diverge.

NOT-REPRODUCIBLE (no caller) / PARTIAL. db.ts:212-216 reads only users.suspended for one row. git grep isUserSuspended origin/main → zero production call sites. Live choke point db.ts:194-197 does merge canonicalPeople.suspended + max sessionsValidAfter. Dead narrow helper, not a bypass.

PARTIAL. schema.ts:7,22 defaultNow().notNull(). Comparison sites: sdk.ts:38 (cookie), workosAuth.ts:98,114 (bearer). Insert paths never supply a JS value: db.ts:158-159, db.ts:169. Revocation always supplies JS new Date() (db.ts:160, :207-210, :133-134/145-148). So steady state is JS-vs-JS; DB clock enters only at row creation, where DB-ahead skew makes a fresh account reject its own token.

(a) STILL-PRESENT workEmailOtp.ts:33 unsalted sha256(email:code). (b) STILL-PRESENT :107-114 — no consumed-code-row proof. (c) STILL-PRESENT :16,21,25 unbounded Map; key space unrestricted (isWorkEmailDomain db.ts:567 only excludes consumer domains). (d) ALREADY-FIXED — :120 is a single atomic SET attempts = attempts + 1 WHERE … AND attempts  iat); workosAuth.ts:98 and :114 millisecond-granular (iat1000  statement-breakpoint. Not journaled, not in drizzle/deploy/ → never runs today.

STILL-PRESENT. 0037_b2b_monetization.sql:24 and :62 ON UPDATE NOW. Same non-reachability caveat.

STILL-PRESENT. 0052_talent_consent_entitlements.sql:28-38 and :47-57 discover any non_unique=0 index whose column set is exactly employerUserId,seekerProfileUserId and DROP INDEX it by discovered name (:37, :56) — an operator-added unique on that pair is destroyed. End state non-unique: schema.ts:169, :187. Restore pattern exists: generated activeKey + UNIQUE at schema.ts:676 (privacy_request_active_key_unique).

STILL-PRESENT. 0054_employer_checkout_intents.sql:6-8 nullable adds → :12-16 bulk UPDATE → :18-20 three MODIFY … NOT NULL → :21-22 ADD UNIQUE, one file on a live payments table. IF-guarded so it resumes, but any surviving NULL makes the NOT NULL MODIFY fail half-done.

STILL-PRESENT. schema.ts:421 nullable eventKey + :424 UNIQUE. 16 insert(notifications) sites in db.ts; only 3 set eventKey (db.ts:1151, :1375, :2227) → 13 omit it → unlimited NULLs, dedupe off.

Per-index.
profiles(workEmailDomain, accountType, workEmailVerifiedAt): MISSING (schema.ts:66 = profiles_user_id_unique only) but query shape wrong — the .for("update") sites are db.ts:2338, :2377 = profiles WHERE userId=? (uses the unique). Unindexed domain scans do exist: db.ts:554, 759, 864, 2139 (no lock).
users(canonicalPersonId, email): MISSING (schema.ts:26 single-col); query as described at db.ts:139; LOWER(TRIM()) is non-sargable regardless.
jobs(publishedAt DESC): MISSING (schema.ts:84 company/location); unbounded query confirmed db.ts:685.
referralRequests(jobSeekerId|referrerId, updatedAt): MISSING composites (schema.ts:239 single-col); OR + filesort + no LIMIT confirmed db.ts:719.
notifications(userId, createdAt DESC): MISSING composite (schema.ts:424); unbounded confirmed db.ts:1381.
messages(recipientId, readAt): MISSING composite (schema.ts:405); queries confirmed db.ts:402, 932, 981.
tokenTransactions(kind, rewardStatus): MISSING, but not as described — db.ts:1785 filters userId+role+kind+rewardStatus and token_transactions_user_idx (schema.ts:463) applies.

STILL-PRESENT / BLOCKING. Sole reference is schemaReconcile.ts:228; git grep "resumeUploadAttempts|acceptedAttemptId" origin/main returns only schemaReconcile.ts:228 + schemaReconcile.test.ts:17,24 — absent from drizzle/schema.ts, all 65 .sql, and drizzle/deploy/. Not in DESIRED_COLUMNS (:23-57). Check pushed unconditionally (:226-229); reconciled = true only if failed.length === 0 (:231-233) → unreachable. healthRoutes.ts:6 → permanent 503 state:"failed"; verify-cloudflare-container-release.sh:5-6 → poll-cloudflare-readiness.sh:17 returns 3 on state==failed → deploy gate unsatisfiable. startSchemaReconcileRecovery (:256-288) backoff-loops 1s→30s forever. DESIRED_TABLES[].createSql (:9-21) is dead — :221 reads only item.table, and reconcileSchema executes only two information_schema SELECTs (:210, :224) — while comments at :4-8, :59-62, :75-77 and index.ts:91-95 promise boot self-healing.

RUNTIME / DISTRIBUTED

STILL-PRESENT. git grep "SIGTERM|SIGINT|process.on\(" origin/main -- server/ src/ shared/ → zero hits. db.ts:26 pool never .end()ed.
STILL-PRESENT. index.ts:77-84 scans 3000-3019; :236-245 binds silently (console.log only) while Dockerfile:13,19 PORT=3000/EXPOSE 3000 and src/worker.ts:31 defaultPort=3000 are fixed.
STILL-PRESENT. db.ts:283 new Date(Date.now()+2601000) vs db.ts:284  sql${finalizationLeaseUntil}  statement-breakpoint; 0037_b2b_monetization.sql:24,62 uses ON UPDATE NOW, which is not MySQL grammar. apply-deploy-migrations.sh:8 lints only drizzle/deploy/ — there is no MySQL-8 parser gate on drizzle/.sql.

E4 · P1 · The freeze that doesn't freeze. drizzle/0057_canonical_identity.sql:61-62, verified verbatim on main:
SET u.suspended = true,
    u.sessionsValidAfter = IF(u.suspended, u.sessionsValidAfter, CURRENT_TIMESTAMP)
MySQL applies SET left-to-right, so u.suspended reads the new true and the old timestamp survives. Every account frozen as an ambiguous historic duplicate keeps a working session — exactly the "freeze pending operator review" guarantee, silently inverted. Swap the two assignments. Since 0057 has already run, this is a data question now: how many users are suspended-but-authenticated today. db.suspendReview.test.ts covers setUserSuspended, not this SQL.

E5–E9 · P1/P2 · Constraint and DDL gaps. 0052_talent_consent_entitlements.sql:28-38,47-57 drops the pair-uniques on employerTalentRefs/profileUnlocks, leaving "one active unlock per employer/seeker" enforced only in code (concurrent employer-credit double-spend) — and does it by DROP INDEX matched on a discovered column set, so an operator-added unique is destroyed without review; your repo already owns the correct pattern (generated activeKey + UNIQUE, schema.ts:676). notifications.eventKey is nullable-unique (schema.ts:421,424) and 13 of 16 insert sites omit it ⇒ dedupe inert. Missing composites, each cross-checked against the real query: jobs(publishedAt), referralRequests(jobSeekerId|referrerId, updatedAt), notifications(userId, createdAt), messages(recipientId, readAt), users(canonicalPersonId, email) (and LOWER(TRIM()) is non-sargable regardless). 0054:6-22 does nullable-add → bulk UPDATE → three MODIFY NOT NULL → ADD UNIQUE in one file on a live payments table. No CHECK anywhere guards creditDebt, creditsRemaining, refundedAmount, or amount going negative; money is unnamed int in 4 tables while budgets are …UsdCents. schemaReconcile's header comments (:4-8,59-62,75-77) and index.ts:91-95 advertise boot self-healing while the function is SELECT-only and DESIRED_TABLES[].createSql is dead code that contradicts the real migrations (:13 NOT NULL vs 0054:9 NULL) — and schemaReconcile.test.ts:17 hand-invents the E1 phantom FK, so "accepts the migrated schema" proves the mock.

F. The root cause behind B and E — worth fixing first

Your concurrency tests cannot observe concurrency. referralTransitionIntegrity.test.ts:4-6, rewardIntegrity.test.ts:2-8, paymentWalletConcurrency.test.ts:4,16-28, workEmailOtpConcurrency.test.ts:2,5-7 all readFileSync(db.ts) and assert toContain('.for("update")'). The test #76 itself added (spendTokenConcurrency.test.ts:1-20) repeats the pattern — it would pass on B1, B3, B5 and every lock-order regression. The only real-InnoDB suite, walletAtomic.mysql.test.ts, is describe.skip unless WALLET_MYSQL_ACCEPTANCE=1, which .github/workflows/ci.yml never sets and has no MySQL service for. And db.promoCredits.test.ts's fake makes .for() a no-op on a shared array, so every "concurrent" case is one interleaving. This is precisely the "fix the generator, not the output" rule inverted: the generator here is your test oracle, and AGENTS.md's test-first requirement is satisfied in letter and voided in fact.

Do not re-engineer these — main already gets them right

Webhook consumer claim is atomic CAS + payment_fulfillments_provider_event_unique (db.ts:1881); referral transitions are CAS-guarded on status + revision with operation-key replay (db.ts:1165-1183, uniques in 0058); pending→granted rewards are monotonic with relative balance + total (db.ts:1788); referral create is wallet-locked with idempotency fingerprint → 409 (:761-788); OTP consumption is FOR UPDATE + affectedRows === 1 with all time math in JS (workEmailOtp.ts:93-105) and durable, multi-instance rate limits (:37-48); WorkOS bearer verification pins RS256 and checks iss/aud/azp/sid/jti/exp≤1h (workosAuth.ts:69-88); admin gating uses exact email equality at both entry and callback; Razorpay HMAC runs on captured raw bytes before any write; no in-memory money fallback (db.ts:24-42 fails closed); deploy-api.yml is concurrency-serialized with a migration-before-runtime gate. Fix C2 and C3 around these, not inside them.

Three cheap probes that change severities

I cannot settle these from code, and two of them decide whether C1 and E4 are P0-urgent or latent:

wrangler secret list for the API Worker — are WORKOS_CLIENT_ID/API_KEY/COOKIE_PASSWORD all present and non-empty? If any is empty-string, C1 is live now.
SELECT id, suspended, sessionsValidAfter FROM users u JOIN identityLinkAudits a ON a.canonicalUserId=u.id AND a.action='historic_duplicate_email_frozen' WHERE u.suspended=1 AND u.sessionsValidAfter < NOW() - INTERVAL 30 MINUTE; — how many frozen accounts hold valid sessions (E4).
SELECT COUNT() FROM employerPaymentRefunds WHERE reason='refund_before_capture_or_unknown_payment' AND fulfillmentId IS NULL; — whether A1 has already paid out.

Suggested order

Batch  IDs  Why now

0  branch reset + CI guard rejecting ^<<<<<<<  in tracked files  Nothing below is verifiable while pnpm check fails
1  A4, C1 probe, D1, E1  One line, one secret check, and the two silent-prod-state risks
2  F (real-MySQL CI suite) then B1–B5  The oracle first, so each race fix is actually proven
3  A1, A2, A3, A5, A6  Money-loss and lost-revenue paths
4  C2, C3, C4, C5, C8  Identity-convergence invariants you've already written down
5  E2–E9, D2–D7  Migration hygiene, lifecycle, unbounded reads

Tell me which IDs to take and I'll write the per-change plan with @path targets and a failing test first, on a fresh branch off origin/main. I'd also suggest persisting this as docs/BACKEND_ROBUSTNESS_AUDIT.md so we can reference items by ID across sessions — say the word and I'll write it. No files were modified; the only writes were a project memory noting that prod schema comes from drizzle/deploy/`, not the Drizzle journal.
</inbound_phone_message>
```
