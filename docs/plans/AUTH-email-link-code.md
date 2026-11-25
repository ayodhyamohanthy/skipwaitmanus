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
2. **Link safety.** Link: `https://skipwait.me/sign-in#email-link=<base64url JSON {e, c, p}>` where `p` is
   `s` (seeker) or `r` (referrer). The fragment never reaches the server, logs or a Referer header. `/sign-in`
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
- AUTH-email-link-release: in progress — GPT-6.1 Sol · 3553 — 2026-11-26 — branch agent/queue/auth-email-link-release. Switch and release-on test enabled; live inbox acceptance (send, link, code) and 1280/390 captures remain pending.
