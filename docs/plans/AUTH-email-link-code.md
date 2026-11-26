# AUTH-email-link-code: one email, a sign-in link and a code (D-406)

Owner, Nov 25 2026 (D-406): "any user can just enter email and they get signin link and otp. Removes friction."
Seekers and referrers; seeker passwords and social stay; our own email provider sends link + code.

## Why

Job seekers sign in rarely, so a password is a forgotten secret and the slowest step of sign-up. Entering an
email and tapping a link (or typing the code the phone offers to autofill) is the common pattern for apps people
open occasionally. Security is unchanged: whoever reads the inbox can already reset the password.

## Rows

| Row | Tier | What | Switch |
|---|---|---|---|
| `AUTH-email-link-code` | 1 | Build everything below behind `EMAIL_SIGN_IN_LINK_ENABLED = false` (`shared/emailSignIn.ts`). | off |
| `AUTH-email-link-release` | 1 | Set the switch to `true` after the build lands; live proof at 1280 and 390 with a real inbox. | on |

## Contract (`AUTH-email-link-code`)

1. **One email, code first.** Subject `NNNNNN is your skipwait.me sign-in code` (lock-screen preview and phone
   autofill). Body: the code, then a one-click link, then "If you did not request it, ignore this email". Same
   code store as today (`server/workEmailOtp.ts`): HMAC-hashed code, 10 minutes, single use, attempt cap,
   lockout, per-address, per-IP and global send limits. No new table, column or migration.
2. **Link safety.** Link: `https://skipwait.me/sign-in#email-link&e=<email>&c=<code>&p=<plane>`, with values
   URL-encoded by `URLSearchParams`; `p` is `s` (seeker) or `r` (referrer). The fragment never reaches the server,
   logs or a Referer header. `/sign-in`
   reads it, removes it from the address bar at once (`history.replaceState`), and shows one screen: "Sign in as
   <email>" with one black **Sign in** button. Only that click posts the code, so mail scanners that open links
   spend nothing. Expired, used or malformed: a plain message and "Send a new link" back to the form.
3. **Seekers** (switch on): the seeker form opens on email with **Email me a sign-in link** as the one commit;
   after sending it shows a six-digit code field (`autocomplete="one-time-code"`) plus "We sent a link and a code
   to <email>". "Use a password instead" keeps today's password form (sign in, create account, forgot password);
   social and passkeys stay. `POST /api/auth/workos/email-code/send` sends instead of answering 410 (switch off:
   410 exactly as today). `verify` drops the `SEEKER_CODE_VERIFY_UNTIL` cut-off while the switch is on. A new
   address creates the account on verify (same `resolveLoginIdentity`, verified alias first, never a merge on an
   unverified email). An address whose standing is `referrer_work_email` (D-081) is refused on send and verify
   with the existing "sign in with your work-email code" answer.
4. **Referrers**: `/api/auth/otp/send` and `/verify` are unchanged; with the switch on, the same email also
   carries the link (`p=r`), which posts to `/api/auth/otp/verify`. Referrer surfaces show no personal email,
   social or password (D-030/D-057/D-081). The D-245 step-up email and flow are untouched.
5. **Activity log**: existing `auth.seeker_email_code` and `auth.work_email_code_*` events; no code, link or token
   is ever logged.

## Tests (red first)

- Server: send off → 410; on → sends one email whose text contains the code and a link whose fragment decodes to
  the same email and code; referrer work email refused on the seeker plane; verify succeeds once, second use
  fails; rate limit answers 429. Referrer email gains the link only with the switch on.
- Client: link fragment → confirm screen, fragment cleared, nothing posted before the click; seeker form default
  email step with one primary button; password path still reachable; code step posts verify.
- `loginRule.test.tsx` / `signIn.test.tsx`: referrer surfaces still show no personal-email, social or password
  control; seeker surface may now show the email link option (D-406).

## Status

