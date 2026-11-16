import { WorkOS } from "@workos-inc/node";
import { revokeHostedSessions } from "./hostedSessionRevoke";
import { registerSeekerEmailCodeRoutes } from "./seekerEmailCode";
import { HOSTED_LINK_COOKIE, HOSTED_LINK_MAX_AGE_MS, readHostedLink, revokeHostedSessionOnAccountSwitch, revokeLinkedHostedSession, signHostedLink } from "./hostedAccountSwitch";
import { COOKIE_NAME } from "@shared/const";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { safeAuthReturnTo } from "@shared/authReturnTo";
import type { Express, Request } from "express";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { randomUUID } from "node:crypto";
import { BoundedTtlCache } from "../boundedTtlCache";
const authDiagnostics = new BoundedTtlCache<string,{stage:string;errorName:string;safeMessage:string;timestamp:string}>(100);
import { resolveDevIdentity, type DevIdentity, type DevEmailAddress } from "./devAuth";
import { revokeReferrerStepUpsForSessionToken } from "../referrerStepUp";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { completeWorkosLogin, resolveWorkosOpenId } from "./workosSession";

export { resolveWorkosOpenId };

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

const WORKOS_ISSUER = "https://api.workos.com";
const CLIENT_ID_PATTERN = /^client_[A-Za-z0-9]+$/;
const workosJwksByClient = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function configuredWorkosClientId(): string {
  const clientId = (process.env.WORKOS_CLIENT_ID || "").trim();
  if (!CLIENT_ID_PATTERN.test(clientId)) throw new Error("WORKOS_CLIENT_ID is missing or malformed");
  return clientId;
}

export function workosConfigured(): boolean {
  const allConfigured = Boolean(process.env.WORKOS_CLIENT_ID && process.env.WORKOS_API_KEY && process.env.WORKOS_COOKIE_PASSWORD);
  if (!allConfigured && process.env.NODE_ENV === "production") {
    // Refusing to fall through to the dev session plane is deliberate: an
    // all-unset WorkOS config would otherwise register /api/dev-auth/login and
    // mint real app_session_id cookies for any self-asserted email. A missing
    // secret must stop the release, not downgrade the auth plane.
    throw new Error("WorkOS production configuration is incomplete");
  }
  if (allConfigured) configuredWorkosClientId();
  return allConfigured;
}

export function adminCallbackAllowed(input:{email:string;state:string;configuredEmail?:string;bootstrapEnabled?:boolean}){
  if(input.state!=="skipwait-admin"&&input.state!=="skipwait-admin-bootstrap")return true;
  const expected=(input.configuredEmail||"").trim().toLowerCase();
  if(!expected||input.email.trim().toLowerCase()!==expected)return false;
  return input.state!=="skipwait-admin-bootstrap"||input.bootstrapEnabled===true;
}

function workosJwks(clientId: string) {
  let cached = workosJwksByClient.get(clientId);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(`https://api.workos.com/sso/jwks/${clientId}`));
    workosJwksByClient.set(clientId, cached);
  }
  return cached;
}

export function validateWorkosAccessClaims(payload: Record<string, unknown>, clientId: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (payload.iss !== WORKOS_ISSUER || payload.client_id !== clientId) return false;
  if (typeof payload.sub !== "string" || !payload.sub.startsWith("user_") || typeof payload.sid !== "string" || !payload.sid.startsWith("session_") || typeof payload.jti !== "string" || !payload.jti) return false;
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 60 || payload.iat < nowSeconds - 24 * 60 * 60) return false;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds || payload.exp - payload.iat > 60 * 60) return false;
  // WorkOS access tokens are client-bound with client_id rather than aud.
  // If aud/azp is present, it must not contradict that binding.
  const audiences = typeof payload.aud === "string" ? [payload.aud] : Array.isArray(payload.aud) ? payload.aud : [];
  if (audiences.length && !audiences.includes(clientId)) return false;
  if (audiences.length > 1 && payload.azp !== clientId) return false;
  if (payload.azp !== undefined && payload.azp !== clientId) return false;
  const tokenUse = payload.token_use ?? payload.token_type;
  if (tokenUse !== undefined && tokenUse !== "access" && tokenUse !== "access_token") return false;
  return true;
}

