# SkipWait architecture map (as built)

> Read [`docs/BRIEF.md`](BRIEF.md) first (D-073). This map describes what the code does today, so a model can find its way without reading the large files. The register, `AGENTS.md` and the plan win any conflict (D-074).

Verified against `main` `e6b87f8` (Oct 18 2026). Line numbers drift: find a function by name (`/usr/bin/grep -n "name" file`) before you trust a number. Section 11 lists the known gaps; each one has a packet or queue row.

## 1. What runs where
| Piece | Where | Source of truth |
|---|---|---|
| Web app (React 19, Vite, Tailwind 4, wouter) | Cloudflare Pages project `skipwait`, files from `dist/public` | `client/`, `wrangler.toml`, `.github/workflows/deploy-pages.yml` |
| Pages Functions: route list, CSP (report-only), SEO, sitemap, share cards, API proxy | Cloudflare Pages | `functions/_middleware.ts`, `functions/sitemap.xml.ts`, `functions/share-card/[token].ts`, `functions/api/[[path]].ts` |
| API edge: a Worker that answers only `https://skipwait.me/api/*`, 404s `/api/internal/*` from outside, sets one `X-Forwarded-For` from `CF-Connecting-IP`, runs the hourly cron | Cloudflare Worker `skipwaitmanus` | `src/worker.ts`, `wrangler.jsonc` (`workers_dev: false`, route `skipwait.me/api/*`, cron `0 * * * *`) |
| API server: Express in a container (port 3000, up to 3 instances, region WNAM, sleeps after 10 min idle) | Cloudflare Containers, class `SkipwaitApi`, image from `Dockerfile` | `server/_core/index.ts`, `src/worker.ts` |
| Database | Azure MySQL through `mysql2` and Drizzle | `server/db.ts` `getDb()` (returns `null` without `DATABASE_URL`; there is no in-memory fallback), `drizzle/schema.ts` |
| Files (resumes) | R2 when all `R2_*` keys are set, else Manus Forge storage, else database blobs | `server/_core/index.ts` (adapter choice), `server/storageCloudflare.ts`, `server/storage.ts`, `server/storageDb.ts` |

**Secrets.** The container sees only keys listed in `CONTAINER_ENV_KEYS` in `src/worker.ts` (Worker vars and secrets are not inherited). Every server secret must be in that list and in `.env.example`.

## 2. How a request flows through the API (`server/_core/index.ts`)
1. **Before listening:**
   - `validateBillingEnvironment()`: `BILLING_ENV` must be `test` or `live`, with the full Chargebee key set for that environment, or the server never listens.
   - Boot-time schema reconcile (`server/schemaReconcile.ts`). `/api/health/ready` stays not-ready until it finishes.
2. **Order of middleware and routes:**
   - `trust proxy`, then security headers.
   - **Webhook routes before any body parser**, so they get the raw body for signature checks: payment webhooks (Razorpay, PayPal), WorkOS webhooks.
   - Job-link preview routes.
   - `Server-Timing` on `/api`, plus a log line for responses slower than 800 ms (path only).
   - JSON and form parsers capped at 256 KB (the two document upload routes have their own parser).
   - Health routes, then the admin smoke fixture (production code, enabled by a Worker var).
   - Account sessions and preferences, then session renewal on `/api`.
   - Referrer work-email OTP login, password reset.
   - WorkOS auth when its keys exist; otherwise the dev-auth routes.
   - Error-alert middleware.
   - Domain routes, in this order: `registerPrivateReferralRoutes` (the core: asks, referrals, documents, notifications, admin flow health), company directory, scheduled jobs (the Worker tick, admin job status), employer, DMs, follows, assistants, MCP, OAuth, ask drafts, profile, safety, blocks, payments (consumer order routes always answer 503, D-004), admin billing catalog, public plans catalog, admin billing ledger, Chargebee checkout and webhook.
   - tRPC at `/api/trpc` (`server/routers.ts`; the client uses it only for `auth.me`, talent consent and `profile.mine`).
   - Sentry error middleware last.
