# Packet SKIPPY-stepup: fresh sign-in before a Skippy money card (D-140)

> Read `docs/BRIEF.md` first, then this packet. You need nothing else unless a section below names it.

| Field | Value |
|---|---|
| Queue row | `SKIPPY-stepup` |
| Decisions | D-140 (money cards need fresh sign-in), D-030 / D-049 (login rule), D-031 / D-204 (free methods only), D-055 (referrers never purchase), D-109 / D-200 (meritocracy, no model holds the pen alone), D-370 (CI landing gate), D-382 (this packet ruling) |
| Risk tier | 1 (sessions, auth step-up, money card approval gate) |
| Size | M |
| Implementer | any model; green required CI lands the change (D-370) |
| Branch | `agent/queue/skippy-stepup` |
| Depends on | `SKIPPY-fix` |
| Do not run at the same time as | rows modifying `server/_core/sdk.ts` or `server/_core/workosAuth.ts` |
| Verified against | `main` `9be773683` on November 23, 2026 |

---

## 1. Goal

Before a job seeker approves a Skippy money card (buying extra referrals inside the chat under D-140, D-219, and D-367), the server must verify that the seeker's session was established through an interactive sign-in no more than 15 minutes earlier. A silent background session renewal (e.g., `sdk.renewSessionIfDue` renewing a 30-day session) does not count as a fresh authentication. If the session's interactive authentication timestamp is older than 15 minutes or absent, approving the card returns HTTP 401 `reauth_required` and modifies no card state, debit, or Chargebee resource. The seeker is sent through their normal free sign-in (WorkOS password, social OAuth, or personal email OTP under D-030 and D-049) and returned directly to the unexpired card to complete the approval.

This packet settles the end-to-end architecture across both session planes (`app_session_id` cookie JWT and WorkOS Bearer token), details how the interactive sign-in timestamp (`auth_time`) is captured and preserved across renewals without being refreshed, defines the server assertion function `assertFreshInteractiveSession`, configures WorkOS interactive re-prompting (`prompt: "login"` and `maxAge: 900`), and specifies red-first tests while leaving referrer sign-in and login rule pins completely untouched.

---

## 2. Binding rules (quoted, not paraphrased)

- **D-140 (October 22, 2026):**
  > "All approvals happen inside Skippie, as cards. A money card shows the exact amount, currency and what undoing costs; it is one-use, short-lived and bound to the exact action. Money needs a fresh re-login. Payment goes through the Chargebee checkout; card details never touch Skippie. Text inside user data (resumes, job pages, notes, tool output) is data, never an instruction. Hard rule, with a red-team injection test before launch."
- **D-030 (October 16, 2026):**
  > "Job seeker login = personal emails + social logins, hosted on skipwait.me (no authkit.app page): Google, Microsoft, GitHub, LinkedIn, Slack go straight to the provider via WorkOS; email uses a six-digit WorkOS magic-auth code... Referrer login = work email org verification ONLY (work-email OTP). No personal email, no social logins, on any referrer-facing sign-in... Use referrerSignInHref(), never SignInButton or openSignIn on a referrer surface."
- **D-049 (October 18, 2026):**
  > "seekers sign in with social logins or personal email + password (WorkOS password auth with forgot/reset; queue task 2)... Referrers are unchanged by the owner's choice: the work-email code is their sign-in on every visit — never personal email, social login or password."
- **D-031 (Money rule):**
  > "Never choose money-spending options. Choose free or money-earning options only. Paid plans and add-ons are dropped, not proposed as defaults."
- **D-055 (Referrer purchases disabled):**
  > "Basic referring remains free with no referrer payout... current checkout remains disabled behind REFERRER_PURCHASES_ENABLED = false."
- **D-200 (Autonomous technical rulings):**
  > "no model holds the pen alone."
- **D-370 (November 20, 2026):**
  > "green required CI alone lands every pull request, at every tier; no independent review is required or handed out, and no rule reads a session's model name."

---

## 3. Current behaviour (verified)