const WORKOS_IDENTITY_CACHE_TTL_MS = 60_000;
const WORKOS_IDENTITY_CACHE_MAX = 5_000;
const workosIdentityCache = new Map<string, { identity: DevIdentity; expiresAt: number }>();
export function clearWorkosIdentityCacheForTests() { workosIdentityCache.clear(); }

/**
 * The hosted session id of the caller's own current sign-in: from the verified app session cookie
 * (the web app authenticates with that cookie), else from a verified WorkOS bearer. Null when unknown,
 * for example sessions issued before the sid was recorded; callers must then treat "this device" as unknown.
 */
export async function currentWorkosSessionId(req: Request): Promise<string | null> {
  const cookie = parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME];
  if (cookie) {
    try {
      const { sdk } = await import("./sdk");
      const session = await sdk.verifySession(cookie);
      if (session?.sid) return session.sid;
    } catch { /* fall through to the bearer */ }
  }
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return null;
  const bearer = header.slice(7).trim();
  if (bearer.split(".").length !== 3) return null;
  try {
    const clientId = configuredWorkosClientId();
    const { payload } = await jwtVerify(bearer, workosJwks(clientId), { issuer: WORKOS_ISSUER, algorithms: ["RS256"] });
    return validateWorkosAccessClaims(payload, clientId) && typeof payload.sid === "string" ? payload.sid : null;
  } catch { return null; }
}

/** D-057-session-gate §0b.2: the session key of a verified WorkOS access token is its own hosted session id. */
export function sessionKeyFromWorkosClaims(payload: Record<string, unknown>): string | undefined {
  return typeof payload.sid === "string" && /^session_[A-Za-z0-9]+$/.test(payload.sid) ? `workos:${payload.sid}` : undefined;
}

async function identityFromWorkosJwt(bearer: string): Promise<DevIdentity | undefined> {
  const clientId = configuredWorkosClientId();
  const { payload } = await jwtVerify(bearer, workosJwks(clientId), { issuer: WORKOS_ISSUER, algorithms: ["RS256"] });
  if (!validateWorkosAccessClaims(payload, clientId)) return undefined;
  const sub = payload.sub as string;
  const openId = resolveWorkosOpenId(sub);
  const existing = await db.getUserByOpenId(openId);
  if (existing?.suspended) return undefined;
  if (existing?.sessionsValidAfter && existing.sessionsValidAfter > existing.createdAt && (payload.iat as number) * 1000 < existing.sessionsValidAfter.getTime()) return undefined;
  // Hot path: every signed-in request lands here. The WorkOS profile lookup
  // and login-identity upsert are network/DB round trips (seconds in prod), so
  // reuse a verified result for the same token briefly. Suspension and
  // session revocation are re-checked against the DB above on every request.
  const cacheKey = `${sub}:${String(payload.iat ?? "")}`;
  const cached = workosIdentityCache.get(cacheKey);
  // D-057: the Bearer identity is keyed by this token's own sid; it never carries the amr claim.
  const sessionKey = sessionKeyFromWorkosClaims(payload);
  if (cached && cached.expiresAt > Date.now() && existing) return { ...cached.identity, account: { ...cached.identity.account, ...existing }, ...(sessionKey ? { sessionKey } : {}) };
  const workos = new WorkOS(process.env.WORKOS_API_KEY!, { clientId });
  const user = await workos.userManagement.getUser(sub);
  if (user.id !== sub) return undefined;
  const email = user.email.trim().toLowerCase();
  const emailVerified = user.emailVerified;
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || email.split("@")[0];
  const account = await db.resolveLoginIdentity({ provider: "workos", subject: sub, openId, email, emailVerified, name, loginMethod: "workos" });
  if (!account || account.suspended) return undefined;
  if (account.sessionsValidAfter && account.sessionsValidAfter > account.createdAt && (payload.iat as number) * 1000 < account.sessionsValidAfter.getTime()) return undefined;
  const primaryEmail: DevEmailAddress | null = email ? { id: `workos-email-${email}`, emailAddress: email, verification: { status: emailVerified ? "verified" : "unverified" } } : null;
  const identity: DevIdentity = { account, primaryEmail, emailAddresses: primaryEmail ? [primaryEmail] : [] };
  if (workosIdentityCache.size >= WORKOS_IDENTITY_CACHE_MAX) workosIdentityCache.clear();
  workosIdentityCache.set(cacheKey, { identity, expiresAt: Date.now() + WORKOS_IDENTITY_CACHE_TTL_MS });
  return sessionKey ? { ...identity, sessionKey } : identity;
}

