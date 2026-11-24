# ADMIN-activity-log: the admin sees every sign-in, sign-in attempt, request and account action (D-393)

Tier 1 · lane `admin-activity-log` · branch `agent/queue/admin-activity-log` · epic D-212

## Why

Owner, Nov 24 (D-393): "admin should have all logs of people logged in trying to login trying to request and
all". `operationalActivityLogs` and `/admin/activity` (`GET /api/admin/activity`, admin role only) already record
request, claim, review, billing, DM and agent actions, but **no sign-in, sign-in attempt, sign-up or sign-out is
logged at all** (no `auth.*` action exists on `main`), and the page cannot follow one person.

## The build

1. **Log every authentication event** through one helper (`recordAuthEvent`), success and failure, on every
   plane: WorkOS social and password sign-in and callback, sign-up, forgot/reset password, the retired seeker
   email code (410), work-email OTP send and verify (referrers), the in-session work-email step-up, passkeys,
   reviewer demo sign-in, admin sign-in, sign-out and session revocation. Actions are `auth.<event>` with
   outcome `success | failure | denied` and a short reason code (`wrong_password`, `code_expired`,
   `rate_limited`, `not_allowed`, `unknown_account`, …).
2. **Fill the remaining request gaps** so every referral-request transition is in the log: create (already),
   quote refusals, send refusals (cap, coverage changed, job link refused), withdraw, claim, accept, pass,
   decline, referred, lapse, expiry, reconfirm, delivery and hold.
3. **Admin view.** `/admin/activity` gains filters for person (email or id), action family (auth, request,
   billing, account, admin), outcome and date range, plus a per-person timeline (`/admin/users/:id` links to it),
   pagination beyond 250 and CSV export for a filtered range. Admin role only, `Cache-Control: private,
   no-store`, and every admin read of the log is itself logged (`admin.activity_viewed`).
4. **Retention.** A daily job deletes authentication rows older than 90 days.

## Privacy and security (hard limits)

- Never store a password, code, token, cookie, session id, single-use link or full request body.
- A failed attempt for an email with **no** account stores only a masked email (`a***@gmail.com`) and an HMAC
  of it (keyed by `JWT_SECRET`) so repeated attempts group together; an existing account's attempts store its
  user id.
- IP addresses are stored truncated (IPv4 /24, IPv6 /48) plus a coarse country from the edge, never the full
  address; user agent is reduced to browser family, OS family and device type.
- Sentry and server logs keep their current scrubbing; nothing here is sent to a third party.
- The privacy policy is owner-controlled legal text (AGENTS.md): this row changes none of it and lists, in the
  pull request, the sentence the owner may want to add about security sign-in logs and their 90-day retention.

**Read before writing:** `server/_core/workosAuth.ts`, `server/_core/otpLogin.ts`, `server/workEmailOtp.ts`,
`server/_core/reviewerLogin.ts`, `server/_core/sdk.ts`, the passkey routes, `server/privateReferralRoutes.ts`
(`/api/admin/activity`), `client/src/pages/` admin activity and users pages, `drizzle/schema.ts`
(`operationalActivityLogs`; a new index or column needs its own forward-only migration row first).

## Tests (red first)

One test per sign-in plane for success and failure rows; no secret ever appears in `metadata`; unknown-email
masking and grouping; IP truncation; admin-only access (403 for seeker, referrer and signed-out); filters,
per-person timeline and export scoped to the filter; the retention job deletes only auth rows older than 90
days; viewing is logged.

## Acceptance

Focused tests, `pnpm check`, required CI, captures of `/admin/activity` at 1280 and 390 with synthetic data. On
the deployed exact SHA: a demo sign-in, a wrong-password attempt and a demo request each appear within a
minute in `/admin/activity`, filtered to that person.

## Status

- ADMIN-activity-log: in progress — Claude Code · 695b — 2026-11-24 — branch agent/queue/admin-activity-log