1. `server/_core/sdk.ts:13`: `SessionPayload` defines only `{ openId: string; appId: string; name: string; sid?: string; amr?: "work_email_otp"; ssid?: string }`. It does not carry the timestamp of the interactive authentication.
2. `server/_core/sdk.ts:35-36`: `signSession` sets `issuedAt = Math.floor(Date.now() / 1000)` (`iat`) and signs `openId`, `appId`, `name`, and optional `sid`, `amr`, and `ssid`.
3. `server/_core/sdk.ts:49`: `verifySession` extracts only `openId`, `appId`, `name`, `sid`, `amr`, and `ssid`.
4. `server/_core/sdk.ts:53-61`: `renewSessionIfDue` checks if an existing token has `Date.now() - iat * 1000 >= RENEW_AFTER_MS` (24 hours). If so, it re-issues the token by calling `this.createSessionToken(session.openId, { name: session.name, sid: session.sid, amr: session.amr, ssid: session.ssid })`. In `createSessionToken`, a fresh JWT is signed with `issuedAt = Math.floor(Date.now() / 1000)`! Consequently, relying on `iat` would cause silently renewed sessions to falsely report a fresh authentication.
5. `server/_core/devAuth.ts:25-33`: `DevIdentity` defines `{ account, primaryEmail, emailAddresses, sessionAmr?, sessionKey? }`. It has no field for interactive authentication time.
6. `server/_core/devAuth.ts:73-93`: `resolveDevIdentity` verifies the `app_session_id` cookie using `sdk.verifySession` and returns `DevIdentity` without any `authTime` property.
7. `server/_core/workosAuth.ts:79-93`: `validateWorkosAccessClaims` verifies that `payload.iat` is within 24 hours and `payload.exp - payload.iat <= 60 * 60`. It does not extract or enforce interactive `auth_time`.
8. `server/_core/workosAuth.ts:130-162`: `identityFromWorkosJwt` verifies the Bearer JWT and returns `DevIdentity`. It extracts `sessionKey` from `payload.sid`, but omits `authTime`.
9. `server/_core/workosAuth.ts:258-263`: `/api/auth/workos/sign-in` checks `req.query.fresh === "1"` to revoke the linked hosted session, but does not pass `prompt: "login"` or `maxAge: 900` to `workos.userManagement.getAuthorizationUrl`.
10. `server/_core/workosSession.ts:78`: `completeWorkosLogin` calls `sdk.createSessionToken(account.openId, { name: account.name || name, ...(hostedSid ? { sid: hostedSid } : {}) })`.
11. `server/_core/seekerEmailCode.ts:56`: `sdk.createSessionToken(account.openId, { name: account.name ?? email })`.
12. `server/_core/passkeyLogin.ts:250`: `sdk.createSessionToken(stored.openId, { name: account.name ?? undefined })`.
13. `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx`: Pin the login rules (seekers use personal email/social auth; referrers use work email OTP only).

---

## 4. Target behaviour and architectural rulings (D-200, D-382)

### 4.1 Cookie JWT plane (`app_session_id`) and renewal preservation

1. **`SessionPayload` claim:** `SessionPayload` in `server/_core/sdk.ts` gains `authTime?: number` (represented as the standard OpenID Connect claim `auth_time` in the signed JWT payload, stored as integer Unix seconds).
2. **Issuance at interactive sign-in:** `sdk.createSessionToken(openId, options)` accepts `options.authTime?: number`. When `options.authTime` is omitted (initial interactive login), `authTime` defaults to `Math.floor(Date.now() / 1000)`.
3. **Interactive callers:**
   - WorkOS login callback (`server/_core/workosSession.ts:78`): passes `authTime: Math.floor(Date.now() / 1000)`.
   - Seeker personal email code (`server/_core/seekerEmailCode.ts:56`): passes `authTime: Math.floor(Date.now() / 1000)`.
   - Seeker passkey login (`server/_core/passkeyLogin.ts:250`): passes `authTime: Math.floor(Date.now() / 1000)`.
   - Dev auth sign-in (`server/_core/devAuth.ts:127`): passes `authTime: Math.floor(Date.now() / 1000)`.
4. **JWT Signing & Verification:**
   - `signSession` writes `auth_time: payload.authTime` only when `payload.authTime` is a positive safe integer.
   - `verifySession` reads `payload.auth_time` and returns it as `authTime` only when `typeof payload.auth_time === "number" && Number.isSafeInteger(payload.auth_time) && payload.auth_time > 0`.
