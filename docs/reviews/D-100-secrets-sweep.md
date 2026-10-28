# D-100.secrets-sweep: secrets, tokens and personal data in logs, Sentry, alerts, analytics and error bodies

> Tier 3 read-only audit (packet `docs/plans/D-100-security-audit.md`, rule 1 and rule 2 bind).
> Read on `main` `86559ba7`, 2026-10-28, on branch `claude/wizardly-einstein-8y9f1q`.
> Author: a Claude Code session, reasoning only (D-225). This file is the only change; no code was touched.

## 1. Scope and method

The packet's question: does any log line, Sentry capture, alert email (`server/errorAlerting.ts`),
analytics event or error body carry a secret, token, code, cookie, auth header, email body or
resume content?

What was read:
- Every `console.*` call in `server/`, `src/` and `shared/` (97 call sites, tests excluded).
- Every `captureServerError` and Sentry call (40 call sites), plus `server/sentry.ts` and
  `client/src/lib/sentry.ts` against the installed `@sentry/node` and `@sentry/browser` 10.75.0 defaults.
- Every alert builder in `server/errorAlerting.ts`, and the `recordOperationalActivity` metadata
  written next to them.
- Error bodies: Express handlers, the `/api` driver-message wrapper (`server/privateReferralRoutes.ts:203-219`),
  the tRPC setup (`server/_core/trpc.ts`), the MCP tool errors, and provider passthrough
  (Chargebee, WorkOS, ZeptoMail, Razorpay, PayPal, storage, model router).
- Client telemetry: Clarity (`client/src/lib/clarity.ts`, `CookieConsent.tsx`), the client Sentry setup,
  `client/src/lib/apiResponse.ts` and client console calls.

Claims about SDK defaults were checked in `node_modules` source. One claim was also reproduced
with a local probe that used the repo's installed packages and wrote nothing to the repo.

**Not re-reported (FND-4 owns them, packet rule):**
- Token path segments in API routes, in server Sentry paths and alert routes.
- `client/src/lib/apiResponse.ts` sending API token paths in `extra.url`.
- The browser-route scrubber.

`server/errorAlerting.ts` already strips the query from alert routes (`normalizedPath`, `:30-33`).

## 2. Findings held privately (packet rule 1)

These four findings are unfixed and exploitable or credential-bearing, so they are held privately.
This repository is public, so no route, payload, token shape or repro appears here. The rule 1
channel, a draft GitHub security advisory, could not be opened from this session: the
environment's GitHub proxy refused the write with HTTP 403. The details went to the owner
outside the repository, for the CEO to turn into fix rows.

| ID | Severity | Status |
|---|---|---|
| P-1 | P1 | Held for the CEO. Unfixed. |
| P-2 | P1 | Held for the CEO. Unfixed. |
| P-3 | P1 | Held for the CEO. Unfixed. |
| P-4 | P2 | Held for the CEO. Unfixed, depends on configuration. |

## 3. Hygiene findings with no exploit path (written out in full)

