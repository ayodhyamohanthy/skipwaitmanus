# Packet D-057 session gate: reviewing or accepting asks needs a work-email-code session, whatever else the referrer signed in with

> Read `docs/BRIEF.md` first, then this packet.

| Field | Value |
|---|---|
| Queue row | §3b `D-057-session-gate` (add it under "Drift from approved decisions" when you claim it) |
| Decisions | D-057, D-049, D-030, D-019 (basics: the referrer flow must keep working), D-245 (step-up), D-246 (sequencing and owns) |
| Risk tier | 1 (sessions, the referrer boundary) |
| Size | M |
| Implementer | any model; independent review required |
| Branch | `agent/<model>/d057-session-gate` |
| Depends on | nothing (D-163; it used to wait for the seeker-passwords lane, which now waits for this one) |
| Do not run at the same time as | D-057-referrer-continuity (the next lane builds on this one). D-090-BYOR and its chain wait for this row (D-246), and their four shared files are handed over only for this build (§0b.8) |
| Verified against | `main` `681ea79`; re-verified on `main` `06323e5c` by the CEO addendum below; amended on `main` `2892629a` by the CEO answer in §0b (D-245) |

## 0. CEO addendum, Oct 23 (D-163): this overrides the table above and §3 to §5 where they differ
- **No dependency.** This packet builds against `main` now. It does **not** wait for seeker passwords: the seeker-passwords row now waits for this one, because D-080 lets #324 land once this gate closes the Bearer path. Do not edit `server/_core/workosSession.ts`; WorkOS and password sessions lack the claim without any change there.
- **Exact places on `main` `06323e5c`:**
  1. `server/_core/sdk.ts`: `SessionPayload` (line 13) gains `amr?: "work_email_otp"`. `createSessionToken` (line 18) takes an `amr` option and passes it to `signSession`. `signSession` (line 32) writes `amr` into the JWT only when it is exactly `"work_email_otp"`. `verifySession` (the return at line 45) reads it back only when it is exactly that string, otherwise leaves it undefined. Renewal (line 56) passes `amr: session.amr` through.
  2. `server/_core/otpLogin.ts:72`: `sdk.createSessionToken(openId, { name: ..., amr: "work_email_otp" })`. This is the only code login.
  3. `server/_core/reviewerLogin.ts:86`: pass `amr: "work_email_otp"` **only when `role === "referrer"`** (ruling: the founder-approved demo referrer, off unless `REVIEWER_LOGIN_ENABLED`, must keep working for the Razorpay review; its domain is the fixed `reviewer.skipwait.me`). The other minting sites stay unchanged and never carry it: `server/_core/workosSession.ts:78`, `server/_core/seekerEmailCode.ts:56`, `server/_core/devAuth.ts:121`.
  4. Identity: `resolveDevIdentity` (`server/_core/devAuth.ts:69-87`) is the cookie path, and `resolveWorkosIdentity` falls back to it (`server/_core/workosAuth.ts:205,208`). Add `sessionAmr?: "work_email_otp"` to the identity it returns, copied from the verified session. `identityFromWorkosJwt` (`server/_core/workosAuth.ts:124`, the Bearer path) never sets it. `server/_core/index.ts:158` wires both; the dev-only wrapper at lines 160-164 copies `sessionAmr` too. Item 8 below decides how the gate reads it.
  5. **Never infer the claim from the session subject.** A code session's subject is `workemail_<email>` (`server/_core/otpLogin.ts:62`), but a person first created by a code keeps that canonical openId, so a later WorkOS session for them carries the same subject (`workosSession.ts:78` signs `account.openId`). Only the `amr` claim counts.
  6. Verdict route: `GET /api/company-referrals/access` is `server/privateReferralRoutes.ts:903`. Enforcement list: the functions §4.4 names are all called in `server/privateReferralRoutes.ts`, except `updateReferrerPreferences`, whose route is `PUT /api/referrer-preferences` in `server/profileRoutes.ts:132`; add `server/profileRoutes.ts` (that route only) to the in-scope files. The `GET` at `profileRoutes.ts:112` is read-only and stays open.
  7. Client: `authedFetch` is `client/src/lib/threadApi.ts:126`; `getJson` and `sendJson` are `client/src/components/referrer-home/referrerData.ts:79` and `:94`.
  8. **No sign-in loop (ruling; its client half, and the case of a code cookie of another account, are settled by §0b, which wins where they differ).** A browser signed in with AuthKit sends its Bearer token, and a valid Bearer wins over the cookie (`server/_core/workosAuth.ts:200`). So a dual-role person who types the code (which sets the `app_session_id` cookie, `otpLogin.ts:73`) would still resolve through the Bearer path, still lack the claim and be sent back to the code for ever. So `requireWorkEmailSession` and the `/access` verdict do not read the claim from the resolved identity alone. They also verify the request's `app_session_id` cookie with `sdk.verifySession`, and pass when that cookie carries `amr: "work_email_otp"` and resolves to the same account id as the request's identity (`db.getUserByOpenId(session.openId)` returns the canonical account). A cookie of a different person never counts. Pin it with a test: Bearer identity of person P, plus a code cookie of P, passes; plus a code cookie of person Q, fails; Bearer alone fails.
- **Deploy effect, stated in the row and the report:** sessions last 30 days (`server/_core/sdk.ts:8`), so every referrer types one code on their next referrer action after the deploy. That is D-049's rule ("on every visit"). No flag: this closes a security gap, and the gate's refusal leads straight to the code sign-in.
- **Stop and ask** (report blocked to the CEO) only if a referrer surface can't render the `code_required` state without a new page. Every one already branches on the verdict.

## 0b. CEO answer, Oct 30 (D-245): an in-session work-email step-up. This wins over §0 to §8 wherever they differ
The block (Hark · 450f, report `1f344276`, branch status line `629cd79a`): a Google-first referrer P verified a work email on `/verify` (`completeWorkEmailOtpEnrollment`, `server/db.ts:1537`: profile only, no alias). The standalone code login (`server/_core/otpLogin.ts:65`, `resolveLoginIdentity` with provider `work_email_otp`) finds no alias for that address and creates a second account Q (`workemail_<email>`), while AuthKit keeps sending P's Bearer, which wins (`server/_core/workosAuth.ts:200`). Item 8 then sees identity P plus a code cookie of Q, refuses it, and the client sends P back to the code for ever.

