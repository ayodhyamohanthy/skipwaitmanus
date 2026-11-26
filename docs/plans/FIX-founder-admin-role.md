# FIX-founder-admin-role (D-400)

Owner reports, Nov 26 2026: `/admin/catalog-sync` refused the owner, and Google sign-in ended at "Authentication
could not be completed" (alert: 502 on `GET /api/auth/workos/callback`, 350 ms).

## Findings

1. `resolveLoginIdentity` (`server/db.ts`) applies `resolveSyncedUserRole` only when it creates a new account. A
   returning sign-in (known provider alias, or an existing account linked by verified email) keeps the stored role.
   An account for `ayodhya@skipwait.me` created before D-400 (Nov 25) therefore stays `user`, and every admin route
   (`identity.account.role === "admin"`) refuses it. D-400 says the founder is always the super administrator.
2. The callback's 502 hides which stage failed (`authenticate`, `standing`, `resolve`, `session`); the stage and error
   name are logged and alerted without them, so the owner cannot report anything actionable.

## Contract

1. On every sign-in through `resolveLoginIdentity`, when the provider attests the email is verified and
   `isAdministratorEmail(email)` (founder or configured seat, `server/_core/adminIdentity.ts`), the resolved account's
   role becomes `admin` if it is not already. Promote only: never demote, never on an unverified email, never by a
   name or configured value other than `adminIdentity.ts`. The returned account carries the new role.
2. The callback 502 text adds `(step <stage>, <ErrorName>)`; never the message, email, code or token. The correlation
   id and server log stay as they are.

## Tests (red first)

`server/founderAdminRole.test.ts`: a returning founder alias whose account role is `user` is resolved as `admin` and
the row is updated; an unverified founder email is not promoted; a non-administrator email keeps `user`; an `admin`
account is never demoted. `server/_core/workosCallbackDiagnostic.test.ts`: a failing `authenticateWithCode` answers 502
with the stage and error name and no email or message.

## Status

- FIX-founder-admin-role: in progress — Claude Code · 530c — 2026-11-26 — branch agent/queue/fix-founder-admin-role. Red first: `server/founderAdminRole.test.ts` (2 of 5 failed on main) and the 502 step test in `server/_core/workosAuth.test.ts`; 9 sign-in suites (122 tests) and `tsc` pass.
