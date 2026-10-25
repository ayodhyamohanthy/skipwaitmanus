# Packet: device-saved sign-in, Phase A (row backlog-oct25-device-signin-impl)

Tier 1 (sign-in, sessions, identity linking). Implementer: read docs/BRIEF.md
first, then this packet and docs/DEVICE-SIGNIN-REQUIREMENTS.md (#667). One
packet per session; claim the row branch with scripts/next-task.mjs.

## 1. Grounded capability facts (verified Oct 25 2026)

- WorkOS passkeys are HOSTED-UI-ONLY: "Passkey authentication is currently
  only available with the hosted UI in AuthKit"
  (https://workos.com/docs/authkit/passkeys). The installed
  @workos-inc/node 10.12.0 exposes no passkey API. The hosted UI lives on
  authkit.app, which violates the FOUNDER-LOCKED native-domain rule
  (D-030/D-049/D-057), and the $99/month custom domain is excluded by the
  money rule. DO NOT enroll passkeys on a WorkOS domain.
- `jose` 6.1.0 is already a dependency: Google One Tap / FedCM ID-token
  verification needs NO new package.
- docs/BRIEF.md: "No new dependency without the owner." Native WebAuthn
  passkey ceremonies (Face ID / fingerprint on skipwait.me) require
  @simplewebauthn/server + browser: Phase B, owner approval required. This
  packet does NOT include them.
- Google One Tap requires our own Google OAuth web client ID (free, Google
  Cloud console). Creating it is console setup; if no session holds that
  access, the owner creates it. The env key is named below, per BRIEF.

## 2. In scope (Phase A, free, native-domain, no new dependency)

1. Session-restore-first audit + fix: a returning user with a valid session
   lands signed in on every entry surface. Add regression tests; fix gaps.
2. Google One Tap / FedCM automatic prompt for signed-out visitors on
   arrival (seeker side only): load accounts.google.com/gsi/client, request
   with our client ID + server-issued nonce, verify the credential JWT
   server-side with jose against Google's JWKS (aud = our client ID, nonce
   match, iss accounts.google.com, exp). Sign in ONLY an existing account
   whose verified email matches, or create a seeker account under the
   existing sign-up rules - no account linking on unverified email, no
   consent bypass. Dismissal sets a cooldown (Google's own + localStorage);
   the normal sign-in path always remains. Referrer/work-email flow is
   untouched (FOUNDER-LOCKED work-email OTP only).
3. After any successful email-code sign-in, offer the browser's Credential
   Management store() where supported (progressive enhancement, silent
   no-op elsewhere), so returning device-saved offers improve over time.
4. New env key: GOOGLE_SIGNIN_CLIENT_ID (declare in .env.example; feature
   is inert without it - no prompt, no route mounted beyond a 404).

## 3. Out of scope

Passkeys/WebAuthn (Phase B, owner dependency approval first), WorkOS hosted
passkeys, forced biometric prompts, referrer biometric sign-in, any change
to session lengths or security posture, any paid provider or plan.

## 4. Red-first tests (write first, watch fail)

- server/googleOneTap.test.ts: route rejects a token with wrong aud, wrong
  nonce, expired exp, wrong iss (mock Google's JWKS with a jose-generated
  keypair); accepts a valid token; an unverified-email match signs NOBODY
  in and logs nothing personal; replay of the same nonce fails.
- client/src/components/GoogleOneTapPrompt.test.tsx: prompt requested only
  when signed out, only on the seeker path; dismissal cooldown respected;
  absent client ID = nothing renders and no script loads; normal sign-in
  link always present.
- Existing sign-in suites must stay green unchanged (no weakened pins).

## 5. Questions for the reviewer (answer each with file:line)

1. Where does the route enforce the nonce's single use?
2. Where is the verified-email check before any session is created?
3. Where is the referrer path proven untouched?
4. What happens with GOOGLE_SIGNIN_CLIENT_ID unset, in test?

## 6. Phase B note (not this packet)

Native passkeys (Face ID / fingerprint ceremony on skipwait.me) need
@simplewebauthn/server + @simplewebauthn/browser. Authority gap: BRIEF
"No new dependency without the owner". Until the owner approves that
dependency, biometric prompts reach users only through Google's own One Tap
UI where Google offers them. A separate packet follows owner approval.