- AUTH-email-link-code: in progress — Claude Code · 530c — 2026-11-25 — branch agent/queue/auth-email-link-code. Built behind `EMAIL_SIGN_IN_LINK_ENABLED = false`: shared link helper, sign-in email with link (code first in the subject), seeker send/verify routes with the D-081 work-email refusal, /sign-in link confirm screen, seeker email-first form with password one tap away. Also touches `server/workEmailOtp.test.ts` (one send-argument pin now includes `seeker: true`).
- AUTH-email-link-release: in progress — GPT-6.1 Sol · dd6d — 2026-11-26 — official branch `agent/queue/auth-email-link-release`, claim `c3dd50fd8`. The clean-clone candidate integrates `origin/main` `eac7b8e4c` without conflicts, preserving the published release history and current upstream work; the original interrupted worktree and its index remain untouched. Prior takeover: GPT-6.1 Sol · 3622, claim `e7b5217b8`; published commits `d7275d20e` (switch), `12c3c7193` (acceptance doc), and preserved repair `3d1c228f3` remain in history. The prior 8-files / 114-tests + typecheck and original 12-files / 164-tests receipts are historical, not this integrated candidate's validation. Switch and release-on test remain enabled. Current-main full gate, typecheck/build, required CI/deployment, exact-release 1280/390 captures, and real-inbox send/code/link acceptance remain pending. Not done.
  - Bounded release repair: enabled sign-in emails use the full D-406 subject for both planes; the code-only/disabled helper and D-245 step-up are unchanged. Initial page state distinguishes absent, invalid marked and valid links using the exact shared marker boundary. The page clears marked fragments once through its own effect while preserving path/query; invalid links reuse the native error surface with one "Send a new link" recovery and preserve recognizable `p=r` intent. Neither mount nor restart sends or verifies a code; valid links still require a click and use their own plane's endpoint. The parser signature, provider, code store, identity and limits are unchanged.
  - Current integrated regression proof: `LANG=en_US.UTF-8 pnpm vitest run server/emailSignInLink.test.ts client/src/pages/goal/sign-in/emailLinkSignIn.test.tsx --maxWorkers=1` reproduced RED before repair: 2 files, 14 specific assertion failures (2 full-subject and 12 missing invalid-link alerts), 24 passed, no timeouts. The identical GREEN rerun passed both files / all 38 tests, with no timeouts (Vitest duration 151.29 s). `git diff --check` and `git diff --cached --check` also pass. Logs `red-email-link-repair.log` and `green-email-link-repair.log` are outside source in the session's `auth-email-link-release-evidence-dd6d` directory with codes/fragments redacted. The nine-file focused sweep and full gate are deferred to the primary session/required CI because of measured host resource pressure; no timeout or assertion is weakened. No live inbox or release acceptance is claimed.
  - Invalid-intent follow-up: restarting an invalid marked link now retains the currently selected intent, including `?intent=referrer` with a bare marker or missing/unknown plane; only a valid link resets intent from its validated plane. Three additional client cases were added before the source change. The first client-only RED attempt ran no tests because its fork worker failed to start (`red-invalid-referrer-intent.log`). Its one retry completed before the stop instruction: all three new restart-intent assertions failed and 33 existing client tests passed (`red-invalid-referrer-intent-retry.log`), with no test timeouts. Both logs are in the same external evidence directory. No further Vitest run was started under the measured host overload. Post-fix validation of this follow-up and its three added cases is PENDING required CI; the original 14-RED / 38-GREEN evidence above predates this final source change and is not a new GREEN claim. Tests, timeouts and dependencies are unchanged.
  - Bounded integration repair: the email-first form again mounts the existing native passkey autofill with `username webauthn` only when the existing server availability enables it. The original saved-passkey assertion is preserved; an added enabled/disabled regression also pins the autofill component and referrer exclusion. Password-specific tests select the visible password fallback; the retired-code server fixture explicitly selects the switch-off contract. No passkey implementation, sign-in method, route, schema or configuration change.
  - Prior local evidence (original receipt, before takeover): original passkey pin and new enabled regression reproduced red before repair; after repair, 12 focused files / 164 tests, typecheck, build, design-token audit, migration lint and deploy-trigger check pass. Required GitHub CI and real-inbox/exact-release acceptance were unresolved at that point.
