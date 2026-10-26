# Packet DEVICE-SIGNIN-google-chooser: the provider's automatic prompt (phase C)

| Field | Value |
|---|---|
| Row | `DEVICE-SIGNIN-google-chooser` (Tier 1, lane `auth-device`) |
| Branch | `agent/queue/device-signin-google-chooser` (stacked on `agent/queue/device-signin-passkeys`) |
| Decisions | D-172, D-209, D-095 (one tap wherever possible), D-030/D-049/D-057 (login rule), D-151 (Tier 1 review), D-204 (free tools first) |
| Status | **Released for build by the owner, Oct 26** (phase C of the DEVICE-SIGNIN release; anchors phonemsg-01M5VG0DPC6QSD5VQGPTGW9AH7, phonemsg-01M5VG10HEQJ3B82QM7MH8KP1Q, phonemsg-01M5VG20ZVC76Q21AS6Q2TC90S). |

## Why this row exists

Phase C of `DEVICE-SIGNIN-passkeys.md`: where the platform and the production
OAuth client allow it, the provider's own account chooser (Google One Tap /
FedCM) appears behind the same "sign-in is needed" trigger, so a returning
person taps their saved Google account instead of typing an email and a code.
Registered Oct 26 because the build branch already existed with no matching
queue row, which fails the queue gate ("nothing merges to main outside the
queue", D-166).

## Scope

- Server: `server/_core/googleOneTap.ts` verifies the Google ID token against
  Google's JWKS (audience, issuer, expiry), accepts only Google-verified
  emails, links through the canonical-person path, and refuses `workemail_`
  and suspended accounts. An httpOnly nonce cookie binds the credential to the
  login that issued it (login CSRF).
- Client: `client/src/components/GoogleOneTap.tsx` loads the Google Identity
  script only when the goal-focused sign-in surface is on and the visitor is
  signed out; dismissal is remembered for the session; no prompt for a signed-
  in person.
- The switch is the in-code constant `GOOGLE_ONE_TAP_ENABLED`, off until QA
  (D-097). One method lands at a time; no silent global enable.

## Guardrails (binding)

- Only `https://skipwait.me` is an authorized JavaScript origin in the Google
  OAuth client. A new test origin is a separate, owner-visible decision; it is
  not implied by this row.
- Publishing the consent screen out of Testing mode is the owner's call; this
  row never publishes it.
- No account-scope expansion: the client requests basic sign-in only (zero
  extra scopes configured).
- D-030/D-049/D-057 unchanged; the login-rule pins stay green.

## Accept (proof before "done", AGENTS.md rule 8)

- Red-first tests: token verification rejects wrong audience/issuer/expired;
  unverified-email, `workemail_` and suspended identities are refused; nonce
  mismatch is refused.
- Real browser evidence, captured not asserted: the prompt appears for a
  signed-out visitor on an authorized origin and a tap signs in; dismissal is
  remembered for the session. CDP/virtual-authenticator evidence is labelled
  as ceremony-protocol proof only, never as the browser-owned account prompt.
- Security review written down: JWKS verification, nonce binding, identity
  linking, refusal paths.

## Status

- Registered Oct 26 (docs only) with the build already on its branch;
  independent review still owed before anything lands.
