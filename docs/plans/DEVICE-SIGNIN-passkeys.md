# Packet DEVICE-SIGNIN-passkeys: device-saved sign-in (passkeys and automatic prompts)

| Field | Value |
|---|---|
| Row | `DEVICE-SIGNIN-passkeys` (Tier 1, lane `auth-device`) |
| Branch | `agent/queue/device-signin-passkeys` (fresh; nothing of it rides `agent/queue/fix-device-signin`) |
| Decisions | D-172 (the device prompt appears on its own when sign-in is needed), D-209 (this row, its scope and its two owner questions), D-030/D-049/D-057 (login rule), D-095 (one tap wherever possible), D-151 (Tier 1 review), D-204 (free tools first) |
| Status | **Phases A-C released for build by the owner, Oct 26** (browser/device saved-account chooser for returning users; anchors phonemsg-01M5VG0DPC6QSD5VQGPTGW9AH7, phonemsg-01M5VG10HEQJ3B82QM7MH8KP1Q, phonemsg-01M5VG20ZVC76Q21AS6Q2TC90S). Phase D stays blocked on D-209 (4). No code yet. |

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

## Open, blocking phase D only (D-209 (4); phases A-C released Oct 26, anchors in Status)

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
- Surfaces: the goal-focused sign-in flow only (D-120, `goalSurfaceOn("sign-in")`;
  owner, Oct 26). The legacy kit sign-in page gets no new device-credential UI.

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

## Status

- Registered by DeepSeek V4.1 Flash Free · 8c0f under D-209 (docs only).
- Oct 26: the owner directed the actual browser/device saved-account chooser
  (like Chrome-saved logins on consumer sites), making clear the remembered-email
  prefill (FIX-device-signin, landed in #655) is not the fulfillment. Phases A-C
  are released; the picker may hand out this row. Phase D (referrer passkeys,
  Sign in with Apple) stays blocked until the owner answers D-209 (4); the
  defaults (no/no) hold and nothing of either may be built on a default.
- Oct 26 (design, phonemsg-01M5VG4PVZCHMZ8T9R4Z1Q1X3Y): the owner rejected
  building on the old sign-in screens. This row's surfaces are the goal-focused
  sign-in flow (`GoalSignIn` via `goalSurfaceOn("sign-in")`, D-120), never the
  legacy kit page; functional fixes already landed stay, but no new
  device-credential UI is built on the old screens.
- Oct 26 (registry repair, coordinator): the row's registered owns were pre-build
  placeholder paths; corrected to the actual phase-B build paths
  (`GoalSeekerSignIn.tsx`, `GoalPasskeySignIn.tsx` + test, `passkeyGoalGate.test.tsx`,
  `GoalSignIn.tsx`, `server/_core/passkeyLogin.ts` + test, `server/_core/passkeyStore.ts`,
  `drizzle/schema.ts`, `drizzle/deploy/0115_passkey_credentials.sql`, switch-only wiring,
  package files). The credential/challenge store moved out of the shared `server/db.ts`
  barrel into `server/_core/passkeyStore.ts` so this row owns every line it adds and the
  D-132-audit / D-174 ownership of `server/db.ts` is untouched. `drizzle/schema.ts`
  overlap is serialized by the schema-chain rule (D-099-bonus-pages and D-174-job-catalog
  now wait on this row). Correction recorded: registering this row alone did NOT clear
  the build branch's scope gate - the owns correction and the google-chooser registration
  (its own row, `DEVICE-SIGNIN-google-chooser`) were also required; the earlier
  expectation that #696 alone would clear #697 was wrong.