5. **Renewal preservation without refresh:**
   - In `sdk.renewSessionIfDue(cookieValue)`:
     ```ts
     const session = await this.verifySession(cookieValue);
     if (!session) return null;
     return this.createSessionToken(session.openId, {
       name: session.name,
       ...(session.sid ? { sid: session.sid } : {}),
       ...(session.amr ? { amr: session.amr } : {}),
       ...(session.ssid ? { ssid: session.ssid } : {}),
       ...(session.authTime ? { authTime: session.authTime } : {}),
     });
     ```
   - On renewal, the new token receives a fresh `iat` (current second) and a new 30-day expiration, but `authTime` is explicitly preserved from the old session. A 2-day-old session renewed 5 seconds ago has a fresh `iat`, but its `authTime` remains 2 days old.

### 4.2 WorkOS Bearer token plane

1. In `server/_core/workosAuth.ts` (`identityFromWorkosJwt`):
   - Extracts `payload.auth_time`. If `typeof payload.auth_time === "number" && Number.isSafeInteger(payload.auth_time) && payload.auth_time > 0`, `authTime = payload.auth_time`.
   - If `payload.auth_time` is not present, falls back to `typeof payload.iat === "number" ? payload.iat : undefined` (because WorkOS access tokens are short-lived, with a maximum lifetime of 60 minutes).
2. Sets `authTime` on the resolved `DevIdentity`.

### 4.3 `DevIdentity` interface extension

In `server/_core/devAuth.ts`:
```ts
export type DevIdentity = {
  account: { id: number; openId: string; role?: "user" | "admin"; name: string | null; email: string | null; loginMethod: string | null };
  primaryEmail: DevEmailAddress | null;
  emailAddresses: DevEmailAddress[];
  sessionAmr?: "work_email_otp";
  sessionKey?: string;
  /** D-140 / D-382: Unix epoch seconds of the interactive authentication that established this session. */
  authTime?: number;
};
```
Both `resolveDevIdentity` (`devAuth.ts`) and `identityFromWorkosJwt` (`workosAuth.ts`) populate `authTime`.

### 4.4 Server-side freshness assertion function (`assertFreshInteractiveSession`)

Located in new module `server/_core/sessionStepUp.ts`:
```ts
export const STEP_UP_MAX_AGE_SECONDS = 15 * 60; // 15 minutes (900 seconds)

export type StepUpCheckResult =
  | { fresh: true; authTime: number; ageSeconds: number }
  | { fresh: false; code: "reauth_required"; reason: "missing_auth_time" | "session_too_old" | "future_auth_time"; ageSeconds?: number };

export function assertFreshInteractiveSession(
  identity: DevIdentity | undefined | null,
  maxAgeSeconds = STEP_UP_MAX_AGE_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
): StepUpCheckResult {
  if (!identity || typeof identity.authTime !== "number" || !Number.isSafeInteger(identity.authTime) || identity.authTime <= 0) {
    return { fresh: false, code: "reauth_required", reason: "missing_auth_time" };
  }
  // Clock skew guard: reject tokens with an authTime more than 60 seconds in the future
  if (identity.authTime > nowSeconds + 60) {
    return { fresh: false, code: "reauth_required", reason: "future_auth_time" };
  }
  const ageSeconds = Math.max(0, nowSeconds - identity.authTime);
  if (ageSeconds > maxAgeSeconds) {
    return { fresh: false, code: "reauth_required", reason: "session_too_old", ageSeconds };
  }
  return { fresh: true, authTime: identity.authTime, ageSeconds };
}
```

### 4.5 Money card integration contract

1. When a seeker approves a money card (`POST /api/skippie/cards/:id/approve` in `SKIPPY-3`):
   ```ts
   const freshCheck = assertFreshInteractiveSession(req.identity);
   if (!freshCheck.fresh) {
     return res.status(401).json({
       error: "reauth_required",
       code: "reauth_required",
       message: "Interactive sign-in required within the last 15 minutes to approve a purchase",
     });
   }
   ```