| ID | File:line | What can go wrong | Who could see it | Sev. | Suggested fix |
|---|---|---|---|---|---|
| H-1 | `server/_core/trpc.ts:6-8` | `initTRPC...create({ transformer: superjson })` has no `errorFormatter`. tRPC 11 wraps any thrown non-`TRPCError` as `INTERNAL_SERVER_ERROR` and sends its `message`. A drizzle 0.45 `DrizzleQueryError` message is `Failed query: <sql>\nparams: <params>` (`drizzle-orm/errors.js:12`), and procedures in `server/routers.ts` call `db.*` with no catch, for example `profile.save` to `db.saveProfile`. The `/api` wrapper does not help: tRPC writes with `res.end`, not `res.json`. No stack is sent in production (`NODE_ENV=production`, `Dockerfile:13`, `wrangler.jsonc:48`). | The caller only. The params are the caller's own id and input; no path was found that puts another person's data in them. SQL and schema text are exposed. | P2 | Add an `errorFormatter` that replaces the message with the generic server error when the cause is not a `TRPCError`. Red-first test with a thrown `DrizzleQueryError`. |
| H-2 | `server/privateReferralRoutes.ts:214`, `:1664`; `server/companyClaimRoutes.ts:28`; `server/employerRoutes.ts:126`; `server/impactCardRoutes.ts:24`; the `console.error("[Chargebee] ...", error)` sites in `server/chargebeeRoutes.ts` (`:154`-`:583`); `server/db.ts:106`. Sentry: `captureServerError(error, ...)` on database paths, e.g. `server/db.ts:3617`, `:3639`, `:4616`, `:4944`. | Database errors are logged or captured whole, so the drizzle message with its bound params reaches container logs and Sentry. Params can hold personal data: emails, note text, profile fields. `privateReferralRoutes.ts:1657` itself says a driver error "can quote a note", and the next lines still log and capture the full error. The wrapper at `:214` withholds the text from the client but logs 600 characters of it. | Anyone with log or Sentry access. | P2 | One shared `safeErrorForTelemetry(error)` that keeps `name`, the SQL `code`/`errno` and the query text, and drops `params` and `cause` values. Use it at every log or capture site that can carry a database error. |
| H-3 | `server/_core/otpLogin.ts:40` | A failed OTP send logs the ZeptoMail API key length and the sender address. The length narrows a key's format; the address is configuration. | Log readers. | P3 | Log only `result.reason` plus `configured: boolean`. |
| H-4 | `isDriverErrorMessage`, `server/privateReferralRoutes.ts:203-205` | Pool and connection errors from mysql2 (for example "Access denied for user ...", "Too many connections", `ETIMEDOUT`) are raised outside `DrizzleQueryError` (`drizzle-orm/mysql2/session.js:183-184`) and match none of the patterns. Routes that answer `{ error: message }` on a transaction path then return them, for example `privateReferralRoutes.ts:719`, `:831`, `:904`, `:960`, `server/assistantRoutes.ts:55-63` and `server/safetyRoutes.ts:48`. | The caller only, and only while the database is failing. The DB user name and host are exposed. | P3 | Move to an allow list: a 5xx body is always generic unless the error is a known app error class. |
| H-5 | `server/storage.ts:48-49`, `:91-92`, returned by `server/privateReferralRoutes.ts:497`, `:507`, `:515`, `:542`, `:574` | Storage presign or URL failures put the backend's response text into the thrown message, and the upload routes return it. The key is sent in a header and is not echoed. | The uploader only. Provider internals are exposed. | P3 | Keep the status code only in the thrown message. Log the body with a length cap, behind the same safe-error helper as H-2. |
| H-6 | `server/mcpServer.ts:119` | `toolError(error.message.slice(0, 200))` returns raw error text to the agent-token holder, including up to 200 characters of SQL from a drizzle error. | The token holder only. | P3 | A fixed message unless the error is an app error class. |
| H-7 | `server/_core/storageProxy.ts:51`; `server/_core/notification.ts:101` | Upstream response bodies are logged verbatim. | Log readers. | P3 | Log status plus a capped, scrubbed body, or the status only. |
| H-8 | `client/src/lib/clarity.ts`; `client/src/main.tsx:24`; `client/src/components/CookieConsent.tsx:41` | No `data-clarity-mask` exists anywhere in `client/src`, so masking depends on the Clarity dashboard setting (unverified). Under a "Balanced" setting, displayed text such as names, pitches, DM text and file names on `/queue`, `/inbox`, `/messages`, `/profile` and the review views would be recorded. Clarity starts before any consent choice. "Essential only" sets `analytics_Storage: "denied"`, which as understood stops cookies but not recording. Not confirmed against current Microsoft docs. | Microsoft Clarity. | P2 | Engineering: `data-clarity-mask` on personal-data surfaces, or Strict masking. Owner decision (privacy behaviour): do not call `Clarity.init` until "Accept all". |
| H-9 | `client/src/main.tsx:85`, `:93` | `console.error` prints whole tRPC errors. Sentry's default console breadcrumbs then carry them. Today this matters only through H-1 (driver text). | Browser console and Sentry. | P3 | Log `error.data?.code` and a short message. Fixed with H-1. |

## 4. Checked and clean

- **Alert emails** (`server/errorAlerting.ts`):
  - Route errors carry status, method, a path with the query stripped, and duration.
  - Payment, refund, unmatched, retired-plan and card-validation alerts carry provider ids, internal ids, reasons and amounts only.
  - No email body, OTP, resume or secret. The recipients are hard-coded owner mailboxes.
- **Audit metadata:** OTP rows record the email domain only (`server/privateReferralRoutes.ts:659`, `:678`, `:681`); the assistant token row records a prefix.
- **Scheduled jobs:** stored `jobRuns.error` is redacted (`safeJobError`, `server/scheduledJobRunner.ts:45`). The Worker tick log (`src/worker.ts:105`) prints the schema-checked results body (`server/scheduledJobsRoutes.ts:93`).
- **Health:** `/api/health*` never returns `lastError()`, only a state label (`server/healthRoutes.ts:6`, `:19`).
- **Final Express handler:** `sentryErrorMiddleware` hands off to Express's finalhandler, which sends no stack in production.
- **Provider passthrough to clients:**
  - Chargebee checkout and subscription answer fixed text (`server/chargebeeRoutes.ts:156`, `:193`).
  - ZeptoMail and Resend throw a fixed "delivery failed" (`server/emailDelivery.ts:32`, `:55`).
  - Razorpay and PayPal messages carry status codes only.
  - WorkOS callback errors log stage, code and a correlation id (`server/_core/workosAuth.ts:321`, `:330`).
  - The model router falls back to deterministic text.
- **No token, OTP, cookie, auth header, email body, resume content or another person's personal data** was found in any client-facing error body.
- **Client analytics:**
  - Clarity is the only sink: no gtag, PostHog, Plausible, beacon or ingest route.
  - Its two custom events (`ShareImpactCard.tsx:51`) carry no properties.
  - `identifyClarity` sends the internal id, never an email.
  - OAuth `code` and `state` land on the server callback, not an app page.
  - OTP codes travel in POST bodies, never URLs.
  - No client `browserTracingIntegration` or `replayIntegration` is configured, so no client transactions or replays exist.

## 5. Next steps (for the CEO, D-223 (4))

- **Fix rows:** P-1 to P-4 first, from the private details. Then H-1 with H-9, then H-2 with H-4 to H-7 (one shared safe-error helper), then H-3.
- **Overlap:**
  - P-2 and P-3 touch FND-4's client files, so they should follow FND-4 or join it.
  - H-1 and H-2 touch no FND-4 file.
- **Owner items (D-064, one at a time):**
  - Is Sentry's server-side data scrubber on, in both Sentry projects?
  - Which masking mode is Clarity using?
  - Should Clarity wait for "Accept all" (H-8)?
