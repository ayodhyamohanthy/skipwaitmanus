# ZeptoMail + WorkOS AuthKit setup for skipwait.me

This release makes two provider swaps, both code-complete and provider-gated:

| Concern | Was | Now | Fallback |
| --- | --- | --- | --- |
| Transactional email (review notices, slot alerts, work-email OTP, admin error alerts) | Resend only | **ZeptoMail** (Zoho) primary | Automatic fallback to Resend when `ZEPTOMAIL_API_KEY` is unset |
| Production sign-in authority | The previous hosted auth provider | **WorkOS AuthKit** | Local dev sessions (when WorkOS credentials are unset) |

## 1. ZeptoMail (transactional email)

1. Create a [Zoho](https://www.zoho.com/zeptomail/) account and a Mail Agent for skipwait.me.
2. Add and verify your sending domain (e.g. `updates.skipwait.me`) — add the DKIM/SPF DNS records Zoho shows you.
3. Generate a **Send API key** for the agent.
4. Set the environment variables:
   - `ZEPTOMAIL_API_KEY` — the Send API key
   - `ZEPTOMAIL_FROM_EMAIL` — e.g. `noreply@updates.skipwait.me`
5. Keep `ERROR_ALERT_FROM_EMAIL=noreply@updates.skipwait.me` set — it is the fallback sender identity.

Why: ZeptoMail is pay-per-credit with no monthly minimum (10,000 credits ≈ $1–1.25 as of writing), which suits the current volume far better than a fixed monthly plan. Billing alerts and review notices together stay well under a few hundred credits/month at launch scale.

## 2. WorkOS AuthKit (sign-in)

1. Create a [WorkOS](https://workos.com/) project; AuthKit is free up to 1M monthly active users.
2. In the AuthKit configuration, set the redirect URI to `https://skipwait.me/api/auth/workos/callback` (and your staging URL if desired).
3. Collect: **Client ID**, **API key**, and set a **cookie password** (a 32+ char random string) for session sealing.
4. Environment variables:
   - `WORKOS_CLIENT_ID`
   - `WORKOS_API_KEY`
   - `WORKOS_COOKIE_PASSWORD`
   - `WORKOS_REDIRECT_URI=https://skipwait.me/api/auth/workos/callback` (optional; this is the default)
   - `WORKOS_POST_SIGNIN_PATH=/` (optional)
   - `VITE_WORKOS_ENABLED=true` (client build flag — routes `startLogin()` to AuthKit)
5. AuthKit verifies the sign-in email itself; verified addresses enroll in the employee pool through the existing verified-email endpoint. Enrollment of a *separate* company address uses the new server-owned OTP, delivered via ZeptoMail.

## 3. What changed in the code

- `server/emailDelivery.ts` — provider-agnostic transactional sender (ZeptoMail → Resend → not-configured). Never throws; failures are returned to callers who already handle them.
- `server/_core/workosAuth.ts` — AuthKit routes. The callback upserts the WorkOS user (`workos_<id>` openId) and issues the same `app_session_id` JWT the rest of the app already verifies, so **no other route, DB query, or authorization check changed**.
- `server/workEmailOtp.ts` + migration `0028` — server-owned enrollment OTP (hashed codes, 10-min TTL, single use, attempt caps, resend cooldown).
- `WorkEmailSignIn` — drives the server OTP endpoints (`/api/auth/otp/send|verify`) directly.
- Exactly one auth authority is active at a time: WorkOS AuthKit in production; local dev sessions when WorkOS credentials are unset.

## 4. Verification status

- `tsc --noEmit` clean; full test suite 227 passed / 0 failed (6 intentional external-credential skips); production build green.
- WorkOS + ZeptoMail live behavior requires real credentials in the target environment; the code paths are unit- and contract-tested with injectable fetch.

## References

- ZeptoMail Email API: https://www.zoho.com/zeptomail/help/api/email-sending.html
- WorkOS AuthKit (Express): https://workos.com/docs/authkit
- @workos-inc/node SDK: https://github.com/workos/workos-node