type IdentityResolverDependencies = {
  identityFromBearer?: (bearer: string) => Promise<DevIdentity | undefined>;
  resolveCookieIdentity?: (req: Request) => Promise<DevIdentity | undefined>;
};

function hasAppSessionCookie(req: Request): boolean {
  return Boolean(parseCookieHeader(req.headers.cookie ?? "")[COOKIE_NAME]);
}

export function isSameOriginBrowserRequest(req: Request): boolean {
  const origin = req.header("origin");
  if (origin) {
    try { return new URL(origin).origin === `${req.protocol}://${req.get("host")}`; }
    catch { return false; }
  }
  return req.header("sec-fetch-site") === "same-origin";
}

// Several layers (route middleware, the route itself, tRPC context) resolve
// identity for the same request. Resolve once per request object.
const identityByRequest = new WeakMap<Request, Promise<DevIdentity | undefined>>();
export function resolveWorkosIdentity(req: Request, dependencies: IdentityResolverDependencies = {}): Promise<DevIdentity | undefined> {
  if (dependencies.identityFromBearer || dependencies.resolveCookieIdentity) return resolveWorkosIdentityUncached(req, dependencies);
  const inFlight = identityByRequest.get(req);
  if (inFlight) return inFlight;
  const resolved = resolveWorkosIdentityUncached(req, dependencies);
  identityByRequest.set(req, resolved);
  resolved.catch(() => identityByRequest.delete(req));
  return resolved;
}

async function resolveWorkosIdentityUncached(req: Request, dependencies: IdentityResolverDependencies = {}): Promise<DevIdentity | undefined> {
  const identityFromBearer = dependencies.identityFromBearer ?? identityFromWorkosJwt;
  const resolveCookieIdentity = dependencies.resolveCookieIdentity ?? resolveDevIdentity;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    let bearerIdentity: DevIdentity | undefined;
    if (authHeader.startsWith("Bearer ")) {
      const bearer = authHeader.slice(7).trim();
      if (bearer.split(".").length === 3) {
        try { bearerIdentity = await identityFromBearer(bearer); }
        catch (error) { console.warn("[Auth] WorkOS JWT verification failed:", (error as Error).message?.slice(0, 120)); }
      }
    }
    if (bearerIdentity) return bearerIdentity;
    // AuthKit can leave an expired access token in a same-origin browser while
    // the independently signed app session cookie is still valid. Keep bearer
    // failure terminal for cross-origin/API clients; only the browser's own
    // origin may fall back, and only when it actually presents the app cookie.
    if (hasAppSessionCookie(req) && isSameOriginBrowserRequest(req)) return resolveCookieIdentity(req);
    return undefined;
  }
  return resolveCookieIdentity(req);
}

