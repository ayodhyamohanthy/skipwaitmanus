# Packet DEVICE-SIGNIN-passkeys: device-saved sign-in (passkeys and automatic prompts)

| Field | Value |
|---|---|
| Row | `DEVICE-SIGNIN-passkeys` (Tier 1, lane `auth-device`) |
| Branch | `agent/queue/device-signin-passkeys` (fresh; nothing of it rides `agent/queue/fix-device-signin`) |
| Decisions | D-172 (the device prompt appears on its own when sign-in is needed), D-209 (this row, its scope and its two owner questions), D-030/D-049/D-057 (login rule), D-095 (one tap wherever possible), D-151 (Tier 1 review), D-204 (free tools first) |
| Status | registered; **the build waits for the owner's two answers** (D-209 (4)). No code yet. |

## Why this row exists

The owner reported that device-based sign-in does not populate, and asked for the
saved-credential / biometric experience big consumer apps have, on phone and
laptop, for new and returning users. Two parts belong to
`docs/DEVICE-SIGNIN-REQUIREMENTS.md` (Oct 25, PR #667) and D-172; one part (the
remembered email and the code autofill) is `FIX-device-signin` (PR #655) and is
not repeated here.

`FIX-device-signin` was blocked on "keep it limited, or expand it?" (Cue GPT ·
8176). D-209 answers that: an added sign-in method changes the login rule, which
only the owner may change, so it becomes **this** row instead of growing that
fix. Nothing in this row may be built inside another row's branch.

## Already decided by the owner

1. **Behavior (D-172).** On phone and laptop, where the platform supports it, the
   device's saved credential is offered without the person hunting for a menu; an
   existing valid session goes straight through.
   Guardrails: the device still confirms identity, no prompt interrupts anonymous
   browsing, no second identity store, enrollment only for an authenticated user,
   and D-030/D-049/D-057 stand.
2. **Mechanism (owner, Oct 25).** SimpleWebAuthn (`@simplewebauthn/server` +
   `@simplewebauthn/browser`, MIT) for native passkey sign-in on skipwait.me
   (`docs/IMPLEMENTATION-BACKLOG-oct25.md` §5 and decision-log item 3: "no
   payment or identity bypass, no native-domain waiver, no forced prompts;
   security review and real device testing required before launch"). Google One
   Tap stays an independent path.
3. **No paid provider.** WorkOS's hosted-UI passkeys and its custom domain
   ($99/month) are excluded (D-031/D-204). Sign-in stays on skipwait.me (D-030).

## Open, and blocking the build (D-209 (4))

- **(a) Referrer passkeys.** May a verified referrer add a passkey to the same
  account, or does the work-email code stay the only way in because that code is
  the work-email proof (D-057)? **Default until the owner answers: no referrer
  passkey.**
- **(b) Sign in with Apple.** D-030 lists Google, Microsoft, GitHub, LinkedIn and
  Slack. Adding a provider is the owner's call. **Default until the owner
  answers: no Apple provider, no Apple client secret.**

Nothing in this packet may implement (a) or (b) on a default.

## Scope, in the order it should land

**Phase A — session restore and the automatic offer on arrival.**
A valid session lands signed in with no prompt. A signed-out visitor is never
interrupted while browsing: the offer appears where sign-in is actually needed
(a surface that requires an account), not as a modal on the landing page. Where
the browser supports it, the saved-email prefill from `FIX-device-signin` and the
browser's own credential UI carry the first step.

**Phase B — passkeys for seekers (SimpleWebAuthn, native page).**
Enrollment only from an authenticated seeker session (account settings and,
once, a post-sign-in offer). Server-side challenge generation and verification,
origin-bound to `skipwait.me`; one passkey per credential with its own name,
listed and revocable by the person. Sign-in adds a "Use a passkey" action beside
the existing social and email-code methods; the code path never disappears. A
dismissed, failed or unavailable ceremony falls back to the normal page with no
error noise.

**Phase C — the provider's automatic prompt (Google One Tap / FedCM).**
Only where the platform and the production OAuth client allow it, behind the same
"sign-in is needed" trigger; dismissal is remembered for the session. No prompt
for a person already signed in.

**Phase D — blocked.** Referrer passkeys and Sign in with Apple wait for the
owner (above). Do not pre-build them behind a flag.

## Guardrails (binding)

- D-030/D-049/D-057 unchanged: sign-in on skipwait.me, no authkit.app page, and
  the referrer plane keeps work-email code only. The login-rule pins
  (`client/src/pages/loginRule.test.tsx`, `signIn.test.tsx`, `GoalSignIn.test.tsx`)
  stay green and gain a pin for "no passkey button on a referrer surface".
- No forced biometric prompt can exist; never claim one. Copy says what the
  device actually did.
- No second identity store: a passkey is a credential on the canonical person,
  never a new account. Account-linking rules (D-057) are untouched.
- Everything is free (MIT library, no paid tier); no new paid service (D-031,
  D-204).
- Server-side verification only: no credential decision in the browser, replay
  and challenge single-use, rate-limited, and every failure logged with a plain
  user-facing message (silent failure is a defect).
- The switch is an in-code constant, off until QA (D-097). One method lands at a
  time; no silent global enable.

## Accept (proof before "done", AGENTS.md rule 8)

- Red-first tests: no prompt for a valid session; no prompt that interrupts
  anonymous browsing; unsupported browser gets today's page unchanged; expired or
  revoked session never auto-signs in; a dismissed prompt falls back; login-rule
  pins including the new referrer pin green.
- Real device/browser evidence, captured not asserted: enroll, sign out, land,
  sign in with a passkey on iOS Safari, Android Chrome and desktop Chrome at 390
  and 1280, plus one unsupported-browser run showing the normal page.
- Security review written down: challenge lifecycle, origin binding, revoke
  path, and what happens when the platform credential was deleted on the device.
- Owner decision recorded for (a) and (b) before either ships.

### Written Security Review (SimpleWebAuthn native passkey implementation)

1. **Challenge Lifecycle & Ceremony Isolation:**
   - Server-side generation using `@simplewebauthn/server` (`generateRegistrationOptions`, `generateAuthenticationOptions`).
   - Every challenge is persisted to `passkeyChallenges` with a 5-minute TTL (`expiresAt`).
   - For login options, an exact `ceremonyId` is returned to the client and required on verify, preventing challenge collisions or concurrent unauthenticated request invalidations.
   - Challenge consumption (`consumePasskeyChallenge`) atomically queries and deletes the row, guaranteeing single-use protection against replay attacks.
   - Expired challenges are swept on write and rejected immediately on verification attempt.

2. **Origin & Relying Party Binding:**
   - RP ID is strictly validated against `PASSKEY_RP_ID` (defaulting to `skipwait.me`).
   - Origin is strictly validated against `PASSKEY_ORIGIN` (defaulting to `https://skipwait.me`).
   - Browser client credentials cannot be replayed or used against different origins or relying parties.

3. **Rate Limiting & Denial of Service Protection:**
   - In-memory client IP rate limiter (`checkPasskeyRateLimit` using `resolveTrustedClientIp`) caps unauthenticated requests at 10 requests per minute per IP, responding with 429 when exceeded.
   - Table size is bounded by challenge expiry and atomic deletion upon consumption.

4. **Revocation Path & Credential Management:**
   - Authenticated seekers can inspect their registered devices via `GET /api/auth/passkey/list`.
   - Any registered passkey can be immediately revoked via `POST /api/auth/passkey/revoke` by credential ID, deleting the public key from `passkeyCredentials`.
   - Revoked credentials fail authentication immediately upon subsequent sign-in attempts.

5. **Deleted Device / Platform Credential Lifecycle:**
   - If a credential is removed from the user's platform authenticator (e.g., deleted from Apple Keychain or Google Password Manager), WebAuthn prompts in the browser fail gracefully with cancellation or unknown credential.
   - The user seamlessly falls back to standard personal email code or social login with zero data loss and no account lockout.

## Status

- **Nov 16, 2026 (Gemini · 42c3): review findings F1–F9 resolved on PR #697 (`agent/queue/device-signin-passkeys`).**
  - **F1 (Scope check):** Registry amendment D-337 landed in PR #1200; `scope-check.mjs` passes with 15/15 owned paths.
  - **F2 (Referrer exclusion):** Tested red-first; `isReferrerAccount` refuses accounts with verified work email access or `workemail_*` prefix (403 on register, 400 on login verify); `createSessionToken` not called.
  - **F3 (Rate limiting):** In-memory IP rate limiting implemented using `resolveTrustedClientIp`, capping rapid requests at 10/min with 429 responses; pinned by tests.
  - **F4 (Ceremony isolation):** `login/options` issues a unique `ceremonyId` consumed on verify; concurrent ceremonies verified independent and non-colliding.
  - **F5 (Observability):** Route catch blocks log errors and capture in Sentry via `captureException` when active; returns scrubbed 500 error messages.
  - **F6 (Typing):** Removed `any` in `GoalPasskeySignIn.tsx` in favor of `PasskeyApiResponse`.
  - **F7 (List/Revoke & Security Review):** Added `GET /api/auth/passkey/list` and `POST /api/auth/passkey/revoke` for authenticated seekers; written security review documented above.
  - **F8 (Referrer surface pin):** Added pin in `passkeyGoalGate.test.tsx` asserting `GoalSignIn` with referrer intent renders no passkey affordance; status documented.
  - **F9 (Enrollment offer lifecycle):** Moved unsupported platform redirect from render body to `useEffect`; remembers enrollment and dismissal in localStorage to avoid repeated offers on subsequent email code sign-ins.
  - **Flag state:** In-code constant `PASSKEY_SIGNIN_ENABLED = false` remains off in production (D-097 pattern), ready for QA verification.
- **Nov 13, D-333 (5): the owner answered (a) and (b).** (a) No referrer passkey: the work-email code stays a referrer's only sign-in. (b) No Sign in with Apple. The row is `todo`; build under this packet, then one independent Tier 1 review (D-151).
- Registered by DeepSeek V4.1 Flash Free · 8c0f under D-209 (docs only). Build
  waits for the owner's answers to (a) and (b); the picker hands out no work on
  this row before then.
- Oct 26 (verification gaps, logged for the owner/Claude while review proceeds): the
  real server/DB accept criterion is blocked on two UNPROVEN facts, not on code.
  (1) ISOLATION: the skipwait-qa preview's DATABASE_URL is `secret_text` on both the
  preview and production workers (host unreadable); the preview shows 2 fictional
  companies vs 39 in prod, which suggests but does not prove a separate DB; the Oct 21
  deployer's binding record is unrecoverable (transcript index gap); the vault item
  "skipwait-qa scratch DB (local QA)" holds a bare user + password with NO host; the
  repo has no QA deploy automation to audit. Missing: grounded binding provenance
  (which DATABASE_URL the preview worker actually holds) or a fresh preview whose
  binding is known by construction. (2) COST: the QA scoped token cannot read the
  account plan or DB capacity; public free-tier limits do not prove this account is
  covered. Missing: account plan/usage + DB capacity evidence. Until both ground, no
  deploy or journey test against that preview, and no safe/free claim. Lead for a
  construction-known route: `.github/workflows/db-rehearsal.yml` shows repo variables
  for the prod DB and a NEW DB server with a `skipwait_rehearsal` database - a fresh
  isolated preview could bind a scratch DB by construction, but its capacity and the
  deploy authority are unverified; route through the owner before use.
  Hygiene (routed through the private security lane, no values here): the preview
  worker stores its test-mode Chargebee key + webhook secret as plain_text vars
  (prod uses secret_text). Bounded test-credential storage issue; no compromise
  asserted; changing worker secret settings needs the owning route's authority.