**The owner's answer (CEO, Oct 30, in substance):** keep the adopted rule: a personal-login session may show existing records, but referrer actions need a fresh work-email code in that same session. The fresh verification binds securely to the authenticated account and the current session and keeps that account's history and referrals. An already-signed-in person is never sent through the standalone code login that creates another account; signed-out work-email sign-in stays separate and working. Forbidden: dropping the Google/WorkOS token, accepting a different account's cookie, matching people by company domain, inferring verification from a login identifier, and merging accounts. Use a dedicated server-side proof bound to account, session, exact work email and purpose; an old profile verification alone is not enough. The employer-change, logout, suspension and revocation rules stay. The red-first tests in §0b.7 are required. The build goes through the normal independent review, and the full browser path is shown before anyone calls it fixed. Any remaining conflict is recorded on this row, never as a new overlapping task.

**Rejected options from the block:** (a) passing when the code cookie's `workemail_<email>` subject matches P's work email (it reads a login identifier and accepts another account's cookie); (b) the client dropping the AuthKit Bearer on referrer surfaces (forbidden, and P's record stays out of reach); (c) linking or merging P and Q first, or a switch until D-057-referrer-continuity lands (merging is forbidden; continuity stays its own row, and the gate does not wait for it).

### 0b.1 What stays exactly as it is
- §0 items 1 to 7: the `amr: "work_email_otp"` claim is minted only by `otpLogin.ts:72` and the reviewer demo's referrer role (`reviewerLogin.ts:86`). It is never inferred from the `workemail_` subject (item 5). The Bearer path never sets it.
- §0 item 8's server half: a request whose own `app_session_id` cookie carries `amr` and resolves to the same account id as the request's identity passes. A cookie of a different account never counts, and its pins stay (P Bearer + P code cookie passes, P Bearer + Q code cookie fails, Bearer alone fails).
- The login rule (D-030/D-049/D-057): `/api/auth/otp/send|verify` and `referrerSignInHref()` remain the signed-out referrer sign-in, unchanged except for item 2's claim. `loginRule.test.tsx`, `signIn.test.tsx`, `referrer.otp.test.tsx` and `otpLogin.test.ts` stay green.

### 0b.2 The session key (what "this session" means)
- `server/_core/sdk.ts`: `SessionPayload` gains `ssid?: string`, a random UUID naming one app-session chain. `createSessionToken` mints one unless it is passed one. `signSession` writes it only when it has the UUID shape, and `verifySession` returns it only then. `renewSessionIfDue` passes `ssid` through, with `sid` and `amr`, so renewal keeps the same key (the `jti` changes on every renewal, so it is never the key).
- The request's **session key** comes from the credential that resolved its identity. On the Bearer path it is `workos:<sid>` from the verified WorkOS access token (`validateWorkosAccessClaims` already requires `sid`, `workosAuth.ts:80`). On the cookie path it is `workos:<sid>` when the app cookie carries a hosted `sid`, otherwise `app:<ssid>`. The identity gains `sessionKey?: string` next to §0 item 4's `sessionAmr`: `resolveDevIdentity` (`devAuth.ts`) copies it from the verified cookie, `identityFromWorkosJwt` sets it from the token's `sid`, and the dev-only wrapper in `server/_core/index.ts` copies both. It is never derived from an openId, subject, email or anything the client sends. It is stored only as a SHA-256 hex digest.
- A cookie session with neither (minted before this build, no hosted `sid`): `step-up/send` first re-signs the caller's **own** cookie for the same openId (`sdk.createSessionToken(session.openId, { name, sid })`), which gives it an `ssid`. That keeps the same account and never calls `resolveLoginIdentity`. It is the only cookie either step-up endpoint ever sets.

### 0b.3 The proof record
New table `referrerStepUps`, one row per challenge, which may become one proof. It needs an additive `CREATE TABLE IF NOT EXISTS` migration under `drizzle/deploy/`, numbered with the next free number at commit time and recorded in plan §5 (nothing is reserved here), plus the table in `drizzle/schema.ts` and its create in `server/schemaReconcile.ts` `DESIRED_TABLES`. Schema-dependent code stays off `main` until the production migration exists and is verified (AGENTS.md, Deployment and runtime rules).

| Column | Meaning |
|---|---|
| `id` | int, auto-increment primary key |
| `challengeIdHash` | varchar(64), unique; SHA-256 of the random challenge id (32 bytes, base64url) returned by send |
| `userId` | int, FK `users.id` on delete cascade: the account id the request's identity resolved to (the id §0 item 8 compares) |
| `sessionKeyHash` | varchar(64): SHA-256 of the §0b.2 session key |
| `purpose` | enum `referrer_actions` |
| `emailFingerprint` | varchar(80): `workEmailStorageKeys(email).write` (`server/workEmailKey.ts`), never the address |
| `workEmailDomain` | varchar(255): the address's domain, exactly as `profiles.workEmailDomain` stores it |
| `codeHash` | varchar(64): SHA-256 of `<challengeId>:<email>:<code>`. Step-up codes never go into `workEmailOtpCodes`, so a sign-in code is never accepted here, and a step-up code never signs anyone in. |
| `codeExpiresAt`, `attempts` | the code lives 10 minutes and allows 5 tries (the same numbers as `server/workEmailOtp.ts`) |
| `verifiedAt`, `proofExpiresAt` | set once, when the code is accepted; the proof lasts **12 hours** from `verifiedAt`, a fixed limit that renewal never extends (changeable) |
| `revokedAt`, `revokedReason` | enum `superseded`, `logout` |
| `createdAt` | app clock |

Indexes: unique on `challengeIdHash`; an index on (`userId`, `sessionKeyHash`, `purpose`, `verifiedAt`).

- **Single use.** A challenge is consumed by one conditional update (`WHERE id = ? AND verifiedAt IS NULL AND revokedAt IS NULL AND codeExpiresAt > now AND attempts < 5`, one affected row). A replayed verify, an expired code or a sixth try is refused. A new send supersedes the session's pending challenge, and a new verify supersedes its earlier proof, so there is one live proof per (account, session, purpose).
- **A proof is fresh only while all of these hold**, checked on every gate read with the app clock (never MySQL `NOW()`), compared to the second as `sdk.ts:44` does:
  - its `userId` is the request's account id, and its `sessionKeyHash` is the request's session key;
  - `purpose` is `referrer_actions`, `verifiedAt` is set, `revokedAt` is null and `proofExpiresAt` is later than now;
  - `verifiedAt` is later than the account's effective `sessionsValidAfter` and the account is not suspended (the merged values `getUserByOpenId` returns, `server/db.ts:267-277`);
  - the account's profile is verified for exactly `workEmailDomain` (`isVerifiedEmployeeOfCompany`), and `verifiedAt` is not before `profiles.workEmailVerifiedAt`.
