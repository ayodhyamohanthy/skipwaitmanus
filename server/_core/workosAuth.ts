import { WorkOS } from "@workos-inc/node";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { resolveDevIdentity, type DevIdentity, type DevEmailAddress } from "./devAuth";
import { getSessionCookieOptions, isSecureRequest } from "./cookies";
import { publicRequestHost } from "./publicHost";

/**
 * WorkOS AuthKit authentication for production skipwait.me.
 *
 * SDK-first flow: the AuthKit React SDK (client/src/_core/auth.tsx) runs its
 * own PKCE sign-in in the browser and holds a WorkOS access JWT. Every API
 * call presents it as `Authorization: Bearer <jwt>`; this module verifies the
 * JWT against WorkOS's published JWKS and maps the user by openId, upserting
 * on first sight. The resulting identity has the same shape resolveDevIdentity
 * produces, so every route works unchanged.
 *
 * The server redirect routes (/api/auth/workos/sign-in, /callback, /logout)
 * remain for the admin plane and legacy flows; they issue the same
 * app_session_id cookie the dev-auth path uses.
 *
 * Registered only when WORKOS_CLIENT_ID, WORKOS_API_KEY, and
 * WORKOS_COOKIE_PASSWORD are configured.
 */

export function workosConfigured(): boolean {
  return Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD);
}

export function resolveWorkosOpenId(workosUserId: string): string {
  return `workos_${workosUserId}`.slice(0, 64);
}

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
function workosJwks() {
  // The JWKS endpoint is per-client. Sourcing it from configuration (instead of
  // the literal client id that used to be inlined here) keeps the trust anchor
  // and the client the server claims to be in the same place — rotating
  // WORKOS_CLIENT_ID without editing source no longer leaves the server
  // verifying against a stale key set.
  const clientId = process.env.WORKOS_CLIENT_ID;
  if (!clientId) throw new Error("WORKOS_CLIENT_ID is not configured");
  if (!jwksCache) jwksCache = createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}/`));
  return jwksCache;
}

/**
 * Resolve a post-sign-in redirect target from an OAuth `state` value.
 *
 * `state` is round-tripped through the identity provider, so it is fully
 * attacker-controllable at the callback: anyone can hand a victim a crafted
 * `/api/auth/workos/callback?...&state=return=<target>` link. Only same-origin
 * absolute paths are therefore honoured; anything that could leave the origin
 * (absolute URLs, protocol-relative `//host`, backslash variants browsers
 * normalise into slashes, or embedded control characters) falls back.
 */
export function safeReturnPath(candidate: string | undefined | null, fallback: string): string {
  if (!candidate) return fallback;
  let decoded = candidate;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    // Malformed percent-encoding: never hand a half-decoded value to redirect().
    return fallback;
  }
  if (!decoded.startsWith("/")) return fallback;
  // "//evil.com" and "/\evil.com" are treated as protocol-relative by browsers.
  if (decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback;
  return decoded;
}

/**
 * OAuth `state` binding.
 *
 * The callback used to accept whatever `state` arrived, so the flow had no CSRF
 * protection: an attacker who completes their own AuthKit sign-in and captures
 * the one-time `code` before it is consumed could lure a victim to the callback,
 * and the victim's browser would receive a session cookie for the *attacker's*
 * account — so anything the victim then uploaded landed in the attacker's
 * account. It also let an attacker choose the post-sign-in redirect.
 *
 * `state` is now `<purpose>.<nonce>`, where the nonce is generated at flow start
 * and stored in an httpOnly cookie. The callback refuses any `state` whose nonce
 * does not match that cookie, which an attacker cannot set on the victim's
 * browser.
 */
export const OAUTH_STATE_COOKIE = "skipwait_oauth_state";
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const OAUTH_STATE_NONCE_BYTES = 16;

export function createOAuthState(purpose: string): { state: string; nonce: string } {
  const nonce = randomBytes(OAUTH_STATE_NONCE_BYTES).toString("hex");
  return { state: `${purpose}.${nonce}`, nonce };
}