2. **Atomicity:** If the check fails, the card state remains `"pending"`, no payment is initiated, and no database mutation occurs.

### 4.6 WorkOS interactive re-prompt configuration

In `server/_core/workosAuth.ts` (`/api/auth/workos/sign-in`):
1. Supports `req.query.fresh === "1"` or `req.query.step_up === "1"`.
2. When present:
   - Revokes any linked hosted session using `revokeLinkedHostedSession` (preventing silent sign-in via cached AuthKit cookies).
   - In `workos.userManagement.getAuthorizationUrl(...)`, passes:
     - `prompt: "login"` (forces the user to enter their credentials interactively)
     - `maxAge: 900` (maxAge in seconds, OIDC compliant)
     - `screenHint: "sign-in"`
     - Preserves `returnTo` signed cookie targeting `/skippy?resume_card=<id>` or `/skippy`.

### 4.7 Login rule and referrer boundary preservation

1. **Free methods only:** Job seekers re-authenticate using personal email password (free), social OAuth (Google, Microsoft, GitHub, LinkedIn, Slack; all free), or personal email OTP codes. No paid SMS or paid email codes where free methods exist (D-031, D-049).
2. **Referrer login untouched:** Referrer sign-in (`/api/auth/otp/send|verify`, `referrerSignInHref()`) is strictly work email OTP only and does not touch this flow. Referrers never purchase (`REFERRER_PURCHASES_ENABLED = false`, D-055).
3. **Pins:** `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx` remain 100% green.

---

## 5. Files

### In scope (edit only these)
- `server/_core/sdk.ts` (SessionPayload `authTime`, signSession, verifySession, renewSessionIfDue)
- `server/_core/devAuth.ts` (DevIdentity `authTime`, resolveDevIdentity)
- `server/_core/workosAuth.ts` (identityFromWorkosJwt authTime, getAuthorizationUrl step-up parameters)
- `server/_core/workosSession.ts` (completeWorkosLogin passes authTime)
- `server/_core/seekerEmailCode.ts` (seeker email code passes authTime)
- `server/_core/passkeyLogin.ts` (passkey login passes authTime)
- `server/_core/sessionStepUp.ts` (new: assertFreshInteractiveSession, requireFreshSeekerSession)
- `server/_core/sessionStepUp.test.ts` (new: comprehensive unit and integration tests)
- `server/_core/sdk.session.test.ts` (authTime claim verification and renewal preservation)
- `server/_core/workosAuth.test.ts` (authTime claims and step-up authorization URL options)
- `docs/plans/SKIPPY-stepup.md` (this packet)

### Read only
- `server/_core/hostedAccountSwitch.ts`
- `server/skippieCards.ts`
- `server/skippieSeekerRoutes.ts`
- `client/src/pages/loginRule.test.tsx`
- `client/src/pages/signIn.test.tsx`

### Out of scope (never edit here)
- `server/db.ts` (no schema change; auth_time is carried purely in JWT session tokens)
- `server/_core/otpLogin.ts` (referrer login is completely untouched)
- `server/referrerStepUpRoutes.ts` (referrer step-up is separate and untouched)
- `server/privateReferralRoutes.ts` (referrer referral actions untouched)
- `client/src/lib/referrerSignIn.ts` (untouched)

---

## 6. Steps (one commit each)

### Step 1: SDK Session Token `auth_time` claim and renewal preservation
- In `server/_core/sdk.ts`:
  - Extend `SessionPayload` with `authTime?: number`.
  - In `createSessionToken`: accept `options.authTime?: number`. Default to `Math.floor(Date.now() / 1000)` if undefined.
  - In `signSession`: write `auth_time: payload.authTime` if valid positive integer.
  - In `verifySession`: extract `auth_time` as `authTime: (typeof payload.auth_time === "number" && Number.isSafeInteger(payload.auth_time) && payload.auth_time > 0) ? payload.auth_time : undefined`.
  - In `renewSessionIfDue`: pass `authTime: session.authTime` into `createSessionToken`.
- In `server/_core/sdk.session.test.ts`:
  - Add tests verifying `authTime` is written and read back.
  - Add tests proving that renewal retains the original `authTime` while refreshing `iat`.