- **What invalidates it.** None of this needs a hook in `server/db.ts`; it falls out of the freshness check.
  - Logout and revocation: `revokeUserSessions` moves `sessionsValidAfter`. Both logout routes (`/api/auth/workos/logout`, `/api/auth/otp/logout`) also set `revokedAt = logout`, best effort, for the audit trail.
  - Suspension: `setUserSuspended` sets the flag and `sessionsValidAfter`, so un-suspending never revives an old proof.
  - Employer change: a new `workEmailDomain`, or a re-enrolment that moves `workEmailVerifiedAt`.
  - A new WorkOS session or app session: it has a different key.
- **Exact address.** The address is normalized, and its domain must equal the verified `profiles.workEmailDomain` exactly. Once the account has an address of record (the `emailFingerprint` of its newest verified proof at that domain with `verifiedAt` not before `workEmailVerifiedAt`), the address must match that record exactly. Otherwise the first accepted proof sets the record. This is a check inside one authenticated account. It never identifies, matches or links any other account by domain or by address.

### 0b.4 Endpoints for an already-signed-in person (they never create an account)
New `server/referrerStepUpRoutes.ts`, registered in `server/_core/index.ts` with the same `resolveIdentity` as the private routes. Contracts are Zod schemas in new `shared/referrerStepUp.ts`.
- `POST /api/referrer/step-up/send` `{ email }` → 200 `{ sent: true, challengeId, expiresAt }`.
  - 401 when signed out; the client then uses `referrerSignInHref()`.
  - 403 `{ code: "not_verified_referrer" }` when the profile is not verified; the client goes to `/verify`.
  - 400 `{ code: "step_up_email_mismatch", error: "Use the work email you verified at <company>." }` for a wrong domain or address.
  - 409 `{ code: "session_unbindable" }` only if no session key can be found even after §0b.2's re-sign. It is logged to Sentry, and the client shows "Sign out and sign in again"; it never offers the code login.
  - 429 with `Retry-After`, using the `server/workEmailOtp.ts` limiters (`consumeLimits`) under `stepup-` keys per IP, email, account and globally.
  - 503 and 502 for delivery problems, worded like `/api/auth/otp/send`.
  - Delivery uses `otpEmailMessage` and `sendTransactionalEmail` unchanged.
- `POST /api/referrer/step-up/verify` `{ challengeId, code }` → 200 `{ verified: true, expiresAt }`.
  - 403 `{ code: "step_up_session_mismatch" }` when the challenge's `userId` or `sessionKeyHash` is not the request's own, before the code is looked at.
  - 400 for a wrong, expired or used code (one generic message).
  - 429 for a lock (`activeLockUntil`, `recordVerifyFailure`, `OtpLockedError`).
- **Never, in either endpoint:**
  - call `resolveLoginIdentity`, `saveVerifiedWorkEmail`, `completeWorkEmailOtpEnrollment`, `upsertUser` or any alias, link or merge function;
  - write `profiles`, `users`, `verifiedLoginAliases` or `canonicalPeople`;
  - mint `amr` or a new account's session (send's own-cookie re-sign in §0b.2 is the only cookie).
- Activity rows: `work_email.step_up_sent`, `work_email.step_up_verified` and `work_email.step_up_denied`, carrying the domain only; never the address, the code or the challenge id. Nothing reaches Sentry with a code or challenge id.

### 0b.5 How the gate checks it
`requireWorkEmailSession` and the `/access` verdict go in new `server/referrerSessionGate.ts`. It is used by `server/privateReferralRoutes.ts` (the §4.4 route list and `GET /api/company-referrals/access`, now at `:926`) and by `server/profileRoutes.ts` (`PUT /api/referrer-preferences` only, `:132`). A request passes when **(A)** the session itself is a code session (the identity's own `sessionAmr`, or §0 item 8's same-account code cookie), or **(B)** a fresh §0b.3 proof exists for the request's account id and session key. Otherwise the answer is 403 `{ "error": "Confirm your work email with a code to continue.", "code": "work_email_code_required" }`; the proof lookup is the only read before that refusal.
- `/access` gains `codeRequired: boolean`. It is true only when `verifiedCompanyAccess` is true and neither (A) nor (B) holds. `verifiedCompanyAccess` and `isVerifiedReferrer` keep their meaning, so menus and shells keep their referrer links. `referrerAccessResponseSchema` reads a missing value as `false`.
- `useReferrerAccess` gains the status `code_required` (with `access`).
- Seeker routes and seeker surfaces never call the gate.

### 0b.6 Client (replaces §4.3's sign-in link and §4.5's navigation)
- New `client/src/components/goal/GoalWorkEmailStepUp.tsx` (goal primitives only) and `client/src/lib/referrerStepUpApi.ts`.
  - It shows the line "Confirm you still work at <company> with a code to your work email.", an email field with an `@<domain>` hint, "Send code", a code field and "Confirm".
  - It handles loading, error, rate-limited and offline states.
  - On success it invalidates `referrerAccessKey` and the surface opens in place.
- Each referrer surface renders it in a `code_required` branch: `client/src/pages/MyCompanyInbox.tsx`, `ReferrerImpact.tsx`, `PostOpportunity.tsx`, `Alerts.tsx` (its referral-routing block), `client/src/pages/goal/referrer/GoalReferrer.tsx`, `goal/referrer/GoalReferrerImpact.tsx`, `goal/post-opportunity/GoalPostOpportunity.tsx` and `goal/alerts/GoalAlerts.tsx`.
- On a `work_email_code_required` 403, `authedFetch` (`client/src/lib/threadApi.ts:126`) and `getJson`/`sendJson` (`client/src/components/referrer-home/referrerData.ts:79,94`) invalidate `referrerAccessKey`, so the page flips to the step-up.
- A signed-in person is **never** sent to `referrerSignInHref()` or `/api/auth/otp/*`. That link stays for signed-out people (401) only.
- Not edited:
  - `client/src/pages/UnifiedInbox.tsx`, owned by `D-048-p3-inbox`. With `code_required` its referring side stays hidden (`isReferrer = access.status === "verified"`, `UnifiedInbox.tsx:30`), which fails closed, and the seeker side is unchanged. A step-up prompt there is that row's follow-up after it lands.
  - `AccountMenu.tsx`, `AppShell.tsx` and `GoalAppShell.tsx`.

