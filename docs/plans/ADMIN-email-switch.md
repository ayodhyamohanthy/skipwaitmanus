# ADMIN-email-switch: the production administrator is admin@skipwait.me, and alerts reach both owner addresses (D-400)

Tier 1 · lane `admin-email-switch` · branch `agent/queue/admin-email-switch` · epic D-212 · no dependencies

## Why

Owner, Nov 25 2026 (D-400): "set admin as admin@skipwait.me". The mailbox receives mail, and alerts go to both
addresses.

## The build

1. **Administrator.** Set `SKIPWAIT_ADMIN_EMAIL` to `admin@skipwait.me` in `wrangler.jsonc` and `.env.example`, and
   `durableAdministratorEmail` in `server/db.ts` to the same value, so the sign-in gate and the role grant agree. The
   release smoke check and `deploy-api.yml` read `wrangler.jsonc` and follow automatically.
2. **Alerts to both.** Each alert keeps `ayodhya@skipwait.me` as its primary recipient, so delivery success, retry and
   the outbox obligation are unchanged, and adds `admin@skipwait.me` as a best-effort copy:
   - `server/errorAlerting.ts`, `server/dailyMoneyCheck.ts` and `server/dailyOpsCheck.ts` add one copy;
   - `server/billingReviewOutbox.ts`: new envelopes carry both recipients. The envelope schema accepts the one-recipient
     shape too, so a review queued before the deploy still sends, and the ZeptoMail request maps every recipient.
3. **Tests.** Role sync promotes the verified `admin@skipwait.me` and no longer promotes `ayodhya@skipwait.me` on a
   fresh row, but keeps an existing admin role. Each alert sends the primary, then each copy, and a failed copy never
   fails the alert. The billing outbox sends a stored legacy one-recipient envelope and a new two-recipient one.

## Hard limits

No password, hash or token anywhere. No change to seeker or referrer sign-in, to the demo reviewer accounts or to
`REVIEWER_ALLOW_ADMIN`. No database write that demotes an account.

## Acceptance

Focused tests, `pnpm check` and required CI. After the deploy, the owner signs in at
`https://skipwait.me/api/auth/workos/admin?email=admin@skipwait.me` and opens `/admin`; the release smoke check shows
the admin redirect for the new address.

## Status

- ADMIN-email-switch: todo — registered Nov 25 2026 by Claude Code · 43c8 (D-400).