3. **Identity.** Every handler resolves the signed-in person through `resolveIdentity`, which returns the canonical person plus aliases. That person comes from either a WorkOS bearer JWT (checked against WorkOS JWKS) or the `app_session_id` cookie (an HS256 JWT that must carry a non-empty `appId`). MySQL has no row-level security: each query scopes itself to that person and their company (BRIEF, "How to ship").

## 3. Code map
- `server/` (about 21K lines of non-test code):
  - **Core:** `db.ts` (about 470 KB; see §4), `privateReferralRoutes.ts` (about 170 KB, every referral REST route), `_core/` (boot, auth, sessions, LLM, OTP login, dev auth), `routers.ts` (tRPC).
  - **Money:** `chargebee*.ts`, `kitCheckout.ts`, `payments.ts`, `paymentWebhooks.ts`, `creditLedger.ts`, `planCreditCycleJob.ts`, `billingAvailability.ts`, `billingSettings.ts`, `paymentRefund*.ts`.
  - **Referral rules:**
    - `heldAsk.ts`: personal-link holds (D-050);
    - `coverageDelivery.ts` and `coverageDeliverySweep.ts`: D-034 delivery and hold;
    - `referrerAvailability.ts`: who is available, by capacity (D-062);
    - `blockedPairs.ts`;
    - `referrerDocumentAccess.ts` and `referrerAskView.ts`: what a referrer may see before and after acceptance;
    - `askExpirySweep.ts`;
    - `planGates.ts`: open-ask slots and the per-company cap (D-006).
  - **Jobs:** `scheduledJobRegistry.ts`, `scheduledJobRunner.ts`, `scheduledJobsRoutes.ts`, `jobRunStore.ts`.
  - **Email:** `emailDelivery.ts` (ZeptoMail first, Resend only when ZeptoMail is not configured), `errorAlerting.ts` (admin alerts, Resend only), `workEmailOtp.ts`, `referrerReviewEmail.ts`.
  - **Test kits:** `inMemoryDrizzle.testkit.ts`, `heldAsk.testkit.ts`, `documentAccess.testkit.ts`, `ledgerFixtureDb.ts`.
- `shared/` (about 4K lines): client and server contracts (Zod) and pure rules.
  - `referral.ts`: statuses, labels and shelf-life clocks.
  - `creditLedger.ts`, `planCatalog.ts`, `billingCatalog.ts`, `planEntitlements.ts`, `openAskSlots.ts`.
  - `moneyCopy.ts`: the D-063 sentence and the credit rule text.
  - `passReasons.ts`, `referrerAccess.ts`, `scheduledJobs.ts`, `jobsTick.ts`.
- `client/src/` (about 27K lines):
  - `App.tsx`: every route on one line; 81 lazy pages, Home eager.
  - `pages/`: a flat folder, one page per route.
  - `components/`: by domain. `kit/` holds the live Kit v4 button, panel and status pill; `ui/` holds shadcn parts, 10 of them unused.
  - `lib/`: `apiResponse.ts` `readApiJson`, `threadApi.ts`, `trpc.ts`, `referrerSignIn.ts`, `idempotentSend.ts`.
  - `_core/auth.tsx`: AuthKit, or a server-session-only fallback.
  - Styles: `index.css`, plus `styles/kit.css` (ported kit CSS, 86 KB, never edited rule by rule).
- `drizzle/`: `schema.ts` (78 tables) and `deploy/NNNN_*.sql`, the production migrations (latest `0095`). Older `drizzle/00xx_*.sql` files are history.
- `scripts/`: build-time prerender (`prerender-public-pages.tsx`), the gate scripts (§9), deploy shell scripts, the screenshot harness (`kit-screens/capture.mjs`), and one-off owner scripts.
- Not product code (never edit for a product change):
  - `app/`: the Kit v4 reference app, a separate TanStack project that nothing builds or tests.
  - `screens/`, `design/`, `research/`, `artifacts/`.
  - The root `.zip` and `.pdf`.

