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

## What landed (Nov 24, Claude Code · 695b)

- **One helper, every plane.** `server/authEvents.ts` (`recordAuthEvent`) writes `auth.<event>` rows: password
  sign-in, sign-up, forgot and reset (including rate-limit and lock refusals), WorkOS social and admin callbacks
  (closed method: google, microsoft, github, linkedin, slack, apple, sso, password, magic_auth, passkey), the
  refused admin entry, sign-out (WorkOS and work-email), the referrer work-email code send and verify (with the
  company domain), the retired seeker email code, passkey sign-in, add and remove, and the demo reviewer sign-in.
  The work-email step-up keeps its existing `work_email.step_up_*` rows (already per account); the admin
  "Sign-in" kind includes them rather than writing them twice.
- **Privacy.** Reasons, methods and planes are closed sets (an unknown reason is stored as `other`); unknown
  fields are dropped. An attempt is attributed to an account only through a verified login alias; otherwise the
  row keeps a masked email and an HMAC key. IPs are /24 or /48, the country is the edge's two-letter code, the
  user agent becomes browser, OS and device. A failed write goes to Sentry and never fails the sign-in.
- **Admin view.** `/admin/activity`: Person (account id or email; an email also finds attempts with no account),
  Kind (sign-in, referral requests, billing, account, admin), Outcome, From, To and the text search; "Load older
  events" pages by id; "Export CSV" downloads the filtered range (at most 5,000 rows; formula cells neutralised);
  "Follow this person" and `?person=` narrow the log and show the person's referral-request history from
  `referralTransitionEvents`, which includes the transitions scheduled jobs make (lapse, expiry, delivery). The
  users page links each account to its activity. Admin only, `private, no-store`; every read and export is logged.
- **Retention.** Daily `auth-activity-retention` deletes the sign-in rows (`AUTH_ACTIONS`) older than 90 days.
- **Request gaps (build step 2).** Route-level request events (created, claimed, accept/decline/pass, referred,
  withdrawn, step back, extend, cap and coverage refusals) were already logged; the job-driven transitions are
  shown from `referralTransitionEvents` in the person view instead of new writes inside the money transactions.
  Quote refusals that answer before any request exists are not logged per attempt.
- **For the owner (legal text is yours, nothing was changed):** a sentence the privacy policy may want: "For
  security, we keep a record of sign-ins and sign-in attempts to your account, including a shortened network
  address, your country, and your browser and device type, for 90 days."

Tests: `server/authEvents.test.ts`, `server/adminActivity.test.ts`, `server/authActivityRetention.test.ts`, and
sign-in event cases in `server/_core/otpLogin.test.ts`, `server/_core/reviewerLogin.test.ts`,
`server/_core/passwordSignIn.test.ts`, `server/_core/workosAuth.test.ts`; the page in
`client/src/pages/goal/admin-ops/activity.goal.test.tsx`.

## Status

- ADMIN-activity-log: done when this pull request lands (Claude Code · 695b, 2026-11-24). Live acceptance after deploy: a demo sign-in, a wrong-password attempt and a demo request each appear in `/admin/activity` filtered to that person.
