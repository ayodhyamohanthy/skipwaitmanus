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
- **D-273 (2026-11-01):** the row stays `todo` and records why nothing can close it yet. PR #952 (head `48eb44df`, D-272 leg (b)) is red only at the review gate — `unit + component + route tests`, `production build` and `e2e journeys` are all green on that head — and the pass the gate needs cannot be issued: `scripts/nextTaskCore.mjs:573-584` returns `fix` or `green` for every red CI and reaches `review` only below that guard (`:586-592`), so the picker's "then it is reviewed again" cannot happen, and `scripts/next-task.mjs:323-325` accepts a verdict only from a session already holding the lock at stage `in-review`. D-272 (4)'s "ordinary Tier 1 route" is corrected. Parking the row at `owner` is also unavailable: the `:47-62` pin asserts the live first pick is this row, so any status other than `todo` fails the required unit job (measured on this ruling's own first head `5e31a380`). The deliverable is complete and lands unchanged once the D-254 answer opens a review route; nothing is rebuilt, and a session that cannot finish it should use the picker's `--avoid FIX-device-signin` fall-through.
- **D-286 (2026-11-05):** the deadlock is re-measured on this row's own head (PR #952 `76969eb7`, run `41986076200`: `typecheck` fails only at `review-gate: … no independent passing review … stands at "Fixed", not a pass`; unit + component + route, production build, e2e journeys and Workers Builds green) and a second row joined it the same day (`D-048-p3-admin-money`, PR #986 `dad31bcf`, run `41982060943`). The cure D-254 and D-273 withheld behind the Oct 31 "new rows paused" restriction is registered now, because the November 2 provenance correction records that pause as the coordinator's recommendation rather than the owner's, and three rows were registered on November 2 anyway (`SUPPORT-A`, `CONV-report-entry`, `GATE-migration-cleanup`). New row `PICKER-gate-red-review-route` (`docs/plans/PICKER-gate-red-review-route.md`) builds the picker stage that hands REVIEW to a Tier 1 head red only at its own gate. This row stays `todo` and is not rebuilt: the `scripts/nextTask.test.ts:47-62` first-pick pin still freezes the registry head (D-273 (5)), so parking it would move the first pick and fail the required unit job. Nothing is waived, and PR #952 still needs its independent pass by a model that neither built nor fixed it, then green required CI on that head, before it lands.