## 4. `server/db.ts` by domain (line ranges at `e6b87f8`)
Never read it whole. Find a function with `/usr/bin/grep -n "export async function name" server/db.ts`, then read its range with `sed -n 'A,Bp' server/db.ts | cut -c1-400`.

| Lines | Domain | Key functions |
|---|---|---|
| 73-270 | Connection, identity, sessions | `getDb`, `resolveLoginIdentity`, `upsertUser`, `provisionWorkEmailIdentity`, `revokeUserSessions` |
| 270-420 | Profiles, referrer preferences, work items | `getMyProfile`, `updateMyProfile`, `updateReferrerPreferences` |
| 420-820 | Seeker alerts, assistants, developer apps | `notifySeekerAlertsForCompany`, `proposeAssistantAsk`, `decideAssistantApproval` |
| 875-1210 | Public profiles, safety, admin users, resume uploads, privacy | `getPublicProfileByHandle`, `createSafetyReport`, `setUserSuspended`, `exportUserData` |
| 1215-1380 | Referrer impact, fast-track (personal) links, activity log | `getPrivateReferrerImpactSummary`, `getOrCreateReferrerFastTrackLink`, `recordOperationalActivity` |
| 1380-1530 | Employer resolution, work-email enrollment | `resolveEmployerDomainFromTargetUrl`, `completeWorkEmailOtpEnrollment`, `saveVerifiedWorkEmail` |
| 1531-1745 | Company openings (D-022) | `publishCompanyOpportunity`, `firstLookExcludesViewer`, `renewCompanyOpportunity` |
| 1747-2110 | Ask creation and the referrer inbox | `createCompanyReferralRequest`, `createReferrerReviewEmailLinks`, `oneClickReviewReferralRequest`, `listCompanyReferralInboxByState`, `getUnclaimedCompanyReferralPreview` |
| 2110-2430 | Withdraw, refund, expiry, slots | `withdrawCompanyReferralRequest`, `refundLedgerSpendTx`, `expireStalePendingReferralRequest`, `releaseFirstLookForRequest`, `reconcileExpiredPendingReferrals`, `getOpenAskSlots` |
| 2428-2670 | Seeker list, D-034 delivery, queue opening | `listJobSeekerCompanyReferrals`, `deliverWaitingAsksToReferrer`, `tryDeliverWaitingAsk`, `openCompanyReferralAvailability` |
| 2667-2745 | Public numbers, integrity, flow health, ledger audit | `getPublicReferralImpact`, `getReferralFlowHealth`, `getCreditLedgerAudit` |
| 2745-3010 | Claim, documents, the transition engine, review, progress, share cards | `claimCompanyReferralRequest`, `getClaimedCompanyReferralDetail`, `getAccessibleReferralAttachment`, `transitionReferralRequestTx` (not exported, about 2848), `reviewReferralRequest`, `updateReferralProgress` |
| 3012-3140 | Follows, DMs, notifications | `isMutualFollow`, `sendDirectMessage`, `createNotification` |
| 3141-3400 | Dashboard, AI context, coverage invites, personal invites | `getAiWorkspaceContext`, `fulfillCompanyCoverageInvitation`, `claimPersonalReferralInvite` |
| 3399-3660 | Promo grants, admin token adjustments, wallets, spending | `grantPromoCreditsTx`, `ensureTokenWallet`, `getTokenWallet`, `listCreditLedger`, `spendCredits` |
| 3653-3940 | Chargebee payments, review queue, refunds, revenue | `fulfillChargebeePayment`, `resolveRequiresReviewPayment`, `revokeCreditedPaymentCredits`, `applyChargebeePaymentRefund` |
| 3937-4340 | Subscriptions and gifts | `applyChargebeeSubscriptionEvent`, `fulfillGiftSubscription`, `claimGiftSubscription` |
| 4339-4470 | Admin approval queue | `listAdminApprovalQueue`, `resolveAdminApproval` |
| 4470-4860 | Employer accounts, talent, sponsorship, partners, unlock credits | `ensureEmployerAccount`, `spendEmployerUnlockCredit`, `orderOpportunitiesOrganicFirst`, `fulfillUnlockCreditPurchase` |
| 4860-4900 | Billing ledger rows, referrer home, account preferences | `listBillingLedgerRows`, `getReferrerHome` |

