# Packet: native passkey sign-in, Phase B (row backlog-oct25-device-signin-impl)

Tier 1 (sign-in, sessions, identity linking). Implementer: read docs/BRIEF.md,
then this packet, docs/DEVICE-SIGNIN-REQUIREMENTS.md and
docs/plans/FIX-device-saved-signin.md (Phase A). One packet per session;
claim the row branch with scripts/next-task.mjs.

## 1. Authority and scope limits (frozen)

- Dependency approval: user like (Oct 25 2026, 20:26:40 IST, provider
  reaction f80d59f4-5413-4404-b86d-790c381394a8) on the explicit question
  phonemsg-01M5SRZ0WWG3MX9MJ8KARS144Z: add SimpleWebAuthn, a free sign-in
  library, for native passkey sign-in. Approved scope: @simplewebauthn/server
  and @simplewebauthn/browser ONLY (MIT, MasterKale/SimpleWebAuthn). Pin exact
  versions in package.json; no other new dependency.
- Limits carried with the approval: no payment or identity bypass, no
  native-domain waiver, no forced prompts; security review and real
  device/browser testing before any "working" claim (proof-before-done).
- Native-domain rule stands (D-030/D-049/D-057): the ceremony runs on
  skipwait.me, rpID skipwait.me. WorkOS hosted passkeys remain excluded
  (hosted-UI-only per workos.com/docs/authkit/passkeys, verified Oct 25).

## 2. In scope (seeker side only)

1. Registration: a SIGNED-IN user adds a passkey to their existing account
   from a settings entry point and, after any successful email-code sign-in,
   an offer to save one (dismissible, remembered). Server:
   POST /api/auth/passkeys/register/options issues a single-use challenge
   (TTL 5 min, stored hashed, tied to the session); .../verify validates
   origin, rpID, challenge and attestation via @simplewebauthn/server and
   stores the credential. Registration NEVER creates an account and NEVER
   runs without an authenticated session.
2. Sign-in: on the native sign-in page, conditional UI (passkey autofill)
   where the browser supports it, plus a "Sign in with a passkey" button
   fallback. Server: POST /api/auth/passkeys/login/options (no user
   enumeration: identical response shape for known and unknown accounts);
   .../verify checks challenge, origin, rpID, signature and the signature
   COUNTER (a regression = refuse and flag). On success, issue the session
   through the EXISTING session-creation path used by email-code sign-in -
   same cookie, same lifetime, same shape. No session-security downgrade.
3. Storage: new table passkey_credentials (id, user_id, credential_id unique,
   public_key, counter, transports, device label, created_at, last_used_at).
   Credentials attach to existing users; this is NOT a new identity store.
   A management list in settings: see and remove own passkeys.
4. Env keys (declare in .env.example): WEBAUTHN_RP_ID default skipwait.me,
   WEBAUTHN_ORIGIN default https://skipwait.me. No secrets.

## 3. Out of scope

Referrer/work-email flow (FOUNDER-LOCKED work-email OTP only - untouched),
forced or undismissable prompts, cross-device sync promises, WorkOS passkeys,
any change to session lifetimes, Google One Tap (Phase A, independent).

## 4. Red-first tests (write first, watch fail)

- server/passkeys.test.ts: register/options 401 without a session; verify
  rejects a replayed challenge, a wrong origin, a wrong rpID, a counter
  regression; login/options has byte-identical shape for unknown users;
  a valid ceremony issues a session indistinguishable from the OTP path;
  deleted credential can never sign in; logs carry no credential material.
- client/src/components/passkeySignIn.test.tsx: conditional UI requested
  only when the platform reports support; button fallback always present;
  the normal email-code path always remains; offer after sign-in is
  dismissible and stays dismissed.

## 5. Device proof (required before "working")

Real device/browser matrix captured as screenshots or recordings: iOS Safari
Face ID, Android Chrome fingerprint, desktop Chrome + Windows Hello or
Touch ID, plus one unsupported browser showing the graceful fallback. Code
affordances are not device proof.

## 6. Questions for the reviewer (answer each with file:line)

1. Where is the challenge single-use enforced, and its TTL?
2. Where does login/options avoid account enumeration?
3. Where does session issuance reuse the OTP path unchanged?
4. Where is the signature counter checked and a regression handled?
5. Where is the referrer flow proven untouched?
