import { WorkOS } from "@workos-inc/node";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";

/**
 * WorkOS AuthKit authentication for production skipwait.me.
 *
 * AuthKit hosts the sign-in UI (email code, Google, Microsoft, SSO). After the
 * AuthKit callback this module upserts the WorkOS user and issues the SAME
 * app_session_id JWT used by the managed-OAuth and dev-auth paths, so every
 * downstream identity check keeps working unchanged (resolveDevIdentity
 * verifies that JWT and loads the user by openId).
 *
 * Registered only when WORKOS_CLIENT_ID, WORKOS_API_KEY, and
 * WORKOS_COOKIE_PASSWORD are configured AND Clerk is not (CLERK_SECRET_KEY
 * unset), so exactly one production auth authority is active at a time.
 *
 * Work-email enrollment: AuthKit verifies the sign-in email itself
 * (emailVerified), so the signed-in user's verified address enrolls directly.
 * Enrollment of a separate company address is handled server-side by
 * server/workEmailOtp.ts and delivered with ZeptoMail.
 */

export function workosConfigured(): boolean {
  return Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD && !process.env.CLERK_SECRET_KEY);
}

export function resolveWorkosOpenId(workosUserId: string): string {
  return `workos_${workosUserId}`.slice(0, 64);
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
      res.redirect(302, authorizationUrl("sign-in", redirectUriFor(req), loginHint));
    });

    app.get("/api/auth/workos/callback", async (req, res) => {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      if (!code) return res.status(400).send("Authentication could not be completed");
      try {
        const auth = await workos.userManagement.authenticateWithCode({ clientId: process.env.WORKOS_CLIENT_ID!, code });
        const user = auth.user;
        const openId = resolveWorkosOpenId(user.id);
        const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email.split("@")[0];
        await db.upsertUser({ openId, name, email: user.email, loginMethod: "workos", lastSignedIn: new Date() });
        if (auth.sealedSession) res.cookie("workos_session", auth.sealedSession, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
        const token = await (await import("./sdk")).sdk.createSessionToken(openId, { name, expiresInMs: ONE_YEAR_MS });
        res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: ONE_YEAR_MS });
        res.redirect(302, process.env.WORKOS_POST_SIGNIN_PATH || "/");
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
