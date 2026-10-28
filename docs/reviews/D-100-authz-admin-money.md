# D-100.authz-admin-money: authorization audit of admin, payment, webhook, job and health routes

- **Row:** `D-100.authz-admin-money` (Tier 3, lane `security-audit-admin`), packet `docs/plans/D-100-security-audit.md`.
- **Base read:** `origin/main` at `e0c7e3ade3b8d207fd9db96ff9ccdd87d491fcd1`. Drift-checked by re-fetching `origin/main` before commit: unchanged.
- **Auditor:** Claude Code session (read-only audit; D-225 role: reasoning, no implementation).
- **Date:** 2026-10-28.
- **Proof level:** static source reading only. No runtime requests, no test accounts, no live webhook or payment calls, no provider dashboards. Every finding below is **external and unverified** until the coordinator validates it. Nothing here is a compliance or incident claim.
- **Disclosure (packet rule 1):** findings with an exploit path are withheld from this public file and went to the coordinator privately. This file holds only hygiene and defence-in-depth items and the confirmed-good controls.

## Scope read

| Group | Files |
|---|---|
| Admin (REST) | `server/adminCatalogSyncRoutes.ts`, `server/adminBillingCatalog.ts`, `server/adminBillingLedger.ts`, `server/adminSmokeFixture.ts`, `server/scheduledJobsRoutes.ts` (admin routes), the `/api/admin/*` block of `server/privateReferralRoutes.ts` (guards only; the referral routes belong to `D-100.authz-referral`) |
| Admin (tRPC) | `server/routers.ts`, `adminProcedure` in `server/_core/trpc.ts` |
| Admin sign-in | `server/_core/workosAuth.ts` (admin entry, callback, diagnostics), role assignment in `server/db.ts` (`resolveSyncedUserRole`, `upsertUser`), `server/_core/reviewerLogin.ts` |
| Payment checkout and status | `server/chargebeeRoutes.ts`, `server/payments.ts` |
| Webhooks | `server/chargebeeRoutes.ts` (`/api/chargebee/webhook`), `server/paymentWebhooks.ts` (Razorpay, PayPal), `fulfillUnlockCreditPurchase` / `applyEmployerUnlockRefund` / `recordGatewayPaymentEvent` in `server/db.ts` |
| Jobs | `server/scheduledJobsRoutes.ts`, `server/jobsTickAuth.ts`, `shared/jobsTick.ts`, `src/worker.ts` |
| Health | `server/healthRoutes.ts`, its registration in `server/_core/index.ts:195` |

## Per-group summary

### Admin routes
- **Identity source:** session only (`resolveIdentity`: WorkOS bearer JWT or the `app_session_id` cookie). No route reads a user id or role from the request.
- **Authorization:** every `/api/admin/*` handler read checks `identity.account.role === "admin"` before any read, provider call or write (`adminCatalogSyncRoutes.ts:28-31`, `adminBillingCatalog.ts:99`, `scheduledJobsRoutes.ts:105,137,157,173,199,234,264`, `privateReferralRoutes.ts:1583-1780`). tRPC admin procedures use `adminProcedure` (`server/_core/trpc.ts:30-36`).
- **Exception by design:** `GET /api/admin/billing/ledger` also accepts a read-only header token, compared through SHA-256 digests with `timingSafeEqual` and a minimum length (`adminBillingLedger.ts:38-43,84`). It opens only that read.
- **Smoke fixture:** gated by `ENABLE_ADMIN_SMOKE_FIXTURE`, admin role and a CSRF double-submit for activation; follow-up calls need an HMAC-signed cookie and serve synthetic data only (`adminSmokeFixture.ts`).
- **Rate limiting:** money-check run and test alert are throttled to once per 5 minutes per process; catalog apply is single-flight per process; Skippy ask is capped per admin per day. Others have none (admin-only, acceptable).
- **Error text:** admin routes sometimes return `error.message`, but only to an authenticated admin.
- **Not in this file:** the admin sign-in and role-assignment review produced findings handled privately (see "Withheld" below).