- Commit: `feat(auth): carry auth_time in session JWT and preserve across renewal`

### Step 2: Auth Planes and `DevIdentity` integration
- In `server/_core/devAuth.ts`:
  - Add `authTime?: number` to `DevIdentity`.
  - In `resolveDevIdentity`: copy `session.authTime` into `identity.authTime`.
- In `server/_core/workosAuth.ts`:
  - In `identityFromWorkosJwt`: extract `payload.auth_time` (or fallback to `payload.iat`) and populate `identity.authTime`.
- In `server/_core/workosSession.ts`:
  - In `completeWorkosLogin`: pass `authTime: Math.floor(Date.now() / 1000)` into `createSessionToken`.
- In `server/_core/seekerEmailCode.ts` and `server/_core/passkeyLogin.ts`:
  - Pass `authTime: Math.floor(Date.now() / 1000)` into `createSessionToken`.
- Commit: `feat(auth): populate authTime on DevIdentity across cookie and bearer planes`

### Step 3: Freshness Assertion Module & Tests
- Create `server/_core/sessionStepUp.ts`:
  - Implement `STEP_UP_MAX_AGE_SECONDS = 900`.
  - Implement `assertFreshInteractiveSession(identity, maxAgeSeconds?, nowSeconds?)`.
  - Implement Express middleware / helper `requireFreshSeekerSession(req, res, next)`.
- Create `server/_core/sessionStepUp.test.ts`:
  - Implement exhaustive red-first test suite (fresh session, boundary, old session, renewed old session, missing claim, clock skew, Bearer token, Express 401 response).
- Commit: `feat(auth): implement assertFreshInteractiveSession and step-up middleware`

### Step 4: WorkOS Interactive Re-prompt Configuration
- In `server/_core/workosAuth.ts`:
  - In `/api/auth/workos/sign-in`: when `req.query.fresh === "1"` or `req.query.step_up === "1"`, revoke linked hosted session and pass `prompt: "login"` and `maxAge: 900` to `workos.userManagement.getAuthorizationUrl`.
- In `server/_core/workosAuth.test.ts`:
  - Verify that `prompt: "login"` and `maxAge: 900` are passed to `getAuthorizationUrl` when `step_up=1` or `fresh=1`.
- Commit: `feat(auth): forward prompt=login and maxAge to WorkOS on step-up sign-in`

### Step 5: Verification & Gate Pass
- Run focused tests:
  - `pnpm test server/_core/sessionStepUp.test.ts`
  - `pnpm test server/_core/sdk.session.test.ts`
  - `pnpm test server/_core/workosAuth.test.ts`
  - `pnpm test client/src/pages/loginRule.test.tsx client/src/pages/signIn.test.tsx`
- Run `pnpm check`.
- Commit: `chore(auth): verify SKIPPY-stepup tests and typecheck`

---

## 7. Tests to write first (red before the fix)

1. **`server/_core/sessionStepUp.test.ts`:**
   - **T1: Fresh cookie session (< 15 mins):** Identity with `authTime = now - 300` passes `assertFreshInteractiveSession` (`{ fresh: true, ageSeconds: 300 }`).
   - **T2: Exact boundary test:** Identity with `authTime = now - 900` passes (`{ fresh: true, ageSeconds: 900 }`). Identity with `authTime = now - 901` fails with `{ fresh: false, code: "reauth_required", reason: "session_too_old" }`.
   - **T3: Old cookie session (> 15 mins):** Identity with `authTime = now - 1800` fails with `code: "reauth_required"`.
   - **T4: Renewed old session fails step-up:** Create a session token with `authTime = now - 2000` and `iat = now - 86400 * 2`. Renew it via `sdk.renewSessionIfDue`. Verify the renewed token has `iat = now`, but its `authTime` remains `now - 2000`. Passing this renewed identity to `assertFreshInteractiveSession` fails with `reauth_required`.
   - **T5: Missing `authTime` fails fail-closed:** Token with no `auth_time` (e.g. legacy token) yields identity without `authTime`. Fails `assertFreshInteractiveSession` with `{ fresh: false, code: "reauth_required", reason: "missing_auth_time" }`.
   - **T6: Clock-skew protection:** Token with `authTime = now + 120` (in the future) fails with `{ fresh: false, code: "reauth_required", reason: "future_auth_time" }`.
   - **T7: WorkOS Bearer token with fresh `auth_time`:** Bearer token with `auth_time = now - 100` passes.
   - **T8: WorkOS Bearer token with old `auth_time`:** Bearer token with `auth_time = now - 1200` fails with `reauth_required`.
   - **T9: WorkOS Bearer token fallback to `iat`:** Bearer token without `auth_time` uses `iat`. Fresh `iat = now - 60` passes; old `iat = now - 1000` fails.
   - **T10: Express middleware response:** Request with non-fresh identity receives HTTP 401 with `{ code: "reauth_required", error: "reauth_required", message: "..." }`.