### 0b.7 Tests to write first (each red on `main` before the change; these extend §6)
1. **Google-first, no new account.** A Google-first account P with a WorkOS Bearer (`sid` S1), verified through `/verify`, with no alias, completes send then verify. Afterwards `/access` returns `codeRequired: false`, `POST /api/company-referrals/:id/claim` passes, and P's existing claims and accepted referrals are still listed for P. The same run proves that no `users`, `verifiedLoginAliases` or `canonicalPeople` row was added or changed, that `resolveLoginIdentity`, `saveVerifiedWorkEmail` and `completeWorkEmailOtpEnrollment` were never called (spies), and that verify sets no cookie.
2. **Different account.** Q's fresh proof, or Q's code cookie, never passes P's gate. P sending Q's `challengeId` gets 403 `step_up_session_mismatch`.
3. **Same company.** Another account R at the same domain, with its own fresh proof, does not pass P's gate. When P has an address of record, P's send to a different address at the same domain gets 400 `step_up_email_mismatch`.
4. **Different session.** A proof made in S1 does not pass P's request in S2 (another `sid`, or another `ssid`). A verify from S2 for a challenge sent in S1 gets 403. App-cookie renewal keeps `ssid`, so the proof survives a renewal in the same session.
5. **Expired or replayed.** A proof older than 12 hours fails. A code older than 10 minutes fails. The same `challengeId` and code a second time fails. The sixth wrong try is refused and the lock answers 429.
6. **Invalidation.** Each of these leaves the next referrer action with 403 `work_email_code_required` and `/access` with `codeRequired: true`: logout through either route, `revokeUserSessions`, suspension (and an old proof stays dead after unsuspension), an employer change (a new `workEmailDomain`), and a re-enrolment that moves `workEmailVerifiedAt`.
7. **Seeker access unchanged.** In the same session, P's seeker routes and seeker screens work with no step-up. Signed-out `/api/auth/otp/send|verify` behaves exactly as on `main`, and §6 item 6's controls stay green.
8. **Pins.** §0 item 8's three cases and §6 items 1 to 5 still hold. In item 5, "sends the user to the referrer sign-in" now reads: a signed-in person sees the step-up in place; a signed-out one is sent to `referrerSignInHref`.

### 0b.8 Owned paths and the conflicts recorded on this row
The build edits exactly these paths: the no-conflict paths, then the four conflict paths named after them.

**No-conflict paths:**
- `server/_core/sdk.ts`, `server/_core/otpLogin.ts`, `server/_core/reviewerLogin.ts`, `server/_core/devAuth.ts`, `server/_core/workosAuth.ts` (Bearer `sessionKey` and the logout revoke only);
- `server/profileRoutes.ts` (the `PUT` only);
- the new `server/referrerStepUp.ts`, `server/referrerStepUpRoutes.ts` and `server/referrerSessionGate.ts`;
- `shared/referrerAccess.ts` and the new `shared/referrerStepUp.ts`;
- `client/src/hooks/useReferrerAccess.ts`, `client/src/lib/threadApi.ts`, `client/src/components/referrer-home/referrerData.ts`, the new `client/src/lib/referrerStepUpApi.ts` and the new `client/src/components/goal/GoalWorkEmailStepUp.tsx`;
- the eight surface files in §0b.6;
- the new migration `drizzle/deploy/<next>_referrer_step_ups.sql`;
- tests beside each file (with the alerts surface test narrowed to `client/src/pages/alerts.stepUp.test.tsx` per D-265, keeping `alerts.test.tsx` with `DECISION-COPY-oct26`);
- docs: this packet, the AGENTS.md living-map rows for auth and the referrer gate, and the plan §3b row and §5.
- the e2e session fixture paths `e2e/fixtures.ts` and `scripts/seed-test-accounts.ts`, limited as §0b.8a says (added Oct 31; nothing else under `e2e/` or `scripts/`).

