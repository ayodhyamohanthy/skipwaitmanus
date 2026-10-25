import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { COOKIE_NAME } from "@shared/const";
import { employerAccounts, profiles, users } from "../../drizzle/schema";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk, SESSION_ACCESS_TTL_MS } from "./sdk";
import { resolveTrustedClientIp } from "./trustedClientIp";

/**
 * Reviewer sign-in (founder-approved Oct 22 2026, for the Razorpay website review and our own QA).
 * The public login stays code-only. This route is OFF unless REVIEWER_LOGIN_ENABLED=true, accepts only the
 * fixed demo emails below, checks a scrypt hash held in a secret, and issues an ordinary session for a demo
 * account that has no real data. The admin demo account exists only where REVIEWER_ALLOW_ADMIN=true (QA, never prod).
 */
export const REVIEWER_DOMAIN = "reviewer.skipwait.me";
export type ReviewerRole = "seeker" | "referrer" | "employer" | "admin";
const ACCOUNTS: Record<ReviewerRole, { email: string; hashEnv: string; landing: string }> = {
  seeker: { email: `seeker@${REVIEWER_DOMAIN}`, hashEnv: "REVIEWER_SEEKER_PASSWORD_HASH", landing: "/plans" },
  referrer: { email: `referrer@${REVIEWER_DOMAIN}`, hashEnv: "REVIEWER_REFERRER_PASSWORD_HASH", landing: "/referrer-home" },
  employer: { email: `employer@${REVIEWER_DOMAIN}`, hashEnv: "REVIEWER_EMPLOYER_PASSWORD_HASH", landing: "/employer" },
  admin: { email: `admin@${REVIEWER_DOMAIN}`, hashEnv: "REVIEWER_ADMIN_PASSWORD_HASH", landing: "/admin" },
};

export function hashReviewerPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(password, salt, 32).toString("hex")}`;
}
export function verifyReviewerPassword(password: string, stored: string | undefined) {
  const [scheme, salt, hash] = (stored ?? "").split("$");
  // Always do the same work so timing does not reveal which emails exist.
  const expected = Buffer.from(scheme === "scrypt" && hash ? hash : "0".repeat(64), "hex");
  const actual = scryptSync(password, salt || "unset-salt", expected.length || 32);
  return scheme === "scrypt" && !!hash && actual.length === expected.length && timingSafeEqual(actual, expected);
}

const WINDOW_MS = 15 * 60_000;
function createLimiter(max: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now: number) => {
    const recent = (hits.get(key) ?? []).filter(t => now - t < WINDOW_MS);
    if (recent.length >= max) { hits.set(key, recent); return false; }
    recent.push(now); hits.set(key, recent);
    if (hits.size > 5000) hits.clear();
    return true;
  };
}

async function provision(role: ReviewerRole, email: string) {
  const openId = `reviewer_${role}`;
  const account = await db.resolveLoginIdentity({ provider: "reviewer", subject: email, openId, email, emailVerified: true, name: `Demo ${role}`, loginMethod: "reviewer_password" });
  if (account.suspended) return undefined;
  const handle = await db.getDb(); if (!handle) throw new Error("Database unavailable");
  if (role === "referrer") await db.saveVerifiedWorkEmail(account.id, email).catch(async () => {
    await handle.insert(profiles).values({ userId: account.id, accountType: "referrer", company: REVIEWER_DOMAIN, workEmailDomain: REVIEWER_DOMAIN, workEmailVerifiedAt: new Date(), isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "referrer", company: REVIEWER_DOMAIN, workEmailDomain: REVIEWER_DOMAIN, workEmailVerifiedAt: new Date(), isOnboarded: true } });
  });
  else if (role === "employer") {
    await handle.insert(profiles).values({ userId: account.id, accountType: "employer", isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "employer", isOnboarded: true } });
    const existing = (await handle.select({ id: employerAccounts.id }).from(employerAccounts).where(eq(employerAccounts.userId, account.id)).limit(1))[0];
    if (!existing) await handle.insert(employerAccounts).values({ userId: account.id, companyName: "Demo Employer (review account)", billingEmail: email, approvalStatus: "approved", approvedAt: new Date() });
  } else if (role === "seeker") {
    await handle.insert(profiles).values({ userId: account.id, accountType: "job_seeker", isOnboarded: true }).onDuplicateKeyUpdate({ set: { accountType: "job_seeker", isOnboarded: true } });
  } else if (role === "admin") {
    await handle.update(users).set({ role: "admin" }).where(and(eq(users.id, account.id), eq(users.openId, account.openId)));
  }
  return account;
}

export function registerReviewerLoginRoutes(app: Express) {
  const perIp = createLimiter(15), perEmail = createLimiter(8);
  app.post("/api/auth/reviewer/sign-in", async (req: Request, res: Response) => {
    if (process.env.REVIEWER_LOGIN_ENABLED !== "true") return res.status(404).json({ error: "Not found" });
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const fail = () => res.status(401).json({ error: "Email or password is not right." });
    const now = Date.now();
    if (!perIp(resolveTrustedClientIp(req) || "unknown", now) || !perEmail(email.slice(0, 320), now)) { res.set("Retry-After", "900"); return res.status(429).json({ error: "Too many tries. Wait 15 minutes." }); }
    if (!password || password.length > 256) return fail();
    const role = (Object.keys(ACCOUNTS) as ReviewerRole[]).find(r => ACCOUNTS[r].email === email && (r !== "admin" || process.env.REVIEWER_ALLOW_ADMIN === "true"));
    const ok = verifyReviewerPassword(password, role ? process.env[ACCOUNTS[role].hashEnv] : undefined);
    if (!role || !ok) { console.warn("[ReviewerLogin] rejected sign-in"); return fail(); }
    try {
      const account = await provision(role, email);
      if (!account) return fail();
      const token = await sdk.createSessionToken(account.openId, { name: account.name ?? email });
      res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(req), maxAge: SESSION_ACCESS_TTL_MS });
      console.info("[ReviewerLogin] signed in", { role });
      res.json({ signedIn: true, role, redirectTo: ACCOUNTS[role].landing });
    } catch (error) {
      console.error("[ReviewerLogin] failed", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "We could not sign in." });
    }
  });
}

// The marker lives in shared/reviewerAccounts.ts (leaf) so billing/environment
// code can use it without importing this route (circular through db).
export { REVIEWER_OPENID_PREFIX, isReviewerOpenId } from "../../shared/reviewerAccounts";
import { isReviewerOpenId } from "../../shared/reviewerAccounts";

export const REVIEWER_EXTERNAL_ACTION_REFUSAL =
  "Demo review accounts can browse the product but cannot take actions that reach real members.";

/**
 * Least-privilege guard for the shared demo review accounts: their sessions are ordinary, so
 * routes that fan out to real members or external services refuse them here. Returns true when
 * the response was sent. Browse/checkout-preview paths stay open on purpose - a hosted checkout
 * cart with no payment behind it reaches no one.
 */
export function refuseReviewerExternalAction(res: Response, openId: string | null | undefined): boolean {
  if (!isReviewerOpenId(openId)) return false;
  res.status(403).json({ error: REVIEWER_EXTERNAL_ACTION_REFUSAL });
  return true;
}
