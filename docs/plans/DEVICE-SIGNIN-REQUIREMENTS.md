# Device-saved sign-in requirements (owner directive, Oct 25 2026)

Status: REQUIREMENTS RECORD for implementation agents. Nothing here is
implemented by this file; the current sign-in behavior is listed under
"Current implementation" and is the only shipped truth.

## Owner requirement (authenticated iMessage)

- phonemsg-01M5SPCCW1C49HTKRJXBNF57TT (Oct 25, 7:40 PM IST): device saved
  credentials, biometric sign in, Face ID, "like Alibaba, Flipkart and other
  big companies have".
- phonemsg-01M5SPEDKT5WT8W69SMKKHH7T6 (7:41 PM): returning users - device
  saved credentials should pop up when users land on the website; automatic
  device sign-ins / biometric / passkey / Face ID / auto login for old users.
- Earlier scope on the same outcome (todo-01M5MXMNJGCHMKHWEJ0Y8A382H):
  phonemsg-01M5RPGP3EDRHSPE2RKGPYVA9H (10:23 AM): Face ID/fingerprint,
  device-saved Google sign-ins and other device-saved ids, like Flipkart or
  Alibaba automatic sign-in popups. phonemsg-01M5RPHKWGRDK4V41YDKZMTKVJ:
  "New users too". phonemsg-01M5RPJ72X0433T6KJVSMJG4JP: "For new users auto
  popup should show".

## Required behavior

1. Returning users: land already signed in when a valid session exists.
2. Otherwise, offer the device's saved account or passkey automatically on
   arrival - Face ID / fingerprint / screen-lock confirmation where the
   device and browser allow - without first hunting for a sign-in button.
3. New users: the provider's automatic account prompt (for example Google's)
   on arrival where the platform supports it; do not assume a new user has
   an existing skipwait passkey.
4. A normal sign-in path always remains where automatic prompts are
   unsupported, unavailable, or dismissed.

## Constraints (standing)

- Native-domain rule (FOUNDER-LOCKED Oct 16 2026, D-030/D-049/D-057; sources
  phonemsg-01M51MY17NS3N2XB502SAKNGP4, rationale phonemsg-01M51QXZ4RJY9VHQK039S28RYX):
  sign-in stays on skipwait.me; no authkit.app hosted redirect. The $99/month
  custom-domain option is excluded (money rule: free routes only).
- No spending, no new identity store, no consent or account-linking bypass,
  no session-security downgrade.
- No promising what a browser/OS cannot do: no platform permits forcing a
  biometric prompt; support varies by browser, OS and provider.
- Proof-before-done: device claims need real device/browser evidence, not
  code affordances.

## Current implementation (shipped truth, Oct 25)

- Seeker sign-in is native on skipwait.me (client/src/components/SeekerSignIn.tsx):
  social buttons go straight to the provider via /api/auth/workos/sign-in,
  email uses a six-digit code. Referrers: work-email OTP only
  (FOUNDER-LOCKED Oct 16 2026).
- Session/auth client: @workos-inc/authkit-react (client/src/_core/auth.tsx).
- WorkOS passkeys: enabled in the WorkOS dashboard (read-only inspection
  Oct 23) but WorkOS documents passkeys for the hosted AuthKit UI; the
  native page has no WebAuthn path today. This constraint was found Oct 23
  and is UNVERIFIED against current WorkOS docs - re-verify before design.
- Google One Tap / FedCM automatic prompt: not implemented.
- Credential Management API / silent device-credential offer: not implemented.
- Remembered-email affordances exist but do not meet this requirement.

## Open implementation questions

- Passkey ceremony on the native page: does WorkOS expose headless
  passkey registration/assertion APIs sufficient for a native WebAuthn flow,
  or is hosted UI the only path? (Re-verify current WorkOS docs.)
- Google automatic prompt: One Tap vs FedCM eligibility for the production
  Google OAuth client; browser support matrix.
- Automatic prompt on arrival vs. sign-in page only: owner wants arrival on
  the website; scope the trigger surfaces without interrupting browsing.