**Owned by other live rows; recorded here, no new task:**
- `server/privateReferralRoutes.ts` is owned by `D-090-BYOR` (todo, draft PR #632, review findings `b8552f96`) and by every row of the chain that waits for it: `P0-referral-access-availability`, `D-132-item3`, `D-174-held-ask-reconfirm`, `D-174-ask-from-job` and `D-174-pool-nudges`.
- `server/_core/index.ts` is owned by `D-090-BYOR`; `D-132-item3` and `D-099-bonus-pages` hold it switch-only.
- `drizzle/schema.ts` and `server/schemaReconcile.ts` are owned by `D-090-BYOR` and `D-099-bonus-pages`.

**Sequencing recorded (D-246, CEO, Oct 30).** This row goes first, and its `owns` in `docs/plans/assignments.json` are now this whole list, so `scripts/scope-check.mjs` enforces it. The four shared paths are owned narrowly: `server/_core/index.ts (switch only)`, which allows step-up route registration plus the dev wrapper's two copied fields, 12 lines at most; `server/privateReferralRoutes.ts`, limited to the middleware, the route list and the `/access` verdict; and `drizzle/schema.ts` and `server/schemaReconcile.ts`, limited to the additive `referrerStepUps` table. The register has no additive-only form, so those three are full entries and the reviewer checks the limits. `D-090-BYOR` waits for this row, and its chain waits through it. This is a **limited handoff of those four files, for this build only**. #632 keeps its code, findings `b8552f96` and holds, and is not edited by this build. Its holder was asked to push any unpushed work on the four files (https://github.com/ayodhyamohanthy/skipwaitmanus/pull/632#issuecomment-6524431308). Before you edit any of the four, re-read that thread and #632's head. If the holder reports unpushed or mid-edit work there, or #632 has a new push touching them, stop and `--report blocked "D-057-session-gate: overlap with D-090-BYOR on <file>"` with the exact hunk. Never edit around it or take the file over (D-246 (4)). Changes to `server/privateReferralRoutes.ts` stay limited to the middleware, the route list and the `/access` verdict.

**Deliberately not edited (owned elsewhere):**
- `server/db.ts`: reads only through existing exports;
- `server/workEmailOtp.ts` (`FIX-device-signin`, `D-100.otp-hmac`): imports only;
- `server/emailDelivery.ts` (`REL-review-email-retry`): imports only;
- `server/workEmailOtpPurge.ts` (`REL-ops-invariants`): purging step-up rows is a follow-up for that row, and the address of record must outlive any purge;
- `client/src/pages/UnifiedInbox.tsx` (`D-048-p3-inbox`).

### 0b.8a Owns amendment, Oct 31: the e2e session fixture (conflict 8 on #867)
**Source.** Instinct's answer on the coordination thread, PR #811 comment 6537600491 (https://github.com/ayodhyamohanthy/skipwaitmanus/pull/811#issuecomment-6537600491), choice A of Hark · e9cd's question 6537588308. It is recorded through this docs/registry-only amendment (D-200 (2): any session may change a row and says why in its pull request). It adds no decision ID, no row and no rewrite of D-245 or D-246. This subsection sits here, not in §8a, because §8a exists only on #867's branch; #867 lists the same problem as its §8a item 8, and this subsection answers it.

**The conflict.** On PR #867 head `83abf39a`, the e2e journeys `personal-link.e2e.ts` ("a personal link survives sign-in") and `queue-attestation.e2e.ts` ("the attestation is shown before Accept") fail. `e2e/fixtures.ts` signs the seeded verified referrer (`qa.referrer@acme.example`) in with the plain `app_session_id` cookie that `scripts/seed-test-accounts.ts` mints (`loginMethod: test_seed`, no `amr`, no step-up proof). The new gate refuses that session with 403 `work_email_code_required`. **That refusal is correct, and the gate is not weakened to make it pass.** Unit, route, build and tsc are green on that head. The two journeys sat outside this row's `owns`, and `GATE-e2e-journeys`, the former owner of `e2e/`, is `done`.

**What `owns` now adds.** Exactly `e2e/fixtures.ts` and `scripts/seed-test-accounts.ts`. The rest of `e2e/` (journey files, `playwright.config.ts`, `.auth/`) and `scripts/e2e-server.mjs` stay unclaimed by this row. If the repair turns out to need any of them, or a server-side seam for local delivery interception, that is a new conflict. Record it on this row and ask Instinct on #811; never edit around it.

**How the fixture is repaired (binding):**
- The fixture gets the seeded referrer's referrer access **through the real local step-up path**: `POST /api/referrer/step-up/send`, then `POST /api/referrer/step-up/verify`. The code comes from delivery intercepted **locally** (the e2e stack's in-process mail capture, never a real provider call). The proof it gets is the same account- and session-bound §0b.3 proof a real person gets.
- `test_seed` stays a test identity. The seeder does not relabel it as a real work-email login. It mints no `amr: "work_email_otp"` for it, writes no alias, link or merge, and adds no production bypass, flag or environment switch that skips the gate.
- **Direct test setup** (writing a proof row or minting a cookie by hand) is allowed only if the real send/verify path cannot be driven from the harness. The PR must show why, keep it inside the local test harness (the seeder needs an explicit `DATABASE_URL` and says never production, and `scripts/e2e-server.mjs:36` refuses any database host but localhost), and prove that it cannot change production authorization: no code path in `server/` or `shared/` reads it, and the production build is byte-identical in its auth paths. A missing proof must still be refused.

**Red-first controls (required, each shown red before the repair and green after):**
1. The original plain seeded `test_seed` session is denied: 403 `work_email_code_required` on a referrer action, and `/access` returns `codeRequired: true`.
2. The same account and the same session, after a valid step-up proof, succeeds.
3. Another account's or another session's proof, or a revoked or expired proof, stays denied.
4. `personal-link.e2e.ts` and `queue-attestation.e2e.ts` both pass, with no assertion weakened, removed or skipped, and with the gate unchanged.

**What this does not do.** It does not release the #867 shared-file hold or any other hold, and it does not touch #867's branch. It changes no other conflict decision, the login or identity invariants, or D-246's sequencing (`D-090-BYOR` still waits for this row; #632 keeps its code, findings and holds). It authorizes no production migration and no provider call. Runtime edits to the two paths wait until this amendment has passed an independent scope review and landed. The session that authored it (Hark · e9cd) neither reviews nor lands it.

### 0b.8b Bounded existing-flow completion scope, November 9

This amendment resolves scope conflicts 2 and 9 recorded on PR #867, not a new login or product decision. It implements the existing §0b.6 requirement to step up in place. Conflict 1 is addressed only through the conditional temporary serialization in §0b.8c. Runtime work waits until this docs/registry amendment has passed an independent scope review and landed.

- Shell navigation is limited by §0b.8c below, not a blanket shared-file grant.
- Add `client/src/pages/EmailReviewAction.tsx` and `client/src/pages/goal/email-review/GoalEmailReviewAction.tsx`, limited to handling `work_email_code_required` through the ordinary access verdict and in-session step-up, then retrying the same review link without changing account. Both kit and goal variants must preserve the recipient/token authorization, acceptance and decline behavior, privacy and signed-out work-email sign-in. The original surface owner `D-048-p3-email-review` is done. Do not activate its goal flag or edit other email, delivery or decision routes.
- Red-first tests are dedicated new files: `client/src/pages/emailReviewAction.stepUp.test.tsx` and `client/src/pages/goal/email-review/goalEmailReview.stepUp.test.tsx`. Keep existing tests intact. Prove signed-in `code_required` email review reaches step-up, never standalone code sign-in; successful step-up retries the same link and account; signed-out, unverified, expired/unavailable link and seeker controls remain unchanged. Do not invent a broader test glob.
- Add only `design/goal-ui/captures/d057-session-gate/**` for sanitized current-head 1280/390 proof and a manifest naming the exact head, route, viewport, test identity and actual versus simulated authentication. No tokens, credentials, personal data or private logs. A simulated cookie is not proof of actual Google sign-in.

No row, dependency, FIFO position or `syncedTo` changes. D-308 still governs freshness. This amendment does not settle fingerprint-digest, installation or activity-test findings, waive the conditional four-file serialization below, replace fresh independent exact-head review and CI, or assert browser acceptance. Migration 0116 was separately applied and verified on November 9; production authority and proof are not created by this scope record. No spending, settings, real mail/payment testing, legal text, frozen policy or gate weakening is granted.

### 0b.8c Conditional temporary navigation handoff and stale operational hold resolution, November 9

