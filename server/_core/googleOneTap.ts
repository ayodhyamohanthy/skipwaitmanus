/**
 * DEVICE-SIGNIN-passkeys phase C (owner, Oct 26): the Google account chooser
 * (One Tap / FedCM) for returning seekers. The browser/Google owns the prompt;
 * this route only verifies the ID token the callback brings and mints the same
 * app_session_id as every other sign-in.
 *
 * Identity: verified-email linking is the existing approved mechanism - the
 * same serialized canonical-person transaction that reconciles WorkOS and OTP
 * first sign-ins (db.resolveLoginIdentity). The session is minted with the
 * RESOLVED account's openId, never the provider-namespaced one. Referrers stay
 * work-email code only (D-030/D-057): a resolved work-email account is refused.
 *
 * Flag: in-code constant, off until QA (D-097). Production needs the OAuth
 * client's consent/origin config settled - the route 404s until then.
 */
import { randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";

// D-097-style switch: off until QA passes on a non-production deploy.
const GOOGLE_ONE_TAP_ENABLED = false;

function oneTapOn() {
  // Test-mode rule (same as goalSurfaces): tests may enable via env; the
  // production gate is only the in-code constant above, flipped after QA.
  return GOOGLE_ONE_TAP_ENABLED || (process.env.NODE_ENV === "test" && process.env.GOOGLE_ONE_TAP_ENABLED === "true");
}

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

const NONCE_COOKIE = "google_one_tap_nonce";
const NONCE_TTL_MS = 10 * 60 * 1000;

export function registerGoogleOneTapRoutes(app: Express) {
  // Login-CSRF binding: the page fetches a nonce, the server sets it as an
  // httpOnly cookie, the GIS prompt embeds it in the ID token, and verify
  // requires token-nonce == cookie. A token harvested elsewhere never matches
  // the victim's cookie, so an attacker cannot log a victim into the
  // attacker's account.
  app.get("/api/auth/google-one-tap/nonce", (req: Request, res: Response) => {
    if (!oneTapOn()) return res.status(404).json({ error: "Not found" });
    const nonce = randomBytes(24).toString("base64url");
    res.cookie(NONCE_COOKIE, nonce, { ...getSessionCookieOptions(req), maxAge: NONCE_TTL_MS });
    res.json({ nonce });
  });

  app.post("/api/auth/google-one-tap/verify", async (req: Request, res: Response) => {
    if (!oneTapOn()) return res.status(404).json({ error: "Not found" });
    try {
      const clientId = process.env.GOOGLE_ONE_TAP_CLIENT_ID;
      if (!clientId) return res.status(503).json({ error: "Google sign-in is not configured" });
      const credential = req.body?.credential;
      if (typeof credential !== "string" || credential.length > 8192) {
        return res.status(400).json({ error: "That Google sign-in could not be verified. Try again." });
      }
      const cookieNonce = req.headers.cookie?.match(/(?:^|;\s*)google_one_tap_nonce=([^;]+)/)?.[1];
      const { payload } = await jwtVerify(credential, GOOGLE_JWKS, { issuer: GOOGLE_ISSUERS, audience: clientId });
      if (!cookieNonce || String(payload.nonce ?? "") !== cookieNonce) {
        return res.status(400).json({ error: "That Google sign-in could not be verified. Try again." });
      }
      const sub = String(payload.sub ?? "");
      const email = String(payload.email ?? "").trim().toLowerCase();
      const emailVerified = payload.email_verified === true || payload.email_verified === "true";
      if (!sub || !email || !emailVerified) {
        // Only a Google-verified email may authenticate an identity (the same
        // bar the WorkOS path applies).
        return res.status(400).json({ error: "That Google sign-in could not be verified. Try again." });
      }
      const name = typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null;
      const account = await db.resolveLoginIdentity({
        provider: "google_one_tap",
        subject: sub,
        openId: `googleonetap_${sub}`,
        email,
        emailVerified: true,
        name,
        loginMethod: "google_one_tap",
      });
      if (!account || account.suspended) return res.status(403).json({ error: "We could not complete sign-in." });
      // Referrers sign in with the work-email code only (D-030/D-057): a Google
      // chooser never signs in a work-email (referrer) account.
      if (account.openId.startsWith("workemail_")) return res.status(403).json({ error: "Referrers sign in with a company email code." });
      const token = await sdk.createSessionToken(account.openId, { name: account.name ?? name ?? email });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      res.json({ signedIn: true, role: account.role, email });
    } catch (error) {
      if (error instanceof Error && (error.message === "ACCOUNT_NOT_ACTIVE" || error.message === "IDENTITY_REVIEW_REQUIRED")) {
        return res.status(403).json({ error: "We could not complete sign-in." });
      }
      res.status(400).json({ error: "That Google sign-in could not be verified. Try again." });
    }
  });
}
