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
import * as Sentry from "@sentry/node";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import * as store from "./passkeyStore";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { resolveTrustedClientIp } from "./trustedClientIp";
import { isServerSentryActive } from "../sentry";

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

async function isReferrerAccount(openId: string): Promise<boolean> {
  if (isReferrerOpenId(openId)) return true;
  const user = await db.getUserByOpenId(openId);
  if (!user) return false;
  if (user.id) {
    const verified = await db.getVerifiedWorkEmailAccess(user.id);
    if (verified) return true;
  }
  return false;
}

// In-memory rate limiting per client IP (sliding 60-second window, 10 requests max)
const ipCallCounts = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

export function checkPasskeyRateLimit(ip: string, nowMs = Date.now()): boolean {
  const current = ipCallCounts.get(ip);
  if (!current || nowMs - current.windowStart > RATE_LIMIT_WINDOW_MS) {
    ipCallCounts.set(ip, { count: 1, windowStart: nowMs });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  current.count += 1;
  return true;
}

export function resetPasskeyRateLimits() {
  ipCallCounts.clear();
}

function handleRouteError(err: unknown, route: string, userMessage: string, res: Response) {
  if (isServerSentryActive()) {
    Sentry.captureException(err, { tags: { route: `passkey_${route}` } });
  }
  console.error(`[passkey] ${route} error:`, err instanceof Error ? err.message : String(err));
  res.status(500).json({ error: userMessage });
}

export function registerPasskeyLoginRoutes(app: Express, opts: { resolveIdentity: ResolveIdentity }) {
  const disabled = (_req: Request, res: Response) => res.status(404).json({ error: "Not found" });
  if (!passkeySignInOn()) {
    app.post("/api/auth/passkey/register/options", disabled);
    app.post("/api/auth/passkey/register/verify", disabled);
    app.post("/api/auth/passkey/login/options", disabled);
    app.post("/api/auth/passkey/login/verify", disabled);
    app.get("/api/auth/passkey/list", disabled);
    app.post("/api/auth/passkey/revoke", disabled);
    return;
  }

  const rateLimitGuard = (req: Request, res: Response, next: () => void) => {
    const clientIp = resolveTrustedClientIp(req);
    if (!checkPasskeyRateLimit(clientIp)) {
      res.status(429).json({ error: "Too many requests. Please try again later." });
      return;
    }
    next();
  };

  app.post("/api/auth/passkey/register/options", rateLimitGuard, async (req: Request, res: Response) => {
    try {
      const me = await opts.resolveIdentity(req);
      if (!me?.account?.openId || (await isReferrerAccount(me.account.openId))) {
        return res.status(403).json({ error: "Sign in first to add a passkey." });
      }
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
    } catch (err) {
      handleRouteError(err, "register_options", "We could not start passkey setup", res);
    }
  });

  app.post("/api/auth/passkey/register/verify", rateLimitGuard, async (req: Request, res: Response) => {
    try {
      const me = await opts.resolveIdentity(req);
      if (!me?.account?.openId || (await isReferrerAccount(me.account.openId))) {
        return res.status(403).json({ error: "Sign in first to add a passkey." });
      }
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
    } catch (err) {
      handleRouteError(err, "register_verify", "We could not finish passkey setup", res);
    }
  });

  app.post("/api/auth/passkey/login/options", rateLimitGuard, async (_req: Request, res: Response) => {
    try {
      // Conditional UI: discoverable credentials only - the browser offers
      // the passkeys saved for skipwait.me on this device.
      const options = await generateAuthenticationOptions({
        rpID: rpID(),
        userVerification: "preferred",
        allowCredentials: [],
      });
      const ceremonyId = await store.savePasskeyChallenge(null, options.challenge, "login", new Date(Date.now() + CHALLENGE_TTL_MS));
      res.json({ ...options, ceremonyId });
    } catch (err) {
      handleRouteError(err, "login_options", "We could not start passkey sign-in", res);
    }
  });

  app.post("/api/auth/passkey/login/verify", rateLimitGuard, async (req: Request, res: Response) => {
    try {
      const credentialId = req.body?.id;
      if (typeof credentialId !== "string" || !credentialId) {
        return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      }
      const stored = await store.getPasskeyCredentialByCredentialId(credentialId);
      if (!stored || (await isReferrerAccount(stored.openId))) {
        return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      }
      const ceremonyId = req.body?.ceremonyId;
      const challenge = await store.consumePasskeyChallenge(null, "login", ceremonyId);
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
      if (!verification.verified) {
        return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      }
      await store.bumpPasskeyCounter(stored.id, verification.authenticationInfo.newCounter);
      // The credential is bound to an existing account at registration, so
      // sign-in only resolves that account - no identity provisioning.
      const account = await db.getUserByOpenId(stored.openId);
      if (!account || (await isReferrerAccount(account.openId))) {
        return res.status(400).json({ error: "That sign-in could not be verified. Try again." });
      }
      if (account.suspended) return res.status(403).json({ error: "We could not complete sign-in." });
      const token = await sdk.createSessionToken(stored.openId, { name: account.name ?? undefined });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      res.json({ signedIn: true, role: account.role });
    } catch (err) {
      handleRouteError(err, "login_verify", "We could not complete passkey sign-in", res);
    }
  });

  app.get("/api/auth/passkey/list", rateLimitGuard, async (req: Request, res: Response) => {
    try {
      const me = await opts.resolveIdentity(req);
      if (!me?.account?.openId || (await isReferrerAccount(me.account.openId))) {
        return res.status(403).json({ error: "Sign in first to view passkeys." });
      }
      const credentials = await store.listPasskeyCredentials(me.account.openId);
      res.json({
        credentials: credentials.map(c => ({
          id: c.credentialId,
          deviceName: c.deviceName,
          createdAt: c.createdAt,
          lastUsedAt: c.lastUsedAt,
        })),
      });
    } catch (err) {
      handleRouteError(err, "list", "We could not load passkeys", res);
    }
  });

  app.post("/api/auth/passkey/revoke", rateLimitGuard, async (req: Request, res: Response) => {
    try {
      const me = await opts.resolveIdentity(req);
      if (!me?.account?.openId || (await isReferrerAccount(me.account.openId))) {
        return res.status(403).json({ error: "Sign in first to manage passkeys." });
      }
      const credentialId = req.body?.credentialId;
      if (typeof credentialId !== "string" || !credentialId) {
        return res.status(400).json({ error: "Invalid credential id." });
      }
      await store.deletePasskeyCredential(me.account.openId, credentialId);
      res.json({ revoked: true });
    } catch (err) {
      handleRouteError(err, "revoke", "We could not revoke passkey", res);
    }
  });
}
