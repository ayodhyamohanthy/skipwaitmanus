# AUTH-workos-refresh-scope: the client asks WorkOS to refresh only a session WorkOS issued (D-389)

Tier 1 (sign-in) · lane `auth-workos-refresh` · branch `agent/queue/auth-workos-refresh-scope` · epic D-212

## The defect, measured

Signed-in Live QA run [45372954261](https://github.com/ayodhyamohanthy/skipwaitmanus/actions/runs/45372954261)
(release web `16f2a2be`, API `ba99d626`) recorded exactly one client error on all 38 captures:
`400 POST https://api.workos.com/user_management/authenticate`. Signed out, `/`, `/plans` and `/sign-in`
make no such call (also checked locally on Nov 24). The demo accounts sign in through the reviewer endpoint,
which sets the server `app_session_id` cookie; there is no WorkOS session, so the AuthKit client's token
refresh is refused. Pages still render, but every such session logs an error, and the same path may run for
other cookie-only sessions (work-email OTP referrers, seeker email code, password, passkey).

## The fix

1. In `client/src/_core/auth.tsx`, attempt a WorkOS token refresh (`getAccessToken` / the provider's
   refresh) only when the current session came from WorkOS. Decide this from data the client already has
   (read how `REL-plans-signed-out-token` avoided the signed-out token call and follow that precedent); do
   not add a new server endpoint unless the existing session payload cannot tell, and if it cannot, stop
   and report with what is missing.
2. Unchanged: every sign-in method, the login rule (D-030, D-049, D-057, D-245), session lifetime, server
   auth, `AuthKitErrorDowngrade`. `client/src/pages/loginRule.test.tsx` and `signIn.test.tsx` must pass
   untouched.

## Tests (red first)

`client/src/_core/authCompat.test.ts` or a new `client/src/_core/authRefreshScope.test.tsx`: a cookie-only
signed-in session makes no WorkOS refresh call; a WorkOS session still refreshes; signed out makes none.

## Acceptance

Focused tests, the login-rule pins and `pnpm check` green; required CI green. After release, a signed-in
Live QA run shows zero `api.workos.com/user_management/authenticate` 4xx entries (link it in Status).

## Status

- AUTH-workos-refresh-scope: in progress — DeepSeek V4.1 Flash · f2a2 — 2026-11-24 — branch agent/queue/auth-workos-refresh-scope
