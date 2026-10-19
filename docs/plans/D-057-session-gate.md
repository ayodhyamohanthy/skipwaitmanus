# Packet D-057 session gate: reviewing or accepting asks needs a work-email-code session, whatever else the referrer signed in with

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `D-057-session-gate` (add it under "Drift from approved decisions" when you claim it) |
| Decisions | D-057, D-049, D-030, D-019 (basics: the referrer flow must keep working) |
| Risk tier | 1 (sessions, the referrer boundary) |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/<model>/d057-session-gate` |
| Depends on | the seeker-passwords lane live (it edits `server/_core/workosSession.ts` and adds the social-sign-in refusal) |
| Do not run at the same time as | D-057-referrer-continuity (the next lane builds on this one) |
| Verified against | `main` `681ea79` |

## 1. Goal
A person who verified a work email is a verified referrer for every session they hold, including a Google session from their seeker side. D-057 says the referrer side needs a fresh proof of employment, a work-email code, in the same session. After this packet:
- referrer surfaces in any other session show "Verify with your work-email code" instead of the queue;
- every referrer action route refuses such a session on the server.

## 2. Binding rules (quoted)
- D-057: "the referrer-facing sign-in stays the work-email code, and reviewing or accepting asks always needs a work-email code in that session (a personal-login session shows the record and the seeker side, then asks for the code), so every referrer action still re-proves current employment."
- D-049: referrers sign in with the work-email code "on every visit".

## 3. Current behaviour (verified)
1. The session JWT payload is `{ openId, appId, name, sid? }` (`server/_core/sdk.ts`, `SessionPayload`).
   - `createSessionToken` mints it for the work-email code login (`server/_core/otpLogin.ts`, about line 72) and for the WorkOS paths (`server/_core/workosSession.ts`, about line 78).
   - Renewal re-signs it, keeping `name` and `sid` (`sdk.ts`, about line 56).
2. The verified-referrer verdict comes from the server only: `GET /api/company-referrals/access` (`shared/referrerAccess.ts`, `client/src/hooks/useReferrerAccess.ts`; states checking → verified / unverified / error). It reads the person's verified work email, not the session.
3. The referrer routes live in `server/privateReferralRoutes.ts`. Their database functions check the profile's verification (`isVerifiedEmployeeOfCompany`), never how the session was made.

## 4. Target behaviour
1. **Session claim.** `SessionPayload` gains `amr?: "work_email_otp"`.
   - Only `server/_core/otpLogin.ts` sets it.
   - Renewal keeps it.
   - WorkOS and password sessions never carry it.
   - Old sessions (no claim) simply lack it.
2. **Identity.** `resolveIdentity` exposes `session.amr`, or the route helper reads it from the verified cookie. Bearer tokens from AuthKit never carry it.
3. **Verdict.** `GET /api/company-referrals/access` answers a new state, `code_required`, for a verified referrer whose session lacks the claim. `shared/referrerAccess.ts` gains the state, and the Zod contract accepts it.
   - `useReferrerAccess` treats `code_required` like unverified for rendering. Every referrer surface (`/queue`, the referring side of `/inbox`, `/referrer-home`, `/referrer/impact`, `/post-opportunity`, `/verify`) shows the work-email code sign-in (`referrerSignInHref(returnTo)`) with the line "Confirm you still work at <company> with a code to your work email."
   - Seeker-side surfaces are unchanged.
4. **Enforcement.** A route middleware `requireWorkEmailSession` answers 403 `{ "error": "Confirm your work email with a code to continue.", "code": "work_email_code_required" }` for a session without the claim, before any database call. It applies to every referrer action route.
   - Enumerate them in `server/privateReferralRoutes.ts` as the handlers that call any of: `claimCompanyReferralRequest`, `oneClickReviewReferralRequest`, `reviewReferralRequest`, `resolveReferrerReviewEmailLink`, `consumeReferrerReviewEmailLink`, `saveCompanyReferralRequest`, `getUnclaimedCompanyReferralPreview`, `listCompanyReferralInboxByState`, `getClaimedCompanyReferralDetail`, `openCompanyReferralAvailability`, `updateReferralProgress` (when the actor is the referrer), `publishCompanyOpportunity`, `renewCompanyOpportunity`, `closeCompanyOpportunity`, `updateReferrerPreferences`, the Slack webhook routes, `getOrCreateReferrerFastTrackLink`, and the referrer impact and home bundle.
   - Pin the resulting list in a test that fails when a route calling one of those functions is neither on the list nor on an explicit allowlist with a reason.
5. **Client.** On a `work_email_code_required` 403 from any referrer action, the client navigates to `referrerSignInHref(current path)`. Add it once in the shared referrer fetch helpers (`client/src/lib/threadApi.ts` `authedFetch`, `client/src/components/referrer-home/referrerData.ts` `getJson`/`sendJson`).
6. **Deploy effect.** Existing referrer sessions lack the claim, so every referrer enters a code once after deploy. That matches D-049 ("on every visit"); say so in the row.

## 5. Files
- **In scope:**
  - `server/_core/sdk.ts`, `server/_core/otpLogin.ts`, `server/_core/context.ts` (if `resolveIdentity` lives there), `server/privateReferralRoutes.ts` (middleware and route list only);
  - `shared/referrerAccess.ts`;
  - `client/src/hooks/useReferrerAccess.ts`, `client/src/lib/threadApi.ts`, `client/src/components/referrer-home/referrerData.ts`, plus the referrer surfaces' gate rendering (they already branch on the verdict);
  - tests;
  - docs: the `AGENTS.md` living-map rows for the referrer gate and auth, and the `docs/DECISIONS.md` D-057 sync cell (part done).
- **Out of scope:** linking a personal login (D-057-referrer-continuity), the WorkOS paths' other behaviour, seeker surfaces.

## 6. Tests to write first
1. A work-email code session carries `amr`, renewal keeps it, and a WorkOS session never has it.
2. `/access` answers `code_required` for a verified referrer in a WorkOS session, and `verified` after a code session.
3. Every listed route answers 403 `work_email_code_required` for a WorkOS session of a verified referrer, with no database function called (spies), and works in a code session.
4. The route-list pin fails for a new unlisted referrer route.
5. The client sends the user to the referrer sign-in on that 403 and returns them after.
6. The controls stay green: `client/src/pages/loginRule.test.tsx`, `signIn.test.tsx`, the referrer OTP tests (`client/src/pages/referrer.otp.test.tsx`), `server/_core/otpLogin.test.ts`.

## 7. Definition of done
- [ ] Gate.
- [ ] Draft PR plus independent review (session security).
- [ ] Screens of the code-required state at 1280 and 390.
- [ ] Push; API CONVERGED.
- [ ] Live: a WorkOS session gets 403 on `POST /api/company-referrals/:id/claim` (QA account).
- [ ] Row done.

## 8. Stop and ask if
A referrer action route cannot be reached in a code session (for example, a link opened from email lands signed out): stop and describe the flow. Never weaken the gate.