This is Instinct's bounded coordination resolution under the standing build/coordination instructions, not a new owner answer, an old holder ACK, a product-policy change or proof of an empty workspace. It becomes usable only after this amendment passes separate scope review and lands, and the entry checks below actually pass. Registering conditional scope is not recording those checks as complete.

**Actual named continuation.** Fresh origin read confirms `Fix claim D-057-session-gate: Qoder · f679`, commit `e84e4d4a33d06535cd6f7ff5cc130fd20b94e140`, 9 Nov 14:31:59 IST, on `agent/review/d057-session-gate`. Existing implementation branch is `agent/queue/d057-session-gate`, snapshot `e4fe0ae56ed61ea0d98f224f611c240af1846819`; main snapshot `4281c9dae2491afe6c43cba716cfb995e7c3dfe4`. The label is a recorded session identity, not independently verified model lineage. Its actual workspace, clean/dirty state and unpublished work are UNKNOWN, not inferred from the marker. No other dispatched session may duplicate this claim.

**Entry before disputed runtime writes.** The actual current holder records a repo-safe workspace label, branch/head, clean/dirty and unpublished/mid-edit status on #867, including the affected paths. Fetch all relevant current claim/work/heartbeat refs and re-read #632, #666 and #767. Confirm the named D-057 holder still owns this stage; a new claimant or newer conflicting push pauses only the affected scope for fresh coordination. Preserve all existing local work; no reset, delete, force-push or replacement branch. Record the exact intended hunks against current main. Unknown earlier unpublished state stays unknown: this resolution is not consent from those holders. Any discovered conflicting unpublished or mid-edit hunk stops that overlap for a real limited handoff; never overwrite it.

**Four-file stale operational hold.** The October 30 hold in #867 comments 6525962453 and 6527540631 was Instinct's operational coordination hold pending BYOR acknowledgement. No acknowledgement has been recovered from the full current #632 thread. Current preserved #632 source is `d9e589c599db1131a66d9cfe81017b3b445cb7d2`; last work Oct 30 and remote heartbeat Oct 24 do not prove no unpublished work. The indefinite requirement to recover that old session's acknowledgement is now replaced, solely for the existing additive D-057 changes and normal current-main composition, by the explicit entry checks and preservation in this section. This is a stale coordinator-hold resolution, NOT a holder ACK. No additional runtime hunk in `server/privateReferralRoutes.ts`, `server/_core/index.ts`, `drizzle/schema.ts` or `server/schemaReconcile.ts` is granted. Preserve #632's original branch, code, findings and holds. A fresh independent reviewer must compare the resulting exact head with current main and #632 at that hash, verify both sets of hunks survive, and reject unrelated or overlapping edits. Any new runtime change to those four files needs its own limited coordination before editing. The production 0116 prerequisite is separately verified, not granted here.

**Temporary shell ownership, not a new feature or re-plan.** D-057 receives only `client/src/components/AccountMenu.tsx`, `client/src/components/AppShell.tsx` and `client/src/components/goal/GoalAppShell.tsx` to preserve the existing server-verified referrer's navigation when access is `code_required`, plus three NEW tests `client/src/components/accountMenu.stepUp.test.tsx`, `client/src/components/appShell.stepUp.test.tsx` and `client/src/components/goal/goalAppShell.stepUp.test.tsx`. No new link destinations, identity or access permission; verified employment and fresh session proof remain separate. Do not change the hook's status semantics, GoalShell, prices, referral counts, layouts, language mounts, goal-boundary registration, consent or release flags. Tests go red first for the lost links and signed-in standalone-sign-in trap, then green; signed-out/unverified/seeker controls remain unchanged.

- Preserve shell-parts branch `agent/queue/d048-f-shell-parts` at `7d6d6498c54519a4b637f4fffd9aed51ba2d45c9`, pricing branch `agent/pricing/banded-plans-oct25` at `5116c11495d9971b8b9576e7cf1fca463341e7ef`, and every other existing branch, commit, finding and unknown local artifact. Their owner/product acceptance holds remain. This resolution does not adopt or land those PRs.
- The registry temporarily removes only AccountMenu from D-048-F-shell-parts and D-093.menu; AppShell from PRICING-banded-oct25, D-222-referral-count-shell and D-093.mount; GoalAppShell from D-093.mount. Other owns, row ids/branches/statuses/dependencies, FIFO order and product holds are unchanged. This is explicit temporary serialization, not silent removal of the original deliverable or a blanket takeover. No dependency is added to make validation pass.
- **Return conditions:** after D-057 lands, a separately reviewed docs/registry restoration returns these exact entries to their original rows and removes the temporary shell entries from D-057. Before any former owner resumes runtime work on a transferred file, it must normally merge current main including the D-057 result, retain both its original deliverable and the gate/navigation fix, record the integration, and pass its normal review/tests. Restore scope before that runtime continuation, not retroactively. If D-057 is handed off, abandoned or remains stalled, Instinct first reconciles actual unpublished work and records an explicit reviewed return or new bounded handoff; no permanent silent capture of scope.

No frozen product, real-money, legal, account/settings, production or provider-call permission is added. No false identity, retroactive consent, pass/green marker or bypass is authorized. An old review does not pass the new composition; exact-head independent review, required CI, full browser acceptance and live verification remain required.

### 0b.9 Definition of done (adds to §7)
- Tier 1 draft PR with an independent review (D-151). The builder `Hark · 450f`, and any fixer, never reviews or lands it.
- The production migration is applied and verified before the schema-dependent code reaches `main`.
- **The full browser path is shown before the fix is called done**, captured at 1280 and 390 from a clean browser on the QA account:
  1. Google sign-in.
  2. Verify a work email on `/verify`.
  3. `/queue` shows the step-up.
  4. Send the code and confirm it.
  5. The queue opens with the same account's history, with no second account (the account id is shown before and after).
  6. A reload keeps it open.
  7. Logout, then sign in again: the step-up is asked again.
  8. A signed-out work-email sign-in still works.
- Live: a WorkOS session with no proof gets 403 `work_email_code_required` on `POST /api/company-referrals/:id/claim`, and the same session after the step-up gets through.