export function parseOAuthState(state: string): { purpose: string; nonce: string } | null {
  // Split on the LAST dot: the purpose may be a `return=<path>` marker that
  // itself contains dots, while the nonce is always trailing hex.
  const index = state.lastIndexOf(".");
  if (index <= 0) return null;
  const purpose = state.slice(0, index);
  const nonce = state.slice(index + 1);
  if (!purpose || !/^[0-9a-f]{32}$/.test(nonce)) return null;
  return { purpose, nonce };
}

/** Constant-time compare of two nonces, tolerating a missing or malformed one. */
export function oauthNonceMatches(expected: string | undefined, received: string): boolean {
  if (!expected || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

export function oauthStateCookieOptions(req: Request) {
  return {
    httpOnly: true,
    path: "/",
    // Lax still sends the cookie on the provider's top-level GET redirect back
    // to the callback, which is the only place it needs to arrive.
    sameSite: "lax" as const,
    secure: isSecureRequest(req),
  };
}

/** Verify a WorkOS access JWT (Bearer) and map it to the app identity. */
async function identityFromWorkosJwt(bearer: string): Promise<DevIdentity | undefined> {
  const { payload } = await jwtVerify(bearer, workosJwks(), { issuer: "https://api.workos.com" });
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) return undefined;
  const openId = resolveWorkosOpenId(sub);
  const email = typeof payload.email === "string" ? payload.email : null;
  const emailVerified = payload.email_verified === true;
  const name = typeof payload.name === "string" && payload.name ? payload.name : email?.split("@")[0] ?? null;
  await db.upsertUser({ openId, name, email, loginMethod: "workos", lastSignedIn: new Date() });
  const account = await db.getUserByOpenId(openId);
  if (!account) return undefined;
  // Same suspension choke point as resolveDevIdentity: the WorkOS JWT path
  // loads the row here, so a suspended account resolves as signed out.
  if (account.suspended) return undefined;
  const primaryEmail: DevEmailAddress | null = email
    ? { id: `workos-email-${email}`, emailAddress: email, verification: { status: emailVerified ? "verified" : "unverified" } }
    : null;
  return { account, primaryEmail, emailAddresses: primaryEmail ? [primaryEmail] : [] };
}

/** Identity resolution for the WorkOS plane: SDK JWT first, app session second. */
export async function resolveWorkosIdentity(req: Request): Promise<DevIdentity | undefined> {
  const authHeader = req.headers.authorization;
  const bearer = typeof authHeader === "string" && authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
  if (bearer && bearer.split(".").length === 3) {
    try {
      return await identityFromWorkosJwt(bearer);
    } catch (error) {
      console.warn("[Auth] WorkOS JWT verification failed:", (error as Error).message?.slice(0, 120));
    }
  }
  return resolveDevIdentity(req);
}

export function createWorkosAuthRoutesRegistrar(deps: { workos?: WorkOS } = {}) {
  return function registerWorkosAuthRoutes(app: Express) {
    if (!workosConfigured()) return;
    const workos = deps.workos ?? new WorkOS(process.env.WORKOS_API_KEY!, { clientId: process.env.WORKOS_CLIENT_ID! });
    const configuredRedirectUri = process.env.WORKOS_REDIRECT_URI;
    // In production the canonical URI is fixed (skipwait.me). In dev, derive it
    // from the request host so any local port works without env edits.
    const redirectUriFor = (req: { protocol: string; get: (h: string) => string | undefined; headers: Request["headers"] }) =>
      // `publicRequestHost`, not the raw `Host`: behind the Pages proxy the raw
      // Host is the container's workers.dev name, which would send the OAuth
      // callback to a host the session cookie is not scoped to.
      configuredRedirectUri || `${req.protocol}://${publicRequestHost(req) ?? req.get("host")}/api/auth/workos/callback`;

    // Begin a flow: mint the nonce, bind it to the caller's browser via a
    // short-lived cookie, and hand the paired state to the provider.
    const beginAuthorization = (req: Request, res: Response, screenHint: "sign-in" | "sign-up", purpose: string, loginHint?: string) => {
      const { state, nonce } = createOAuthState(purpose);
      res.cookie(OAUTH_STATE_COOKIE, nonce, { ...oauthStateCookieOptions(req), maxAge: OAUTH_STATE_TTL_MS });
      return res.redirect(302, workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        redirectUri: redirectUriFor(req),
        state,
        screenHint,
        ...(loginHint ? { loginHint } : {}),
      }));
    };

    app.get("/api/auth/workos/sign-in", (req, res) => beginAuthorization(req, res, "sign-in", "skipwait-auth"));
    app.get("/api/auth/workos/sign-up", (req, res) => beginAuthorization(req, res, "sign-up", "skipwait-auth"));

    // Administrator plane: only the durable skipwait.me admin identity may
    // proceed. Any other address is bounced before AuthKit is ever reached.
    app.get("/api/auth/workos/admin", (req, res) => {
      const durableAdmin = (process.env.SKIPWAIT_ADMIN_EMAIL || "ayodhya@skipwait.me").trim().toLowerCase();
      const loginHint = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      if (!loginHint || loginHint !== durableAdmin) return res.status(403).send("Administrator sign-in is restricted to the skipwait.me administrator account");
      return beginAuthorization(req, res, "sign-in", "skipwait-admin", loginHint);
    });

    app.get("/api/auth/workos/callback", async (req, res) => {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      // The nonce is single-use: consume and clear it here, before any branch
      // that can fail, so a replayed callback cannot reuse it.
      const cookieNonce = parseCookieHeader(req.headers.cookie ?? "")[OAUTH_STATE_COOKIE];
      res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions(req));
      if (!code) return res.status(400).send("Authentication could not be completed");
      // CSRF binding: a `state` this browser did not initiate is refused, so a
      // crafted callback link cannot sign the victim into the attacker's account.
      const parsed = parseOAuthState(state);
      if (!parsed || !oauthNonceMatches(cookieNonce, parsed.nonce)) {
        console.warn("[Auth] WorkOS callback rejected: state did not match the initiating browser's nonce");
        return res.status(400).send("This sign-in link is no longer valid. Start sign-in again from skipwait.me.");
      }
      try {
        const auth = await workos.userManagement.authenticateWithCode({ clientId: process.env.WORKOS_CLIENT_ID!, code });
        const user = auth.user;
        // Administrator plane strict match (defense-in-depth): when the flow
        // started from the admin gate (state=skipwait-admin), the authenticated
        // email must end precisely with the administrator domain. Anything else
        // is rejected here at the callback, not just the entry route.
        if (parsed.purpose === "skipwait-admin") {
          const adminDomain = (process.env.SKIPWAIT_ADMIN_EMAIL || "ayodhya@skipwait.me").split("@")[1]?.trim().toLowerCase() ?? "skipwait.me";
          const email = user.email.trim().toLowerCase();
          if (!email.endsWith(`@${adminDomain}`)) return res.status(403).send("Administrator sign-in requires a verified skipwait.me work email");
        }
        const openId = resolveWorkosOpenId(user.id);
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];
        await db.upsertUser({ openId, name, email: user.email, loginMethod: "workos", lastSignedIn: new Date() });
        if (auth.sealedSession) res.cookie("workos_session", auth.sealedSession, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
        const token = await sdkCreateSessionToken(openId, name);
        res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
        // The purpose marker is only reachable once the nonce has been verified
        // above, and safeReturnPath still constrains it to a same-origin path.
        const returnTo = safeReturnPath(
          parsed.purpose.startsWith("return=") ? parsed.purpose.slice(7) : undefined,
          safeReturnPath(process.env.WORKOS_POST_SIGNIN_PATH, "/")
        );
        res.redirect(302, returnTo);
      } catch {
        res.status(502).send("We could not complete sign-in. Please try again.");
      }
    });

    app.post("/api/auth/workos/logout", (req, res) => {
      res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
      res.clearCookie("workos_session", getSessionCookieOptions(req));
      res.json({ signedOut: true });
    });
  };
}

async function sdkCreateSessionToken(openId: string, name: string): Promise<string> {
  const { sdk } = await import("./sdk");
  return sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
}
