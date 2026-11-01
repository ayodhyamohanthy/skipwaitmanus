# Packet FIX-device-signin: sign-in on a returning device

> Owner report (Oct 25 2026, Claude Code session): device-based sign-ins are not populating. The owner then picked three causes: saved emails don't appear, the emailed code doesn't autofill, and there is no Face ID, passkey or Apple option. This row fixes the first two. The third adds a sign-in method, which changes the login rule (D-030, D-049); it is the owner's call and is not part of this row.

| Field | Value |
|---|---|
| Row | `FIX-device-signin` (Tier 1, sign-in surface; lane `auth-device`) |
| Branch / PR | `agent/queue/fix-device-signin` (built by Claude Code · 6029) |
| Decisions | D-019 (basics always work), D-030/D-049/D-057 (login rule unchanged), D-172/D-209 (the device-saved build is its own row), D-200 (Tier 1 gets one review by a model other than the builder's) |

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

## Status
- `FIX-device-signin`: built on `agent/queue/fix-device-signin` (`ef08e168`), independent PASS by GPT · 2a58 (review marker `084577f9`) on head `9237ac4e` with green required CI. **D-209 (Oct 26) cleared Cue GPT · 8176's scope block:** this row keeps the remembered email and the code autofill and adds no sign-in method, the login rule is untouched, and the passkey/biometric/Google-prompt ask the owner made is row `DEVICE-SIGNIN-passkeys` (`docs/plans/DEVICE-SIGNIN-passkeys.md`). Landing: merge `main` up, fresh green required CI on the merged head, merge-commit. The two owner login-rule questions (referrer passkey, Sign in with Apple) are in `docs/DECISIONS.md` under Open owner questions.
- **D-272 (2026-11-01):** the row is recorded done and live — PR #655 merged `059ef908`, PASS `084577f9` by GPT · 2a58 on head `9237ac4e` (an ancestor of `main`), 40/40 focused green. The board closure rides `agent/queue/fix-device-signin` as one ordinary Tier 1 pull request: record `status: "done"` and rewrite the `scripts/nextTask.test.ts:47-62` first-pick pin as a structural property (D-149's first-four order pin stays). Do not rebuild; the closure head still takes one independent review before landing.
