# Hardening plan (D-100, PR #283 / PR #297)

Owner direction, Oct 16: "make sure no security issues are there, no vulnerabilities are there, and basic works well, and also load testing is done."
Pricing and monetization doctrine (AGENTS.md): "Never choose money-spending options" (D-031). Always prefer built-in / free services.

## Scope
1. **CSP**: enforce Content-Security-Policy on web and API.
2. **HSTS**: `max-age=63072000; includeSubDomains; preload`.
3. **Cookie security**: `Secure; HttpOnly; SameSite=Lax`.
4. **Rate limiting**: API-wide, strict on `/api/trpc/auth.*`, `/api/chargebee/*`, `/api/stripe/*`, `/api/webhooks/*`.
5. **Secrets & env hygiene**: zero plaintext keys in code or repo history.
6. **SQL injection**: all queries via Drizzle / parameterized SQL.
7. **SSRF**: already hardened (`shared/urlValidation.ts`); verify coverage on all user-supplied URL inputs.
8. **Dependency audit**: `pnpm audit` clean, dependabot enabled.
9. **Load & sanity testing**: synthetic traffic run against staging / preview.
10. **Automated recovery / watchdog**: Cloudflare Worker external watchdog (D-212).

## Non-goals (keep it free)
- No paid security scanners, no Snyk paid tier, no Cloudflare Enterprise WAF.
- Use free GitHub CodeQL, `pnpm audit`, Cloudflare free-tier WAF rules, and in-app middleware.

## The rules
1. **Security findings are confidential until fixed.** An exploitable vulnerability found during this plan is reported to the CEO immediately and is NOT published in a commit message, PR title, or public doc until a fix is deployed to `main`.
2. **Subtasks, not whole priorities (D-223).** Each row has its own branch, lane, and `owns`. Land behaviour-preserving or behind a switch that starts `false`.
3. **No money-spending tools (D-031).** Use built-in or free platforms only.
4. **Basics always work (D-019).** Hardening must never break valid sign-in, payments, webhooks, or the referral state machine.

## Subtasks
| ID | Title | Tier | Lane | Owns | Depends on | Switch |
|---|---|---|---|---|---|---|
| D-100-security-audit | Read-only security audit of auth, money, session, cookies, CSP, rate limits | 3 | security | `docs/plans/D-100-security-audit.md`, `docs/reviews/D-100-security-audit.md` | none | n/a |
| D-100.csp-report | Add `report-uri /api/csp-report` to `CSP_REPORT_ONLY`; scrubbed violation logger | 2 | security-headers | `server/securityHeaders.ts`, `server/securityHeaders.test.ts`, `server/cspReport.ts`, `server/cspReport.test.ts` | FND-4 | n/a |
| D-100.csp-enforce | Switch CSP to enforce mode (`Content-Security-Policy`) after 7-day report period | 2 | security-headers | `server/securityHeaders.ts`, `server/securityHeaders.test.ts` | D-100.csp-report | `CSP_ENFORCED = false` |
| D-100.csp-release | Release CSP enforcement: flip switch to `true` | 2 | security-headers | `server/securityHeaders.ts`, `server/securityHeaders.test.ts` | D-100.csp-enforce | `CSP_ENFORCED = true` |
| D-100.hsts-preload | Add `preload` to `Strict-Transport-Security` header | 2 | security-headers | `server/securityHeaders.ts`, `server/securityHeaders.test.ts` | none | `HSTS_PRELOAD = false` |
| D-100.otp-hmac | HMAC-SHA256 hash work-email OTP codes; delete plaintext fallback | 1 | security-auth | `server/_core/workosAuth.ts`, `server/_core/workosAuth.test.ts` | none | `OTP_HMAC_SINCE` |
| D-100.provider-recon | Daily Chargebee payment reconciliation (read-only daily check) | 1 | payments-ops | `server/dailyMoneyCheck.ts`, `server/dailyMoneyCheck.test.ts` | D-065-C | `PROVIDER_RECON_ENABLED = false` |
| D-100.secrets-sweep | Read-only secrets sweep: logs, Sentry, alerts, analytics, error bodies | 3 | security-audit-secrets | `docs/reviews/D-100-secrets-sweep.md` | none | n/a |
| D-100.authz-referral | Read-only referral route authorization audit | 3 | security-audit-referral | `docs/reviews/D-100-authz-referral.md` | none | n/a |
| D-100.authz-account | Read-only account route authorization audit | 3 | security-audit-account | `docs/reviews/D-100-authz-account.md` | none | n/a |
| D-100.authz-admin-money | Read-only admin and money route authorization audit | 3 | security-audit-admin | `docs/reviews/D-100-authz-admin-money.md` | none | n/a |

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
- D-100.csp-report: done — ea9fb526 — Hark · d3f2 / Gemini 2.5 · 8b1c — 2026-11-01 — report-only CSP with report-uri /api/csp-report and scrubbed violation endpoint; scope check clean; CI green.
- D-100.csp-enforce: in progress — Hark · 6d81 — 2026-10-31 — branch agent/queue/d100-csp-enforce
- D-100.authz-account: waits for the owner — D-260 — audit delivered on PR #889 (`1012897c`, CI green, 13 published findings); one finding withheld under rule 1 and parked for the owner.
- D-100.secrets-sweep: done — ac8d6986 — Antigravity · 6171 — 2026-10-31 — read-only audit report of secrets/tokens in logs/Sentry (no P0/P1; 4 P2, 8 P3); scope check clean; CI green.
- D-100.authz-referral: done — 28e1b40a — Antigravity · 6171 — 2026-10-31 — read-only audit of referral, document, block and safety routes (8 P3 findings published; H-1 withheld per rule 1); scope check clean; CI green.