/** Social sign-ins verified live against the WorkOS authorize endpoint on Oct 14 2026 (LinkedIn and Slack re-verified Oct 16 2026: both 302 to the provider). Apple is not enabled in the dashboard (404), so it is not offered. */
export const SOCIAL_PROVIDERS: Record<string, "GoogleOAuth" | "MicrosoftOAuth" | "GitHubOAuth" | "LinkedInOAuth" | "SlackOAuth"> = { google: "GoogleOAuth", microsoft: "MicrosoftOAuth", github: "GitHubOAuth", linkedin: "LinkedInOAuth", slack: "SlackOAuth" };

export function createWorkosAuthRoutesRegistrar(deps: { workos?: WorkOS } = {}) {
  return function registerWorkosAuthRoutes(app: Express) {
    if (!workosConfigured()) return;
    const clientId = configuredWorkosClientId();
    const workos = deps.workos ?? new WorkOS(process.env.WORKOS_API_KEY!, { clientId });
    const configuredRedirectUri = process.env.WORKOS_REDIRECT_URI;
    // In production the canonical URI is fixed (skipwait.me). In dev, derive it
    // from the request host so any local port works without env edits.
    const redirectUriFor = (req: { protocol: string; get: (h: string) => string | undefined }) =>
      configuredRedirectUri || `${req.protocol}://${req.get("host")}/api/auth/workos/callback`;

    const returnCookie = "workos_auth_return";
    const returnKey = new TextEncoder().encode(process.env.WORKOS_COOKIE_PASSWORD!);
    const returnAudience = "skipwait-workos-return";
    const hostedLinkCookieOptions = (req: Request) => ({ ...getSessionCookieOptions(req), path: "/api/auth/workos" });
    const returnCookieOptions = (req: Request) => ({ ...getSessionCookieOptions(req), path: "/api/auth/workos/callback" });

    for (const screenHint of ["sign-in", "sign-up"] as const) {
      app.get(`/api/auth/workos/${screenHint}`, async (req, res) => {
        try {
          const redirectUri = redirectUriFor(req);
          const returnTo = safeAuthReturnTo(req.query.returnTo, redirectUri) ?? safeAuthReturnTo(process.env.WORKOS_POST_SIGNIN_PATH, redirectUri) ?? "/";
          // The kit sign-in email step passes the typed address so AuthKit pre-fills it.
          const hint = typeof req.query.login_hint === "string" ? req.query.login_hint.trim().toLowerCase() : "";
          const loginHint = hint.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hint) ? hint : "";
          // Social buttons on the kit sign-in pick a WorkOS provider. Only providers enabled in the WorkOS dashboard are listed here; anything else falls back to AuthKit.
          const authProvider = typeof req.query.provider === "string" ? SOCIAL_PROVIDERS[req.query.provider] ?? "authkit" : "authkit";
          const state = randomUUID();
          const token = await new SignJWT({ returnTo }).setProtectedHeader({ alg: "HS256" }).setAudience(returnAudience).setSubject(state).setIssuedAt().setExpirationTime("10m").sign(returnKey);
          res.cookie(returnCookie, token, { ...returnCookieOptions(req), maxAge: 10 * 60_000 });
          // Typed email differs from the account this browser last signed in with: end that hosted session first,
          // so AuthKit asks for the code instead of silently signing the previous account back in. Fail-soft.
          if (authProvider === "authkit" && loginHint) {
            const linked = await readHostedLink(parseCookieHeader(req.headers.cookie ?? "")[HOSTED_LINK_COOKIE], returnKey);
            if (await revokeHostedSessionOnAccountSwitch(workos.userManagement as never, linked, loginHint, { log: message => console.warn("[workos-switch]", message) })) res.clearCookie(HOSTED_LINK_COOKIE, hostedLinkCookieOptions(req));
          }
          // The /sign-in page's explicit Continue button asks for a fresh AuthKit screen (fresh=1): drop the hosted session this browser is linked to.
          if (authProvider === "authkit" && screenHint === "sign-in" && req.query.fresh === "1") {
            const linked = await readHostedLink(parseCookieHeader(req.headers.cookie ?? "")[HOSTED_LINK_COOKIE], returnKey);
            if (await revokeLinkedHostedSession(workos.userManagement as never, linked, { log: message => console.warn("[workos-fresh]", message) })) res.clearCookie(HOSTED_LINK_COOKIE, hostedLinkCookieOptions(req));
          }
          res.set("Cache-Control", "no-store").redirect(302, workos.userManagement.getAuthorizationUrl({ provider: authProvider, redirectUri, state, ...(authProvider === "authkit" ? { screenHint } : {}), ...(loginHint ? { loginHint } : {}) }));
        } catch {
          res.status(502).send("Authentication could not be started");
        }
      });
    }

    // Administrator plane: only the durable skipwait.me admin identity may
    // proceed. Any other address is bounced before AuthKit is ever reached.
    app.get("/api/auth/workos/admin", (req, res) => {
      const durableAdmin = (process.env.SKIPWAIT_ADMIN_EMAIL || "").trim().toLowerCase();
      const loginHint = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
      if (!durableAdmin || !loginHint || loginHint !== durableAdmin) return res.status(403).send("Administrator sign-in is restricted to the configured administrator account");
      const bootstrap = process.env.ENABLE_ADMIN_BOOTSTRAP === "true";
      res.redirect(302, workos.userManagement.getAuthorizationUrl({
        provider: "authkit",
        redirectUri: redirectUriFor(req),
        state: bootstrap ? "skipwait-admin-bootstrap" : "skipwait-admin",
        screenHint: "sign-in",
        loginHint,
      }));
    });

    app.get("/api/auth/workos/callback", async (req, res) => {
      const code = typeof req.query.code === "string" ? req.query.code : "";
      const state = typeof req.query.state === "string" ? req.query.state : "";
      if (!code) return res.status(400).send("Authentication could not be completed");
      const adminState = state === "skipwait-admin" || state === "skipwait-admin-bootstrap";
      let returnTo = "/admin/users";
      if (!adminState) {
        const token = parseCookieHeader(req.headers.cookie ?? "")[returnCookie];
        res.clearCookie(returnCookie, returnCookieOptions(req));
        try {
          const { payload } = await jwtVerify(token ?? "", returnKey, { algorithms: ["HS256"], audience: returnAudience, subject: state });
          const destination = safeAuthReturnTo(payload.returnTo, redirectUriFor(req));
          if (!state || !destination) throw new Error("Invalid auth return");
          returnTo = destination;
        } catch {
          return res.status(400).send("Sign-in expired or could not be verified. Please start again.");
        }
      }
      let stage = "authenticate";
      try {
        const auth = await workos.userManagement.authenticateWithCode({ clientId, code });
        stage = "authorize";
        const user = auth.user;
        // Administrator plane strict match (defense-in-depth): when the flow
        // started from the admin gate (state=skipwait-admin), the authenticated
        // email must exactly match the configured administrator address. Anything else
        // is rejected here at the callback, not just the entry route.
        if (state === "skipwait-admin" || state === "skipwait-admin-bootstrap") {
          if (!adminCallbackAllowed({ email:user.email, state, configuredEmail:process.env.SKIPWAIT_ADMIN_EMAIL, bootstrapEnabled:process.env.ENABLE_ADMIN_BOOTSTRAP === "true" })) return res.status(403).send(state === "skipwait-admin-bootstrap" && process.env.ENABLE_ADMIN_BOOTSTRAP !== "true" ? "This administrator bootstrap link has expired. Start a fresh administrator sign-in." : "Administrator sign-in requires the exact configured administrator email.");
        }
        // One identity path for every sign-in (server/_core/workosSession.ts):
        // the canonical resolver links by provider subject first and only uses
        // the email when WorkOS attests it is verified. The session is minted
        // for the canonical account's openId through the active-account gate,
        // so the cookie resolves to the same user on every later request.
        const outcome = await completeWorkosLogin(req, res, {
          user,
          sealedSession: auth.sealedSession,
          accessToken: auth.accessToken,
          signHostedLink: input => signHostedLink(input, returnKey),
          onStage: next => { stage = next; },
        });
        if (outcome.status === "blocked") {
          console.warn("[workos-callback]", { stage, code: outcome.code });
          return res.status(403).send(outcome.code === "IDENTITY_REVIEW_REQUIRED" ? "This account needs a quick review before it can sign in. Contact support@skipwait.me." : "This account is not active. Contact support@skipwait.me.");
        }
        res.redirect(302, returnTo);
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "unknown";
        const safeMessage = error instanceof Error ? error.message.slice(0,160).replace(/[\w.+-]+@[\w.-]+/g,"[redacted]") : "unknown";
        const correlationId = randomUUID();
        authDiagnostics.set(correlationId,{stage,errorName,safeMessage,timestamp:new Date().toISOString()},15*60_000);
        console.error("[workos-callback]", { stage, code:errorName, correlationId });
        const bootstrapDiagnostic = process.env.ENABLE_ADMIN_BOOTSTRAP === "true" && state === "skipwait-admin-bootstrap" ? ` (${stage}:${errorName}; ${correlationId})` : "";
        res.status(502).send(`Authentication could not be completed${bootstrapDiagnostic}`);
      }
    });
    registerSeekerEmailCodeRoutes(app);
    app.get("/api/auth/workos/admin-diagnostic/:id",(req,res)=>{
      if(process.env.ENABLE_ADMIN_BOOTSTRAP!=="true"||req.header("x-admin-secret")!==process.env.ADMIN_SMOKE_SECRET)return res.status(404).send("Not found");
      const diagnostic=authDiagnostics.get(req.params.id);return diagnostic?res.set("Cache-Control","no-store").json(diagnostic):res.status(404).send("Not found");
    });
    app.get("/api/auth/workos/runtime-diagnostic",(req,res)=>{
      if(process.env.ENABLE_ADMIN_BOOTSTRAP!=="true"||!process.env.ADMIN_SMOKE_SECRET||req.header("x-admin-secret")!==process.env.ADMIN_SMOKE_SECRET)return res.status(404).send("Not found");
      return res.set("Cache-Control","no-store").json({workosApiKeyPresent:Boolean(process.env.WORKOS_API_KEY)});
    });

    app.post("/api/auth/workos/logout", async (req, res) => {
      const token = req.headers.cookie?.match(/(?:^|;\s*)app_session_id=([^;]+)/)?.[1];
      const { sdk } = await import("./sdk");
      // Resolve who is signing out from their own valid session only, never from client-supplied ids.
      let hostedUserIds: string[] = [];
      try {
        const session = await sdk.verifySession(token);
        const account = session ? await db.getUserByOpenId(session.openId) : undefined;
        if (account) hostedUserIds = await db.listWorkosSubjectsForUser(account.id);
      } catch { hostedUserIds = []; }
      // D-057 §0b.3: mark this account's step-up proofs revoked for the audit trail (the revocation below already ends them).
      await revokeReferrerStepUpsForSessionToken(token);
      await sdk.revokeSession(token);
      if (hostedUserIds.length) {
        const outcome = await revokeHostedSessions(workos.userManagement as never, hostedUserIds, { log: message => console.warn("[workos-logout]", message) }).catch(() => ({ revoked: 0, failed: 1 }));
        if (outcome.failed) console.warn("[workos-logout]", { hostedSessionsRevoked: outcome.revoked, failed: outcome.failed });
      }
      res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
      res.clearCookie("workos_session", getSessionCookieOptions(req));
      res.clearCookie(HOSTED_LINK_COOKIE, hostedLinkCookieOptions(req));
      res.json({ signedOut: true });
    });
  };
}

/** Re-exported for server/_core/hostedSessionId.test.ts; the session helper lives in workosSession.ts. */
export { hostedSessionIdFromAccessToken } from "./workosSession";
