# ADMIN-email-switch: the founder is the permanent super administrator, admin@skipwait.me is the administrator, alerts reach both (D-400)

Tier 1 · lane `admin-email-switch` · branch `agent/queue/admin-email-switch` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026 (D-400, FOUNDER-LOCKED): `ayodhya@skipwait.me` (founder) has superior access over every
administrator and can never be removed; `admin@skipwait.me` is the administrator seat, which the founder may hand over
later; both receive alerts.

## The build

1. **One definition, `server/_core/adminIdentity.ts`.** `FOUNDER_SUPER_ADMIN_EMAIL` is fixed in code.
   `administratorEmails()` returns the founder plus `SKIPWAIT_ADMIN_EMAIL`. The admin sign-in route, its callback
   (`adminCallbackAllowed`) and the role grant (`resolveSyncedUserRole`) all ask it. `SKIPWAIT_ADMIN_EMAIL` becomes
   `admin@skipwait.me` in `wrangler.jsonc` and `.env.example`.
2. **Founder protection.** `setUserSuspended` refuses to suspend the founder's account, any other login of the founder's
   canonical person, or a person holding the founder's verified alias (`FounderProtectedError`). The suspend route
   answers 403 "The founder's account cannot be suspended", and the attempt is audited as denied. Lifting a suspension
   stays allowed.
3. **Alerts to both.** Each alert keeps the founder as primary, so delivery success, retry and the outbox obligation are
   unchanged, and adds `admin@skipwait.me` as a best-effort copy (`errorAlerting`, `dailyMoneyCheck`, `dailyOpsCheck`).
   The billing-review outbox sends new envelopes to both, still accepts founder-only envelopes frozen before the deploy,
   and maps every recipient in the ZeptoMail request.

## Tests

- `adminIdentity.test.ts` pins the founder address and checks it survives any `SKIPWAIT_ADMIN_EMAIL`, including a handover.
- Role sync: the founder is always admin, the seat is admin, and a previous seat is not promoted on a fresh row.
- `db.suspendReview.test.ts`: the three founder refusals, and lifting a suspension still works.
- `adminUsers.test.ts`: 403, audited as denied, no suspension recorded.
- Alert call counts and recipients; the outbox legacy and new envelopes.

## Hard limits

No password, hash or token anywhere. No change to seeker or referrer sign-in or the demo reviewer accounts. No database
write that demotes an account.

## Follow-ups (owner)

- Name any action only the founder may take, and it becomes a row.
- A handover leaves the previous seat holder's stored admin role on its row, because sign-in sync never demotes;
  revoking it on handover is its own row.

## Status

- ADMIN-email-switch: done — Claude Code · 43c8 — 2026-11-25 — landed from `agent/queue/admin-email-switch`. Focused suites green (adminIdentity, roleSync, suspendReview, adminUsers, workosAuth, billingReviewOutbox, errorAlerting, paymentAmountMismatch, daily checks); `tsc --noEmit` clean. Live acceptance (owner signs in as admin@skipwait.me) is pending the deploy: UNVERIFIED until then.
