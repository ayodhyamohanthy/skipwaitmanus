/**
 * DEVICE-SIGNIN-passkeys (owner, Oct 26): native passkey sign-in for seekers.
 *
 * Seekers with an account can add a device passkey and later sign in with the
 * browser's own saved-credential experience (WebAuthn conditional UI / autofill).
 * This is an additional first-class seeker method next to the social providers
 * and the email code - the owner directed the device-saved sign-in experience
 * (phonemsg-01M5RPGP3EDRHSPE2RKGPYVA9H, phonemsg-01M5SPCCW1C49HTKRJXBNF57TT,
 * phonemsg-01M5VG0DPC6QSD5VQGPTGW9AH7). Referrers stay work-email code only
 * (D-030/D-057; D-209 (4)(a) default: no referrer passkey).
 *
 * Flag: in-code constant, off until QA passes (D-097 pattern). One method at a
 * time; no silent global enable.
 */
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import * as store from "./passkeyStore";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { resolveTrustedClientIp } from "./trustedClientIp";

// D-097-style switch: off until QA passes on a non-production deploy.
const PASSKEY_SIGNIN_ENABLED = false;

function passkeySignInOn() {
  // Test-mode rule (same as goalSurfaces): tests may enable via env; the
  // production gate is only the in-code constant above, flipped after QA.
  return PASSKEY_SIGNIN_ENABLED || (process.env.NODE_ENV === "test" && process.env.PASSKEY_SIGNIN_ENABLED === "true");
}

const RP_NAME = "skipwait.me";
const rpID = () => process.env.PASSKEY_RP_ID ?? "skipwait.me";
const expectedOrigin = () => process.env.PASSKEY_ORIGIN ?? "https://skipwait.me";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

type ResolveIdentity = (req: Request) => Promise<{ account: { openId: string; email: string | null; name: string | null; loginMethod: string | null } } | null | undefined>;

function isReferrerOpenId(openId: string) {
  return openId.startsWith("workemail_");
}

export function registerPasskeyLoginRoutes(app: Express, opts: { resolveIdentity: ResolveIdentity }) {
  const disabled = (_req: Request, res: Response) => res.status(404).json({ error: "Not found" });
  if (!passkeySignInOn()) {
    app.post("/api/auth/passkey/register/options", disabled);
    app.post("/api/auth/passkey/register/verify", disabled);
    app.post("/api/auth/passkey/login/options", disabled);
    app.post("/api/auth/passkey/login/verify", disabled);
    return;
  }

  app.post("/api/auth/passkey/register/options", async (req: Request, res: Response) => {
    try {
      const me = await opts.resolveIdentity(req);
      if (!me?.account?.openId || isReferrerOpenId(me.account.openId)) return res.status(403).json({ error: "Sign in first to add a passkey." });
      const existing = await store.listPasskeyCredentials(me.account.openId);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpID(),
        userName: me.account.email ?? me.account.openId,
        userDisplayName: me.account.name ?? me.account.email ?? undefined,
        attestationType: "none",
        excludeCredentials: existing.map(c => ({ id: c.credentialId, transports: c.transports ?? undefined })),
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });
      await store.savePasskeyChallenge(me.account.openId, options.challenge, "registration", new Date(Date.now() + CHALLENGE_TTL_MS));
      res.json(options);
    } catch {
      res.status(500).json({ error: "We could not start passkey setup" });
    }
  });

  app.post("/api/auth/passkey/register/verify", async (req: Request, res: Response) => {
    try {
      const me = await opts.resolveIdentity(req);
      if (!me?.account?.openId || isReferrerOpenId(me.account.openId)) return res.status(403).json({ error: "Sign in first to add a passkey." });
      const challenge = await store.consumePasskeyChallenge(me.account.openId, "registration");
      if (!challenge) return res.status(400).json({ error: "Passkey setup expired. Try again." });
      const verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
      });
      if (!verification.verified || !verification.registrationInfo) {
        return res.status(400).json({ error: "That passkey could not be verified. Try again." });
      }
      const { credential } = verification.registrationInfo;
      await store.insertPasskeyCredential({
        openId: me.account.openId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        counter: credential.counter,
        transports: Array.isArray(req.body?.response?.transports) ? req.body.response.transports.join(",") : null,
        deviceName: typeof req.body?.deviceName === "string" ? req.body.deviceName.slice(0, 120) : null,
      });
      res.json({ registered: true });
    } catch {
      res.status(500).json({ error: "We could not finish passkey setup" });
    }
  });

  app.post("/api/auth/passkey/login/options", async (req: Request, res: Response) => {
    try {
      // Conditional UI: no email needed - the browser offers the passkeys saved
      // for skipwait.me on this device. An optional email scopes the choices.
      // Discoverable credentials only: the browser offers the passkeys saved
      // for skipwait.me on this device. No email scoping - the saved-account
      // choice is the browser's, not ours.
      const options = await generateAuthenticationOptions({
        rpID: rpID(),
        userVerification: "preferred",
        allowCredentials: [],
      });
      await store.savePasskeyChallenge(null, options.challenge, "login", new Date(Date.now() + CHALLENGE_TTL_MS));
      res.json(options);
    } catch {
      res.status(500).json({ error: "We could not start passkey sign-in" });
    }
  });

  app.post("/api/auth/passkey/login/verify", async (req: Request, res: Response) => {
    try {
      const credentialId = req.body?.id;
      if (typeof credentialId !== "string" || !credentialId) return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      const stored = await store.getPasskeyCredentialByCredentialId(credentialId);
      if (!stored || isReferrerOpenId(stored.openId)) return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      const challenge = await store.consumePasskeyChallenge(null, "login");
      if (!challenge) return res.status(400).json({ error: "Sign-in expired. Try again." });
      const verification = await verifyAuthenticationResponse({
        response: req.body,
        expectedChallenge: challenge,
        expectedOrigin: expectedOrigin(),
        expectedRPID: rpID(),
        credential: {
          id: stored.credentialId,
          publicKey: new Uint8Array(Buffer.from(stored.publicKey, "base64url")),
          counter: stored.counter,
          transports: stored.transports ?? undefined,
        },
      });
      if (!verification.verified) return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      await store.bumpPasskeyCounter(stored.id, verification.authenticationInfo.newCounter);
      // The credential is bound to an existing account at registration, so
      // sign-in only resolves that account - no identity provisioning.
      const account = await db.getUserByOpenId(stored.openId);
      if (!account) return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      if (account.suspended) return res.status(403).json({ error: "We could not complete sign-in." });
      const token = await sdk.createSessionToken(stored.openId, { name: account.name ?? undefined });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      res.json({ signedIn: true, role: account.role });
    } catch {
      res.status(500).json({ error: "We could not complete passkey sign-in" });
    }
  });
}