### Payment checkout and status
- **Identity:** session only; the intent row is written for `identity.account.id`, never a body field. Recovery routes look up the payment or intent by `(userId, role, hostedPageId)` and refuse another user's id (`chargebeeRoutes.ts:260-271`, `:335-336`).
- **Trust path:** recovery credits only on a provider-read page that is `paid`, whose pass-through id, amount and currency equal the stored intent; mismatches are parked for review and alerted (`:276-288`, `:354-370`).
- **Referrer refusal (D-055)** and retired-plan refusals answer before any provider call.
- **Direct Razorpay/PayPal order creation** is closed: both routes return 503 after sign-in (`payments.ts:87-98`).

### Webhooks
- **Chargebee:** HTTP Basic credential compared in constant time (`chargebee.ts:80-87`, `chargebeeRoutes.ts:407`); each obligation is applied through event-id- or refund-id-keyed idempotent writers; a processing error returns 500 so the provider retries.
- **Razorpay:** HMAC-SHA256 over the exact raw bytes, constant-time compare (`paymentWebhooks.ts:43-48,83`); 503 when the secret is unset. Unlock-credit fulfilment binds the capture to the stored order and checks user, pack, amount and currency before crediting, with a guarded state transition (`db.ts:5589-5615`). Refund reversal is keyed on the provider refund id and capped at the captured amount (`db.ts:5642-5655`).
- **PayPal:** verification through PayPal's verify-signature API when configured; a failed or erroring verification returns 400; unverified events never correlate or fulfil.

### Jobs
- `POST /api/internal/jobs/tick` needs an HMAC(JWT_SECRET, minute) token, ±1 minute, constant-time (`jobsTickAuth.ts:16-27`). The Worker refuses `/api/internal/` on the public route and strips the tick header (`src/worker.ts:81-90`). Runs are leased once per window, so a replayed tick does no extra work.
- `GET /api/admin/jobs` and the money-check routes: admin role, `private, no-store`.

### Health
- `/api/health`, `/live`, `/ready`, `/latency` are public and `no-store`. They return the commit SHA, readiness state and a cached (30 s) DB round-trip time. No user data, no error text (`healthRoutes.ts`).

## Findings (public: hygiene and defence in depth only)

