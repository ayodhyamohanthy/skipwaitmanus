# Packet FIX-device-signin: sign-in on a returning device

> Owner report (Oct 25 2026, Claude Code session): device-based sign-ins are not populating. The owner then picked three causes: saved emails don't appear, the emailed code doesn't autofill, and there is no Face ID, passkey or Apple option. This row fixes the first two. The third adds a sign-in method, which changes the login rule (D-030, D-049); it is the owner's call and is not part of this row.

| Field | Value |
|---|---|
| Row | `FIX-device-signin` (Tier 1, sign-in surface; lane `auth-device`) |
| Branch / PR | `agent/queue/fix-device-signin` (built by Claude Code · 6029) |
| Decisions | D-019 (basics always work), D-030/D-049/D-057 (login rule unchanged), D-200 (Tier 1 gets one review by a model other than the builder's) |

## Cause
- Sign-in is passwordless (an emailed six-digit code), so the phone's password manager never saves a skipwait.me login and has nothing to suggest. The live email field is already marked `autocomplete="email"` in a real form.
- The code field had `autocomplete="one-time-code"`, but it did not open focused, and the email subject did not carry the code.

## Change
- `client/src/lib/rememberedSignInEmail.ts`:
  - the email that last signed in on this device is stored after a code verifies;
  - seekers and referrers use separate keys;
  - storage failures are silent;
  - a non-email value is ignored.
- `SeekerSignIn.tsx` and `ReferrerOtpSignIn.tsx`:
  - prefill that email, with a "Not you? Forget this email" link;
  - the code field opens focused, with `pattern="[0-9]*"` and `maxLength=6`.
- `server/workEmailOtp.ts`: `otpEmailMessage(code)`, whose subject leads with the code ("123456 is your skipwait.me verification code").
- No change to who may sign in how; the referrer path stays work-email code only.

## Accept
- `client/src/components/deviceSignIn.test.tsx` passes (11 tests), and `otpEmailMessage` is pinned in `server/workEmailOtp.test.ts`.
- The login-rule pins (`loginRule.test.tsx`, `signIn.test.tsx`, `GoalSignIn.test.tsx`) and the OTP route tests stay green.
- `pnpm check`, the design-token audit and required CI are green on the exact head.
- One independent review by a model other than Claude.
- After deploy: on a phone, sign in once, then reopen `/sign-in`; the email is prefilled. The next code email shows the code in its subject.

## Scope ruling (D-209, Oct 26)
- Cue GPT · 8176 held this row on one question: does #655 stop at the remembered email and the emailed code's autofill, or expand into Face ID, passkeys and Google's device prompts; and does the work-email code stay the referrer's sign-in, and is Sign in with Apple excluded?
- D-209 answers it from the frozen login rule, so nothing here changes an owner decision:
  - #655 does not expand. Its six changed files are exactly the ones section "Change" lists, all inside the row's `owns`.
  - Referrer sign-in stays the work-email code on every visit (D-030, D-049, D-057); the `ReferrerOtpSignIn.tsx` change is +6/-2, an address prefill and a focused code field.
  - Sign in with Apple is excluded, and passkeys, biometrics and Google's device prompts are out of scope, because each adds a sign-in method. `SOCIAL_PROVIDERS` (`server/_core/workosAuth.ts:212`) offers google, microsoft, github, linkedin and slack, and the comment above it records that Apple is not enabled in the WorkOS dashboard (404).
  - The owner's third cause (a Face ID, passkey or Apple option) therefore stays a separate, owner-reserved question (D-123); this row does not carry it.
- Nothing else blocks the row: PR #655 is open, not a draft and mergeable; head `9237ac4e` has typecheck, unit + component + route tests, production build and Workers Builds green; `main` CI is green on `927dfaca`. The branch is behind `main`, so the landing runs on the merge result (D-082).

## Status
- `FIX-device-signin`: built on `agent/queue/fix-device-signin` (`ef08e168`); D-209 cleared the scope question, so the row is `in-review`: one independent Tier 1 review by a model other than Claude Code · 6029 (the builder), then a landing by a session that neither built nor fixed it.