## 1. Goal
A person who verified a work email is a verified referrer for every session they hold, including a Google session from their seeker side. D-057 says the referrer side needs a fresh proof of employment, a work-email code, in the same session. After this packet:
- referrer surfaces in any other session show the in-session work-email step-up (§0b.6) instead of the queue, and never the standalone code sign-in;
- every referrer action route refuses such a session on the server until a fresh step-up proof for that account and that session exists (§0b.3, §0b.5).

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
   - `useReferrerAccess` treats `code_required` like unverified for rendering. Every referrer surface listed in §0b.6 renders the in-session step-up (`GoalWorkEmailStepUp`) with the line "Confirm you still work at <company> with a code to your work email."; the referring side of `/inbox` stays hidden until that row adds the prompt (§0b.6). A signed-in person is never sent to `referrerSignInHref`.
   - Seeker-side surfaces are unchanged.
4. **Enforcement.** A route middleware `requireWorkEmailSession` answers 403 `{ "error": "Confirm your work email with a code to continue.", "code": "work_email_code_required" }` for a session without the claim, before any database call. It applies to every referrer action route.
   - Enumerate them in `server/privateReferralRoutes.ts` as the handlers that call any of: `claimCompanyReferralRequest`, `oneClickReviewReferralRequest`, `reviewReferralRequest`, `resolveReferrerReviewEmailLink`, `consumeReferrerReviewEmailLink`, `saveCompanyReferralRequest`, `getUnclaimedCompanyReferralPreview`, `listCompanyReferralInboxByState`, `getClaimedCompanyReferralDetail`, `openCompanyReferralAvailability`, `updateReferralProgress` (when the actor is the referrer), `publishCompanyOpportunity`, `renewCompanyOpportunity`, `closeCompanyOpportunity`, `updateReferrerPreferences`, the Slack webhook routes, `getOrCreateReferrerFastTrackLink`, and the referrer impact and home bundle.
   - Pin the resulting list in a test that fails when a route calling one of those functions is neither on the list nor on an explicit allowlist with a reason.
5. **Client.** On a `work_email_code_required` 403 from any referrer action, the client invalidates the referrer-access query so the page shows the in-session step-up (§0b.6); it never navigates a signed-in person to `referrerSignInHref`. Add it once in the shared referrer fetch helpers (`client/src/lib/threadApi.ts` `authedFetch`, `client/src/components/referrer-home/referrerData.ts` `getJson`/`sendJson`).
6. **Deploy effect.** Existing referrer sessions lack the claim, so every referrer enters a code once after deploy. That matches D-049 ("on every visit"); say so in the row.

## 5. Files
- **In scope:** the exact list, and the paths owned by other rows, are in §0b.8, which wins over this list.
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
5. On that 403 a signed-in person sees the in-session step-up and returns to the same page after it; a signed-out person (401) is sent to `referrerSignInHref` (§0b.7 item 8).
6. The controls stay green: `client/src/pages/loginRule.test.tsx`, `signIn.test.tsx`, the referrer OTP tests (`client/src/pages/referrer.otp.test.tsx`), `server/_core/otpLogin.test.ts`.

## 7. Definition of done
- [ ] Gate.
- [ ] Draft PR plus independent review (session security).
- [ ] Screens of the code-required state at 1280 and 390, and the full browser path of §0b.9.
- [ ] Push; API CONVERGED.
- [ ] Live: a WorkOS session gets 403 on `POST /api/company-referrals/:id/claim` (QA account).
- [ ] Row done.

## 8. Stop and ask if
A referrer action route cannot be reached in a code session or after a step-up (for example, a link opened from email lands signed out): stop and describe the flow. Never weaken the gate. Any remaining conflict (ownership, a test the step-up cannot meet, a path not in §0b.8) is recorded precisely on this row's status line and reported blocked, never as a new overlapping task (D-245).

### 8a. Conflicts recorded on this row (Hark · 450f, Oct 30, code head `571543dd`). Each needs a ruling from a different eligible session; the builder makes none of them
1. **Shells drop the referrer links in `code_required`.** `AccountMenu.tsx`, `AppShell.tsx` and `GoalAppShell.tsx` (with `GoalShell.tsx`, which they feed) key the referrer links on `access.status === "verified"`, so a `code_required` person loses the Queue/Impact links and instead sees the signed-out "Give a referral · Work email only" link to `referrerSignInHref()` (local captures 01, 02, 07–10). Following it from a signed-in session would start the standalone code login that §0b.6 forbids. The files are outside `owns`, which conflicts with §0b.5 ("menus and shells keep their referrer links").
2. **Email review page refuses instead of stepping up in place.** `GET /api/referrer-review-links/:linkToken` is gated, but its page (`/email-review/:linkToken`, `EmailReviewAction`) is not in `owns`, so a personal-login session sees a plain refusal there, not `GoalWorkEmailStepUp`.
3. **`codeHash` binds the fingerprint.** It is SHA-256 of `<challengeId>:<emailFingerprint>:<code>`, not of the raw address as §0b.3's table says; the address never enters the hash. Ruling needed on whether that stands.
4. **Kit pages render their goal variant in `code_required`.** `Alerts.tsx`, `PostOpportunity.tsx` and `ReferrerImpact.tsx` (kit pages) render the goal `GoalWorkEmailStepUp` in their `code_required` branch; there is no kit step-up.
5. **Gate installation in `server/_core/index.ts`.** The gate is installed through `registerReferrerStepUpRoutes` (index.ts +4/~1, inside the 12-line switch-only limit), not inside `server/privateReferralRoutes.ts`.
6. **Item 1's test was widened** to allow the `work_email.step_up_denied` activity row.
7. **Migration `0116_referrer_step_ups.sql`** must be applied and verified in production before this lands (AGENTS.md deployment rules). Not done by the builder; it was applied only to the local e2e MySQL (`schemaDeployMigrations` row present, replay idempotent).
8. **e2e journeys (`main`'s GATE-e2e-journeys) are red on this branch, by design of the gate.** `e2e/fixtures.ts` signs the "seeded verified referrer" in with the cookie `scripts/seed-test-accounts.ts` mints (`loginMethod: test_seed`, no `amr`, no step-up proof). The gate answers it 403 `work_email_code_required` (reproduced locally: `GET /api/referrer-fast-track/me` and `/api/company-referrals/inbox` 403, `/access` `codeRequired: true`), so `personal-link.e2e.ts` ("a personal link survives sign-in") and `queue-attestation.e2e.ts` ("the attestation is shown before Accept") fail in run 41077773220. Both files are outside `owns`. The fix belongs to the fixture or the seeder (for example, the seeder mints the QA referrer's cookie as a work-email code session, or the fixture completes `/api/referrer/step-up/send|verify`); the gate is not weakened.
9. **No capture path.** Neither this packet nor `owns` names a path for the §0b.9 captures, and `scripts/scope-check.mjs` refuses any committed file outside `owns` (only this packet is exempt). The 38 captures and `manifest.json` are kept outside the repo until a path (for example `design/goal-ui/captures/d057-session-gate/**`) is added to `owns`.
10. **Not this row, noted for the reviewer:** on a local build `/verify` and `/sign-in` render their kit variants (their goal surfaces are not in `RELEASED`); both are outside `owns`.

