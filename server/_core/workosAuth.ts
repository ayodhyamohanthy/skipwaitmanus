import { WorkOS } from "@workos-inc/node";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Express, Request } from "express";
import * as db from "../db";
import { resolveDevIdentity, type DevIdentity, type DevEmailAddress } from "./devAuth";
import { getSessionCookieOptions } from "./cookies";

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
  if (!jwksCache) jwksCache = createRemoteJWKSet(new URL("https://api.workos.com/sso/jwks/client_01M17TTFJ6784B1CN6MHAHB60Y/"));
  return jwksCache;
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
    const redirectUriFor = (req: { protocol: string; get: (h: string) => string | undefined }) =>
      configuredRedirectUri || `${req.protocol}://${req.get("host")}/api/auth/workos/callback`;

    const authorizationUrl = (screenHint: "sign-in" | "sign-up", redirectUri: string, loginHint?: string) => workos.userManagement.getAuthorizationUrl({
      provider: "authkit",
      redirectUri,
      state: "skipwait-auth",
      screenHint,
      ...(loginHint ? { loginHint } : {}),
    });

    app.get("/api/auth/workos/sign-in", (req, res) => res.redirect(302, authorizationUrl("sign-in", redirectUriFor(req))));
    app.get("/api/auth/workos/sign-up", (req, res) => res.redirect(302, authorizationUrl("sign-up", redirectUriFor(req))));

    // Administrator plane: only the durable skipwait.me admin identity may
    // proceed. Any other address is bounced before AuthKit is ever reached.
    app.get("/api/auth/workos/admin", (req, res) => {
      const durableAdmin = (process.env.SKIPWAIT_ADMIN_EMAIL || "ayodhya@skipwait.me").trim().toLowerCase();
      const loginHint = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      if (!loginHint || loginHint !== durableAdmin) return res.status(403).send("Administrator sign-in is restricted to the skipwait.me administrator account");
      res.redirect(302, workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        redirectUri: redirectUriFor(req),
        state: "skipwait-admin",
        screenHint: "sign-in",
        loginHint,
      }));
    });

    app.get("/api/auth/workos/callback", async (req, res) => {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code) return res.status(400).send("Authentication could not be completed");
      try {
        const auth = await workos.userManagement.authenticateWithCode({ clientId: process.env.WORKOS_CLIENT_ID!, code });
        const user = auth.user;
        // Administrator plane strict match (defense-in-depth): when the flow
        // started from the admin gate (state=skipwait-admin), the authenticated
        // email must end precisely with the administrator domain. Anything else
        // is rejected here at the callback, not just the entry route.
        if (state === "skipwait-admin") {
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
        const returnTo = state.startsWith("return=") ? decodeURIComponent(state.slice(7)) : process.env.WORKOS_POST_SIGNIN_PATH || "/";
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
