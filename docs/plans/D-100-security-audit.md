# Packet D-100: security, availability and payments hardening, as subtasks (D-100, D-223)

> Read [`docs/BRIEF.md`](../BRIEF.md) first. Written by Claude Code as CEO (D-085, D-109) on Oct 23 2026 and re-verified against `main` `53155fde` on Oct 27. It splits D-100 into rows that one agent each can finish alone (D-223). The picker hands out one row at a time; do only the row it prints. The register (`docs/DECISIONS.md`) wins any conflict.

## Rules for every row here
1. **The repository is public.** Never write an unfixed, exploitable finding into a file, commit message, pull request, review comment or `--report` note: no route, payload, token shape or repro. Open a draft GitHub security advisory for it (`gh api -X POST repos/ayodhyamohanthy/skipwaitmanus/security-advisories ...`). If you cannot, report `--report blocked --note "security finding, details held for the CEO"` and nothing else. A finding that is already fixed, or is hygiene with no exploit path, may be written out in full.
2. **Audits are read-only.** An audit row changes exactly one file, its report under `docs/reviews/`. Its findings come back to the CEO, who adds the fix rows (D-223 (4)).
3. **Fixes land dark or behaviour-preserving.** Each switch is a constant in code that starts `false`, and a later row turns it on (D-097, D-223 (3)). Red-first tests; land through a protected pull request on green required CI (D-082, D-200). A Tier 1 row also gets an independent review by a model that neither built nor fixed it (D-151).
4. **No real money.** Use test modes and fixtures only (`docs/PAYMENTS_TEST_RUNBOOK.md`). Never add a Razorpay or PayPal API key: provider credentials are the owner's.

## Already on `main` (no row)
- **Dependency overrides:** `follow-redirects >=1.16.1` and `katex >=0.18.2` (`package.json:142-143`).
- **HSTS:** six months with `includeSubDomains`, on secure requests only (`server/securityHeaders.ts:6`, `:17-19`). Preload is not set.
- **Report-only CSP:** `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'` (`server/securityHeaders.ts:15`). It names no report address, so the planned report-only week collects nothing yet. `D-100.csp-report` fixes that.
- **Uptime watch:** `.github/workflows/api-health-watch.yml`. Every 5 minutes, three tries 20 seconds apart, then one "API DOWN" issue, which GitHub emails to the owner. The iMessage leg has no API and is an owner item below.

## D-100.csp-report: the report-only CSP collects violations (Tier 2, lane `security-headers`, after FND-4)
**Why.** A report-only policy with no report address tells nobody anything, so "enforce after a report-only week" has no data to decide from.
**What.** Red first in `server/securityHeaders.test.ts` and a new `server/cspReport.test.ts`, then:
1. The report-only header gains `report-uri /api/csp-report`.
2. `POST /api/csp-report` is answered inside `globalSecurityHeaders` (through a handler in `server/cspReport.ts`), which `server/_core/index.ts:146` already mounts before every body parser (`:171` on). So no row edits `index.ts`, and the handler reads the raw body itself. It accepts `application/csp-report` and `application/reports+json` up to 8 KB, answers 204, 413 when larger and 400 when malformed. It sets no cookie and needs no session.
3. Before anything is logged, it strips the query string and fragment from `document-uri` and `blocked-uri` with FND-4's shared scrubber (planned as `shared/telemetryScrub.ts`; use whatever file FND-4 lands).
4. It counts by effective directive and blocked host, and sends one scrubbed Sentry message per pair per UTC day. Nothing else is stored.

**Owns:** `server/securityHeaders.ts`, `server/securityHeaders.test.ts`, `server/cspReport.ts`, `server/cspReport.test.ts`.
**Done:** red-first tests, full gate, landed; one real report seen on the preview (log line or Sentry event, with no query string in it).

## D-100.csp-enforce: an enforcing CSP behind a switch (Tier 2, lane `security-csp`, after D-100.csp-report)
**What.** Add `CSP_ENFORCED = false` in `server/securityHeaders.ts`. When it is true, the same policy is also sent as `Content-Security-Policy`, plus each source the live app needs, named explicitly. Never add `'unsafe-inline'` for scripts; use a nonce or a hash if one is needed. Report-only stays.
- Tests: off sends only report-only; on sends both; the policy has no `unsafe-inline` in `script-src`.
- Owns: `server/securityHeaders.ts`, `server/securityHeaders.test.ts`.

## D-100.csp-release: switch the CSP on (Tier 2, lane `security-csp-release`, after D-100.csp-enforce)
**What.** A one-line pull request sets `CSP_ENFORCED = true`. It may open only after `D-100.csp-report` has been live for 7 days. The pull request attaches the week's summary (directive, blocked host, count; no URLs with queries) and 1280/390 captures of `/`, `/explore`, `/ask`, `/queue` and `/plans` on the preview with no console CSP error. CEO sign-off before landing (D-223 (3)). Rollback is setting the constant back to false.
**Owns:** `server/securityHeaders.ts`.

## D-100.hsts-preload: HSTS preload built, left off (Tier 2, lane `security-hsts`, after D-100.csp-release)
**What.** Add `HSTS_PRELOAD = false`. When it is true, the header becomes `max-age=31536000; includeSubDomains; preload`.
- Tests: false keeps today's header exactly; true gives the preload form; plain http still gets no header.
- Turning it on, and submitting the domain to the preload list, is the owner's word, because it is hard to undo for months and binds every subdomain (owner items below).

**Owns:** `server/securityHeaders.ts`, `server/securityHeaders.test.ts`.