| ID | Sev | File:line | What can go wrong | Who could do it | Smallest safe correction direction |
|---|---|---|---|---|---|
| AM-01 | P3 | `server/chargebeeRoutes.ts:260` | `POST /api/chargebee/credit-recovery` re-reads the provider hosted page on every call for a pending payment, with no throttle. The sibling subscription-recovery route has a 5-per-minute limiter (`:307`). | Any signed-in user, against their own pending payment. Cost: provider API quota and latency. | Reuse the same per-user limiter (`recoveryThrottled`) for credit recovery. |
| AM-02 | P3 | `server/chargebeeRoutes.ts:94` | Checkout creation has no per-user rate limit; each call creates a provider hosted page and a durable intent row. | Any signed-in user. Cost: provider quota, intent-table growth, noisy abandoned-checkout sweeps. | A small per-user, per-minute limit on checkout starts, answered 429 before any provider call. |
| AM-03 | P3 | `server/chargebeeRoutes.ts:236` | The gift-claim catch-all returns `error.message` to the caller, so an unexpected internal error (DB, driver) can surface its text. | Any signed-in user who triggers an unexpected error. | Return a fixed message for unrecognised errors; keep the two known messages mapped as today. |
| AM-04 | P3 | `server/privateReferralRoutes.ts:1539` | The admin referral CSV export quotes cells but does not neutralise leading `=`, `+`, `-`, `@`. Company and job-title text from users can become a spreadsheet formula when the admin opens the file. | A member who controls a field in the export; impact lands on the admin's spreadsheet. | Prefix cells that start with those characters (or a tab/CR) with a single quote, per the OWASP CSV-injection guidance. |
| AM-05 | P3 | `server/paymentWebhooks.ts:154` | PayPal signature input reads a non-standard `PAYPAL-AUTH-TIMEOUT` header before `PAYPAL-TRANSMISSION-TIME`. A request carrying the first header changes what is sent for verification. This can only make verification fail, not pass, but it is unexpected input. | Anyone posting to the route; no bypass. | Read `PAYPAL-TRANSMISSION-TIME` only. |
| AM-06 | P3 | `server/paymentWebhooks.ts:115` | The Razorpay correlation passes the event *type* as `eventId`. Today `recordGatewayPaymentEvent` ignores it, but any later dedupe keyed on it would treat every event of a type as one. | No one today; a latent trap. | Pass the provider's event id (the `x-razorpay-event-id` header) as `eventId`. |
| AM-07 | P3 | `server/paymentWebhooks.ts:79-125`, `chargebeeRoutes.ts:405-595` | Webhook replay safety rests entirely on downstream idempotency keys (correct today). Razorpay deliveries are not deduplicated on the provider event id, so a replayed signed event writes a duplicate activity row. Chargebee events are trusted as delivered rather than re-fetched from the provider. | Someone holding a captured signed delivery (Razorpay) or the webhook credential (Chargebee). Money effect today: none found, because fulfilment and refunds are keyed. | Record the provider event id and acknowledge duplicates before side effects. Optionally re-retrieve a Chargebee event by id before applying a money obligation. |
| AM-08 | P3 | `server/_core/cookies.ts:19`; admin POSTs in `privateReferralRoutes.ts`, `scheduledJobsRoutes.ts` | Admin state-changing POSTs rely on `SameSite=Lax` alone for CSRF. The global urlencoded parser accepts form bodies. Cross-site form POSTs are blocked by Lax, but a same-site origin (any `*.skipwait.me` host) is not. Only the smoke fixture and the password POSTs carry an explicit CSRF/Origin check. | An attacker controlling content on a skipwait.me subdomain, against a signed-in admin. | Apply the existing `isTrustedAuthPost` Origin/JSON check (`server/_core/authPostGuard.ts`) to `/api/admin/*` mutations. |
| AM-09 | P3 | `shared/jobsTick.ts:53-60`, `server/scheduledJobsRoutes.ts:72` | The tick token is derived from `JWT_SECRET`, the session-signing key (documented by design, with a distinct message prefix). A future need to rotate one forces rotating both, and session-key exposure also exposes the tick. | No direct exploit; key-separation hygiene. | When `JWT_SECRET` is next rotated, consider a derived sub-key (HKDF with a jobs label) or a dedicated secret. Owner/CEO call, because the current design is recorded. |
| AM-10 | P3 | `server/healthRoutes.ts:9-18` | The public `/api/health/latency` returns `lowerCaseTableNames` (a database configuration value) and DB timing. This is minor information disclosure. The 30 s cache bounds load. | Anyone. | Drop `lowerCaseTableNames` from the public body, or move the diagnostic behind the admin gate. |

No P0 or P1 item appears in this public table. Rule 1 holds any such item out of it.

## Withheld (rule 1)
The admin sign-in and role-assignment review, and one configuration-dependent webhook path, produced findings that the coordinator received privately. No route, payload or repro is written here. The fix rows come from the CEO (D-223 (4)).

## Confirmed-good controls (for the record)
- No admin or money route takes a user id, role or price from the client as authority.
- Webhook secrets are compared in constant time. Razorpay HMACs the raw bytes before the global JSON parser runs (`server/_core/index.ts:150`).
- Every money-moving writer read here is keyed and idempotent (Chargebee event id / `hosted_page:<id>`, Razorpay order + payment id, refund id).
- Recovery paths never trust the client: provider truth plus an intent match, otherwise review plus alert.
- The tick endpoint is unreachable from the public route, and its header is stripped at the edge.
- Health endpoints carry no personal data and no error text.

## Owner questions (provider and dashboard facts this audit cannot see)
Listed verbatim in the session report to the coordinator. They cover production values of the admin bootstrap, smoke and reviewer flags, PayPal webhook verification configuration, the ledger read token, WorkOS MFA on the admin account, and Razorpay webhook registrations.