### 8b. Browser path evidence (local e2e stack only: MySQL 127.0.0.1:3307, ZeptoMail intercepted in-process; never production)
App at head `dfc555b9` (the `571543dd` contract fix changes no screen). Google-first account P (id 42, `loginMethod: google`, app cookie with a hosted `sid` as `workosSession.ts` mints it; no WorkOS keys locally). Each capture at 1280 and 390, full page:
- `00a`/`00b` `/verify` (kit) → P verified at wipro.com; `/access` `codeRequired: true`; `POST /api/company-referrals/1/claim` 403.
- `01` step-up prompt on `/queue` · `02` code sent · `03` code entered · `04` queue unlocked (`/access` `codeRequired: false`; the same claim now reaches the route, 409 "no longer available") · `05` reload stays open. Account id 42 before and after; `users` 29 → 29, `verifiedLoginAliases` 0 → 0, `canonicalPeople` 0 → 0, no `workemail_` account; one proof row (userId 42, `referrer_actions`, wipro.com, 12 h).
- `06` after logout (old cookie 401) · `07` sign in again (new `sid`, same id 42): step-up asked again, claim 403 · `08` wrong code · `08b` resend inside the 30 s cooldown ("Wait a moment…") · `09` expired code (same generic refusal); `/access` stays `codeRequired: true`.
- `10`–`12` P's seeker pages (`/requests`, `/ask`, `/explore`) in the code-required session: no step-up, `/api/company-referrals/mine` 200 · `13` seeker Asha `/requests`.
- `14`–`16` signed-out work-email sign-in (`ravi.kumar@wipro.com`): code login lands on `/queue` open for his own account, `codeRequired: false`.
- No page errors and no 5xx in any context. Step-up screens and the queue are goal-native (goal primitives); `/verify` and `/sign-in` are kit (item 10); the shell link is item 1.

## Status
- Nov 9 (UTC ~13:4x): LANDED pending merge — independent pass recorded on 0d4845f9 (Dev (Skydive) · 778c; scope 70 owned paths, tsc/token/decision-id/migration-lint/deploy-trigger clean, 184+22+14 focused tests green, red-first spot-verified on main, build green); candidate 663a19dd is that reviewed head merged with main 0d4845f9's successor bb2897ff (merge-only delta). Status commit sets row done; landing per D-082 waits for every check green on the pushed head and main CI green.
- Nov 1: D-265 (Antigravity · 88b9): owns narrowed from `client/src/pages/alerts*.test.tsx` to `client/src/pages/alerts.stepUp.test.tsx` (the test file introduced by this row), keeping `alerts.test.tsx` with `DECISION-COPY-oct26`.
- Nov 1: **parked at `owner` by D-268** (DeepSeek V4.1 Flash Free · abdf). The Tier 1 pass is real and names head `e4fe0ae5` exactly (marker `fddd21e2`), and three of four required jobs are green there. The row still cannot land: the branch is 263 commits behind `main` and a normal merge of current `main` conflicts in this packet, so every landable head is a new commit needing a fresh independent review - and every such head ships `drizzle/deploy/0116_referrer_step_ups.sql`, which a push to `main` applies as a production migration (`migrate-db`). §0b/§1 line 49 and line 180 already require that migration applied and verified first, §8a item 7 records it exists only on the local e2e MySQL, and no recorded decision authorizes it. Waiting on the owner's one-line migration go; nothing is built, pushed or re-reviewed here, and no marker, pass or hold is changed.

- Nov 9: D-308 source qualification supersedes only D-268's unsupported owner-pause attribution and blanket preparation hold. Row returns to todo in place, synced to D-308; no new row or competing writer. Original Oct 31 owner messages asked for coordination/collaboration, not a production or migration pause. Ordinary existing-holder current-main preparation and fresh exact-head review may continue without asking for a pause lift. The previous Status remains historical, not a current prohibition on preparation. Actual database target/schema/ledger/pending migrations and safe execution must be checked before any production mutation. Migration 0116 must still be applied and verified before schema-dependent code reaches main; no merge to trigger the all-pending applier as a shortcut. Shared-file constraints, D-265 ownership, full browser path, independent review, required CI and all unrelated holds remain. No production write, spending, settings change, marker or release clearance is supplied by this correction. Current evidence and receipt route: PR #867 comment 6735943568.

- Nov 9: **current-main composition ready for a fresh independent review** (Qoder · f679, fix stage). Merge of `main` `6397dea2` into `e4fe0ae5` is `5bbaa0e3`; the only conflict was this packet, resolved by keeping §8a/§8b and appending main's `## Status`. No runtime, test, gate or `owns` line changed by the resolution, and main touched none of this row's shared files since `e4fe0ae5` (`git diff e4fe0ae5 --` on the four shared paths is empty). §8a item 7 is satisfied ahead of landing: `0116_referrer_step_ups.sql` was applied alone to the verified production database and checked column/index/FK-by-column with its ledger entry read back (PR #867 comment 6735943568, Nov 9 14:27 IST), so the migration-before-schema-code order stands. CI on `5bbaa0e3` (run 42592372118): Typecheck, Design tokens, Deploy trigger coverage, unit + component + route, e2e journeys, production build and Workers all pass; `typecheck` is red only at step 11 "Review gate (independent Tier 1 pass)" because this head has no pass yet. Local: `pnpm check`, `pnpm build`, `node scripts/design-token-audit.mjs`, `node scripts/scope-check.mjs --branch` (59 owned paths) and 189 focused tests across the step-up, gate, session-key, seeder-fixture, client step-up and login-rule files pass. The old pass `fddd21e2` is not a pass on this composition (D-308); next stage is REVIEW on `5bbaa0e3`. The §8b browser-path evidence was taken at `dfc555b9`; the later commits change the gate's request-id parsing, the e2e fixture/seeder and this packet only, so no screen changed since. No e2e stack (MySQL/Docker) exists on the fixer host, so the journeys are proven by the CI run above, not locally.
