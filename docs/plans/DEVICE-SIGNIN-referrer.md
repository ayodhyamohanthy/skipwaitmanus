# DEVICE-SIGNIN seeker release and referrer passkeys (D-408)

Owner, Nov 26 2026 (D-408): "passkeys seekers and referrers can have but referrers should be work email".

## DEVICE-SIGNIN-seeker-release (Tier 1)

The seeker passkey build is on main (PR #697, `server/_core/passkeyLogin.ts`, `PASSKEY_SIGNIN_ENABLED = false`).
1. Verify on a real phone (iOS Safari or Android Chrome) and a laptop (Chrome or Safari) against a non-production or
   the production origin with the switch forced on in a preview: register a passkey after a normal seeker sign-in,
   sign out, sign in with the passkey (browser sheet and autofill), remove it from the management list.
2. Set `PASSKEY_SIGNIN_ENABLED = true`; land on green required CI; prove on skipwait.me with captures at 1280 and 390.
3. Referrer openIds stay refused by the seeker routes until `DEVICE-SIGNIN-referrer-passkeys` releases.

## DEVICE-SIGNIN-referrer-passkeys (Tier 1, own switch, starts off)

1. Enrollment only in a session whose sign-in was the work-email code (`amr: work_email_otp`) for a `workemail_<email>`
   account; refused for any other session.
2. Passkey sign-in resolves only to that work-email account and mints a session with `amr: passkey` on it.
3. Valid only while the account's work email was verified within the last 30 days (`profiles.workEmailVerifiedAt`);
   otherwise the passkey answer is "Enter your work-email code to continue" and the code renews the window.
   The 90-day re-verification sweep and suspension apply as today.
4. Referrer surfaces (`/sign-in` Give a referral, `/referrer-setup`, `/referrer-home`, `/verify`) show "Use a passkey"
   beside the work-email code, never personal email, social login or password. No Apple.
5. Tests first: refusal outside a work-email-code session, cross-account refusal, 30-day expiry, suspension,
   `loginRule.test.tsx`/`signIn.test.tsx` pins updated for D-408 only.

## Status

- DEVICE-SIGNIN-seeker-release: todo — registered by Claude Code · 530c, Nov 26 2026 (D-408).
- DEVICE-SIGNIN-referrer-passkeys: todo — registered by Claude Code · 530c, Nov 26 2026 (D-408).