2. **Controls (existing tests that must remain green):**
   - `client/src/pages/loginRule.test.tsx` (all 7 tests pass)
   - `client/src/pages/signIn.test.tsx` (all 7 tests pass)
   - `server/_core/sdk.security.test.ts` (session security and revocation)
   - `server/_core/workosJwtClaims.test.ts` (access token claim validation)

---

## 8. Edge cases and races

1. **Silent renewal race:** A user is active in the app; `renewSessionIfDue` runs in the background. The user then opens Skippy and clicks "Approve". If renewal refreshed `authTime`, the 15-minute gate would be bypassed. *Handling:* `renewSessionIfDue` explicitly copies `session.authTime`, so renewal extends session access lifetime but preserves authentication age.
2. **Clock skew:** Small clock differences between server and identity provider. *Handling:* Allow up to 60 seconds of future skew (`authTime <= nowSeconds + 60`). Any greater future drift is rejected as `future_auth_time`.
3. **Legacy active sessions:** Sessions minted prior to this deployment have no `auth_time` in their payload. *Handling:* Treated as `missing_auth_time` and required to re-authenticate interactively before approving a purchase.
4. **Account suspension or session revocation:** A user's session was revoked or user was suspended. *Handling:* `sdk.verifySession` already checks `account.sessionsValidAfter` and `account.suspended`; revoked/suspended sessions resolve as unsigned-out (401).

---

## 9. Definition of done

- [ ] All tests in `server/_core/sessionStepUp.test.ts` pass.
- [ ] `server/_core/sdk.session.test.ts` and `server/_core/workosAuth.test.ts` pass with new `authTime` assertions.
- [ ] All controls (`loginRule.test.tsx`, `signIn.test.tsx`, `sdk.security.test.ts`) pass without modification.
- [ ] `pnpm check` passes with zero TypeScript errors.
- [ ] Pull request opened on `agent/queue/skippy-stepup` with clean CI merge.

---

## 10. Review checklist (for the independent reviewer)

1. Does `SessionPayload` in `server/_core/sdk.ts` represent `authTime` as a number without modifying existing fields (`openId`, `appId`, `name`, `sid`, `amr`, `ssid`)?
2. Does `renewSessionIfDue` pass `authTime: session.authTime` through so that renewal never refreshes authentication age?
3. Is `assertFreshInteractiveSession` completely pure and fail-closed when `authTime` is missing, malformed, or older than 900 seconds?
4. Are WorkOS step-up requests configured with `prompt: "login"` and `maxAge: 900` while revoking any cached hosted session?
5. Is referrer authentication (`otpLogin.ts`, `referrerSignInHref()`, work email OTP) completely untouched?
6. Are `client/src/pages/loginRule.test.tsx` and `client/src/pages/signIn.test.tsx` unchanged and green?

---

## 11. Stop and ask if

- A test fails for reasons unrelated to `authTime` or step-up.
- A requirement is proposed to charge users for verification codes or alter personal email/social auth rules (conflicts with D-030/D-031/D-049).
- A change is proposed that touches `server/privateReferralRoutes.ts` or referrer authentication (prohibited; referrers never purchase).

---

## 12. Owner questions

None. The requirements follow directly from founder decisions D-140, D-030, D-049, D-031, D-055, and D-200.

---

## Status

`SKIPPY-stepup`: packet written — Gemini 3.8 Flash · 9904 — 2026-11-23 — branch `agent/architect/skippy-stepup`