## D-100.otp-hmac: the work-email code is stored as an HMAC (Tier 1, lane `security-otp`, after FIX-device-signin, which edits the same file)
**Why.** `hashCode` (`server/workEmailOtp.ts:50`) is SHA-256 of `email:code`. A six-digit code has a million values, so anyone holding a database row can recover the code offline.
**What.** Red first in `server/workEmailOtp.test.ts`:
1. `hashCode` becomes HMAC-SHA256 under a key derived like `workEmailFingerprintSecret` (`server/workEmailKey.ts:20-23`), with its own prefix `work-email-otp:`: `WORK_EMAIL_HMAC_KEY` when it is set, otherwise derived from `JWT_SECRET`. The output keeps the same 64-hex width, so no migration is needed.
2. Verifying (`:142-143`) accepts the HMAC. It also accepts the old SHA-256 only for rows created before `OTP_HMAC_SINCE`, an ISO time set in the landing commit. Codes live 10 minutes (`CODE_TTL_MS`, `:19`), so the old form dies on its own; a later row may remove that branch.
3. Attempts, lockouts and limits are unchanged.

- Tests: a stored hash is not SHA-256 of `email:code`; the right code verifies; a legacy row before the cutoff verifies; a legacy-form hash after the cutoff fails; the wrong code still counts an attempt.
- Owns: `server/workEmailOtp.ts`, `server/workEmailOtp.test.ts`.
- Done: also an independent review by another model (D-151).

## D-100.provider-recon: the daily money check compares the provider's payments with ours (Tier 1, lane `security-recon`, after REL-webhook-auth-alarm, which also edits `server/dailyMoneyCheck.ts`)
**What.** The check stays read-only.
1. Add `listRecentTransactions(credentials, { since })` to `server/chargebeeAccountApi.ts`: successful payment transactions from the last 2 days, on each configured site (INR and USD).
2. In `server/dailyMoneyCheck.ts`, add two finding lines:
   - "provider payment with no payment row": a captured Chargebee transaction we never recorded;
   - "credited payment with no provider transaction": a payment we credited that the provider does not list.
3. The check writes nothing.
4. Stop and report if the transaction list lacks the field needed to match a row. Never add a gateway key.

- Tests (fixtures only): both findings fire, matched rows stay silent, and a provider error is reported as "unverified", never as "not paid".
- Owns: `server/chargebeeAccountApi.ts`, `server/dailyMoneyCheck.ts`, `server/dailyMoneyCheck.test.ts`.
- Done: also an independent review by another model.

## The four read-only audits (Tier 3, rule 1 binds)
Each audit writes one report: a findings table with ID, file:line, what can go wrong, who could do it, severity P0-P3, and the suggested fix. For each route it reads: who may call it, the ownership or company-scope predicate, the personal data in its response, its rate limit, and the input checks at its edge. P0 and P1 go privately (rule 1). The report's pull request names the `main` SHA it read.
- **D-100.secrets-sweep** (lane `security-audit-secrets`). Every log line, Sentry capture, alert email (`server/errorAlerting.ts`), analytics event and error body: does any carry a secret, token, code, cookie, auth header, email body or resume content? FND-4 already fixes single-use tokens in API paths, so do not re-report those. Owns `docs/reviews/D-100-secrets-sweep.md`.
- **D-100.authz-referral** (lane `security-audit-referral`). Covers `server/privateReferralRoutes.ts`, `server/askDraftRoutes.ts`, `server/blocksRoutes.ts`, `server/safetyRoutes.ts` and `server/referrerDocumentAccess.ts`. Owns `docs/reviews/D-100-authz-referral.md`.
- **D-100.authz-account** (lane `security-audit-account`). Covers `server/profileRoutes.ts`, `dmRoutes.ts`, `followRoutes.ts`, `employerRoutes.ts`, `companyClaimRoutes.ts`, `companyDirectoryRoutes.ts`, `jobLinkPreviewRoutes.ts` (outbound fetches), `jobCatalogRoutes.ts`, `impactCardRoutes.ts`, `passwordResetRoutes.ts`, `oauthRoutes.ts`, `seekerAgentRoutes.ts`, `skippieSeekerRoutes.ts`, `assistantRoutes.ts`, `mcpRoutes.ts`, `sitemapRoutes.ts` and `plansCatalogRoutes.ts`. Owns `docs/reviews/D-100-authz-account.md`.
- **D-100.authz-admin-money** (lane `security-audit-admin`). Covers `server/chargebeeRoutes.ts` and the payment webhooks, `server/adminCatalogSyncRoutes.ts`, `server/scheduledJobsRoutes.ts`, `server/healthRoutes.ts`, the admin procedures in `server/routers.ts`, and the admin sign-in in `server/_core/workosAuth.ts`. Owns `docs/reviews/D-100-authz-admin-money.md`.

## Owner items (not rows; asked one at a time in the weekly owner review, D-064)
- The production database backup setting.
- Confirm that the Razorpay and PayPal webhooks reach Chargebee.
- Approve saving a production schema dump for the baseline migration.
- Turn HSTS preload on and submit the domain.
- Choose an iMessage alert channel, for example a Shortcut on the owner's phone; GitHub's issue email already covers email.
- Approve any real test payment.

## Status
One line per row, `<id>: in progress — <who> — <date> — branch <b>` when it starts and `<id>: done — <sha>` when it is live (D-134).
- D-100.csp-report: in progress — Hark · d3f2 — 2026-10-30 — branch agent/queue/d100-csp-report