## 5. Data model (`drizzle/schema.ts`, 78 tables)
- **People:** `canonicalPeople`, `users`, `verifiedLoginAliases`, `identityLinkAudits`, `profiles`, `accountPreferences`, `userFollows`, `userBlocks`.
- **Asks:**
  - `jobs` (the role behind an ask);
  - `referralRequests` (status, `referrerId`, `revision`, `debitTransactionId`, coverage flags `waitingForCoverage`, `coverageVisibleAt`, `coverageHeldAt`, first look);
  - `referralTransitionEvents` (one row per transition: `action` claim/approve/pass/review/progress/expire/withdraw, unique on request + revision);
  - `referralRequestPasses`, `referralRequestSaves`, `referralDocumentAccessGrants`, `referralAttachments`, `askDrafts`. Not on `main` yet: `askWorkItems` (Qoder's PR #308, migration 0096).
- **Referrer side:** `referralAvailabilitySlots` (allocated, then released), `referrerFastTrackLinks`, `referrerReviewEmailLinks`, `referralReviewDeliveries`, `referralReviewGrantRotations`, `referrerSlackWebhooks`, `workEmailOtpCodes`, `workEmailOtpReceipts`, `workEmailOtpRateLimits`.
- **Companies and openings:** `companies`, `companyDomains`, `companyOpportunities`, `companyCoverageInvitations`, `companyCoverageRewards`, `companySuggestions`.
- **Money:**
  - `tokenBalances` (one wallet per person and role), `tokenTransactions` (keyed ledger rows, unique on key and on reversal);
  - `planCreditGrants`, `promoCreditGrants`, `adminTokenAdjustments`;
  - `paymentFulfillments` (one row per checkout: pending, credited, requires_review, refunded, rejected), `subscriptionCheckoutIntents`, `subscriptionEvents`;
  - `billingCustomers`, `billingInvoices`, `giftSubscriptionFulfillments`;
  - employer `employerPaymentFulfillments`, `employerPaymentRefunds`, `profileUnlocks`.
- **Operations:** `operationalActivityLogs` (audit, also used to deduplicate refunds), `jobRuns` (scheduled-job leases), `notifications`, `messages`, `dataExports`, `privacyRequests`, `documentBlobs`, `moderationEvents`, `moderationEvidence`, `safetyReports`.
- **Assistants and OAuth:** `assistantConnections`, `assistantTokens`, `assistantApprovals`, `developerApps`, `oauthClients`, `oauthAuthCodes`.

**Migrations.** A schema change is a new file `drizzle/deploy/NNNN_name.sql`. It must be additive and guarded through `information_schema`, with `CREATE TABLE IF NOT EXISTS`, and never DROP, RENAME, TRUNCATE or DELETE (`scripts/lint-deploy-migrations.sh`). Ship it together with a `drizzle/schema.ts` change and a `server/schemaReconcile.ts` entry. `deploy-api.yml` applies pending files before the new API starts. An applied file must never be edited (the apply script exits 4).

## 6. The state machines
**Ask lifecycle** (`shared/referral.ts` statuses: `pending`, `approved`, `declined`, `intro_made`, `interview`, `offer`, `closed`, `withdrawn`). Every change goes through `transitionReferralRequestTx`, which:
- compares and sets `revision`;
- writes one `referralTransitionEvents` row with event key `referral:<id>:v<revision>:<status>`;
- writes the notification;
- on acceptance, opens the document grant and frees the accepter's slot;
- on `declined`, `withdrawn` or `closed`, revokes grants and frees every slot.

The transitions:
- **Create.** Saved `waitingForCoverage` (free, D-034) when the company has no available referrer. Otherwise the credit is spent at send and every available employee is notified.
- **Deliver or hold** (D-034, D-047). The first visibility spends one credit under `ask-delivery:<id>`, assigns one referrer, allocates their slot and sets `coverageVisibleAt`. With no credit, the ask is held (`coverageHeldAt`) and retried hourly.
- **Claim.** Records `claim`; this is the only "pickup".
- **Accept.** One-click, review or email link. The one-click and email-link routes refuse an approval without `ethicsConfirmed: true` (PR #316).
- **Pass.** Records the reason, clears `referrerId`, and the ask reopens to colleagues (D-021).
- **Progress.** `intro_made` ("Referred", with an optional reference id), `interview`, `offer`, `closed` (hired).
- **Withdraw.** Before pickup, the credit comes back once.
- **Expire.** `closed` with no referrer:
  - 7 days after first visibility, with the credit back if nobody picked it up;
  - 90 days for a waiting ask, at no cost.

Note: `closed` means hired when a referrer accepted, and expired when none did (§11).

**Credits** (`shared/creditLedger.ts`, `server/creditLedger.ts`):
- **Buckets:** the monthly cycle (Free: 3 per UTC month, D-039); plan carryover; purchased `balance`; promo. They are spent soonest-expiring first.
- **Keys:** every move is a keyed `tokenTransactions` row, so a replay writes nothing twice: `ask-delivery:<id>#1`, `payment-credit-<paymentId>`, `payment-refund-<paymentId>[-<round>]`.
- **Refunds:** a refund reverses exactly what one ask spent. It returns 0, and says so, when the bucket has ended.
- `getCreditLedgerAudit` reconciles the buckets (today only the 200 latest wallets; D-065 makes it daily).

**Payments** (`docs/PAYMENTS_TEST_RUNBOOK.md` §7 is the recovery manual):
- **Checkout.** Checkout writes `pending:<hostedPageId>`.
- **Paid event.** A Chargebee paid event, from the webhook, recovery or the hourly reconcile, credits once in one transaction.
- **Review.** A mismatch or unmatched payment is parked as `requires_review`, with an admin alert.
- **Refunds.** A full refund takes back unused credits, never below zero; any other refund is parked for review.
- **Gateways.** Razorpay for INR and PayPal for USD, behind Chargebee hosted pages only (D-004).

**Identity:**
- One canonical person, plus verified aliases (WorkOS subjects, verified emails).
- WorkOS sign-in and work-email OTP converge on that person.
- Ambiguous cases are frozen for operator review.
- A suspension covers every alias.
- Referrers sign in only with a work-email code (D-030, D-049).

## 7. Scheduled jobs
**How they run.** The Worker cron fires hourly and POSTs `/api/internal/jobs/tick` with HMAC(`JWT_SECRET`, minute) (accepted ±1 minute). The server runs each registered job once per window: a `jobRuns` lease, a compare-and-set takeover, up to 3 attempts, Sentry on failure. Status is at `GET /api/admin/jobs`.

**The jobs** (`shared/scheduledJobs.ts`):
- `ask-expiry-sweep`
- `coverage-delivery-retry`
- `first-look-release`
- `plan-credit-cycles`
- `chargebee-pending-reconcile`
- `work-email-reverify-sweep` (dry run)
- `data-export-sweep`
- `work-email-otp-purge`

A new job needs its name in both registries and a contract test (`server/scheduledJobsContract.test.ts` pins the list).

## 8. Deploy and release truth
- **Triggers.** A push to `main` starts the deploy workflows independently of CI (they do not wait for it):
  - `deploy-api.yml` (path-filtered to server, shared, drizzle, worker and build files): `migrate-db` applies `drizzle/deploy`, then tsc, build, a two-phase `wrangler deploy`, a readiness poll, and a check that workers.dev is 404.
  - `deploy-pages.yml` (path-filtered to client, shared, functions and prerender files): build, `wrangler pages deploy`, then a check that the live `git-commit` meta matches.
- **CI.** `ci.yml` runs on pull requests and on pushes to `main`: typecheck + token audit + deploy-trigger check; full vitest; build.
- **Drift and rollback.** `drift-watch.yml` checks on a schedule that live serves the newest runtime commit on main's first-parent chain: the merge commit main deployed, never the pull request's commit inside it (#475). `rollback.yml` is manual.
- **Release truth.** A green deploy step is not proof. `EXPECTED_SHA=<sha> bash scripts/verify-live-release.sh` must print CONVERGED; for web, `https://skipwait.me` must serve `<meta name="git-commit">` with your SHA.

## 9. Tests and the gate
- **Running.** `pnpm vitest run` collects about 397 files: server, client, scripts. Vitest pins `TZ=UTC` and the `en-US` locale, and the setup fails if a worker resolves another locale.
- **No database needed.** Database code runs against fakes. Mock `drizzle-orm/mysql2` and `mysql2/promise`, stub `DATABASE_URL`, then pick one of:
  - `inMemoryDrizzle.testkit.ts` (no ORDER BY, no column defaults, no `like`, `not in`, `exists`, `col - n` or `execute`);
  - `ledgerFixtureDb.ts` (AND only);
  - a per-file SQL fake.

  Open-slot counting needs `server/db.openAskSlots.test.ts`'s interpreter. Copy the setup of the nearest existing test.
- **Client tests** run in jsdom through a `// @vitest-environment jsdom` docblock. They stub `fetch` with `vi.stubGlobal`; there is no MSW.
- **The gate** (BRIEF, "How to ship"):
  - `pnpm check` type-checks `client/src`, `server` and `shared`, including `.test.tsx` files but **not** `*.test.ts`, `scripts/` (except the prerender pair), `functions/` or `src/`;
  - `node scripts/design-token-audit.mjs` checks only Tailwind arbitrary hex classes;
  - `bash scripts/lint-deploy-migrations.sh`;
  - `node scripts/check-deploy-triggers.mjs`;
  - the full vitest run;
  - `pnpm build` (also runs the prerender).
- **Not collected:** `shared/**/*.test.ts` never runs.

## 10. External services and configuration
| Service | Owner module | Notes |
|---|---|---|
| WorkOS (seekers, admin) | `server/_core/workosAuth.ts`, `client/src/_core/auth.tsx` | Without keys, dev auth runs (local only) |
| Chargebee (+ Razorpay INR, PayPal USD) | `server/chargebee*.ts` | Site and key chosen by `BILLING_ENV` only; never by host |
| ZeptoMail, Resend | `server/emailDelivery.ts`, `server/errorAlerting.ts` | User email via ZeptoMail; admin alerts via Resend |
| Sentry | `server/sentry.ts`, `client/src/lib/sentry.ts` | Only when a DSN is set; token paths scrubbed by `shared/telemetryScrub.ts` (also admin alerts, FND-4) |
| AI (any OpenAI-compatible endpoint) | `server/_core/modelRouter.ts`, `server/ai.ts` | Deterministic fallback text; three env values swap the model |
| R2 / Forge storage | `server/storageCloudflare.ts`, `server/storage.ts` | Database blobs as the last resort |
| Microsoft Clarity | `client/src/lib/clarity.ts` | Only after "Accept all" consent; skips token pages |

`.env.example` is the contract (71 keys). `server/configContract.test.ts` checks that every referenced key is declared there, that every forwarded key is declared, and that every key the server reads is either in `CONTAINER_ENV_KEYS` or allowlisted there with the reason the platform sets it (`PORT` in the Dockerfile, `NODE_ENV` in the image).

## 11. Known gaps (each has a packet or row in `docs/plans/README.md`)
1. **Dead code that misleads readers:**
   - `styles/globals.css` (the D-048 phase-2 packet deletes it; its `--sw-*` names collide with the goal tokens);
   - the unrouted pages `Notifications.tsx` (read as text by `server/notificationCenterUi.test.ts`) and `ReferralRequest.tsx` (kept by D-067; `client/src/pages/referralRequest.auth.test.tsx` imports it).
2. **Test blind spots:**
   - `*.test.ts` files are not type-checked;
3. **Privacy hygiene:**
   - the Pages CSP is report-only with nowhere to report.
4. **Toolchain:**
   - deploys do not wait for CI;
   - `deploy-pages.yml` builds without running tests.
