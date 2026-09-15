import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

/**
 * Local development authentication.
 *
 * Production skipwait.me authenticates through WorkOS AuthKit (SDK JWT
 * bearer token plus the app session cookie). When this repo runs with no
 * provider keys configured (fresh clone, offline demo, CI), there is no
 * production authority to verify a session against.
 *
 * These routes provide an equivalent server-local session built on the same
 * `app_session_id` JWT the WorkOS/OTP callbacks use. They are registered
 * ONLY when WorkOS keys are absent, and they never grant admin role or touch
 * real identity providers.
 */

export type DevEmailAddress = { id: string; emailAddress: string; verification: { status: "verified" | "unverified" } };

export type DevIdentity = {
  account: { id: number; openId: string; role?: "user" | "admin"; name: string | null; email: string | null; loginMethod: string | null };
  primaryEmail: DevEmailAddress | null;
  emailAddresses: DevEmailAddress[];
};

function readSessionToken(req: Request): string | undefined {
  const parsed = parseCookieHeader(req.headers.cookie ?? "");
  const cookies = new Map(Object.entries(parsed));
  const cookieToken = cookies.get(COOKIE_NAME);
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return undefined;
}

function emailField(email: string | null): DevEmailAddress | null {
  return email ? { id: `dev-email-${email}`, emailAddress: email, verification: { status: "verified" } } : null;
}

type MemoryAccount = NonNullable<Awaited<ReturnType<typeof db.getUserByOpenId>>> & { name: string | null; email: string | null };

// When no DATABASE_URL is configured the db layer degrades to no-ops. Dev
// sessions then live in this process-local store so the signed-in experience
// still works for local development. Nothing here persists or leaves the box.
const memoryAccounts = new Map<string, MemoryAccount>();

async function databaseAvailable(): Promise<boolean> {
  return Boolean(await db.getDb());
}

async function upsertDevUser(input: { openId: string; name: string; email: string | null; loginMethod: string }): Promise<MemoryAccount | undefined> {
  if (await databaseAvailable()) {
    await db.upsertUser({ ...input, lastSignedIn: new Date() });
    return (await db.getUserByOpenId(input.openId)) as MemoryAccount | undefined;
  }
  const existing = memoryAccounts.get(input.openId);
  const account: MemoryAccount = existing
    ? { ...existing, name: input.name, email: input.email, lastSignedIn: new Date() }
    : { id: memoryAccounts.size + 1, openId: input.openId, name: input.name, email: input.email, loginMethod: input.loginMethod, role: db.resolveSyncedUserRole({ openId: input.openId, email: input.email, loginMethod: input.loginMethod }), suspended: false, sessionsValidAfter: new Date(), createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
  memoryAccounts.set(input.openId, account);
  return account;
}

export async function resolveDevIdentity(req: Request): Promise<DevIdentity | undefined> {
  try {
    const session = await sdk.verifySession(readSessionToken(req));
    if (!session) return undefined;
    let account = (await db.getUserByOpenId(session.openId)) as MemoryAccount | undefined;
    if (!account && !(await databaseAvailable())) account = memoryAccounts.get(session.openId);
    if (!account) return undefined;
    // Suspension choke point: every per-request identity (dev sessions, the
    // WorkOS cookie fallback, tRPC createContext, and the private-route
    // resolveIdentity wrapper) ends here, so a suspended account resolves as
    // signed out everywhere with zero extra queries — the row is already in
    // hand. Returning undefined maps to the routes' existing 401 handling.
    if (account.suspended) return undefined;
    const primaryEmail = emailField(account.email);
    return { account, primaryEmail, emailAddresses: primaryEmail ? [primaryEmail] : [] };
  } catch {
    return undefined;
  }
}

export function registerDevAuthRoutes(app: Express) {
  app.get("/api/dev-auth/session", async (req: Request, res: Response) => {
    const identity = await resolveDevIdentity(req);
    if (!identity) {
      res.json({ signedIn: false });
      return;
    }
    res.json({ signedIn: true, account: { id: identity.account.id, name: identity.account.name, email: identity.account.email, role: identity.account.role } });
  });

  app.post("/api/dev-auth/login", async (req: Request, res: Response) => {
    const existing = await resolveDevIdentity(req);
    if (existing) {
      res.json({ signedIn: true, account: { id: existing.account.id, name: existing.account.name, email: existing.account.email, role: existing.account.role } });
      return;
    }
    const body = (typeof req.body === "object" && req.body !== null ? req.body : {}) as { name?: unknown; email?: unknown };
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : "Dev User";
    const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().slice(0, 320) : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Provide a valid email address" });
      return;
    }
    const openId = `dev_${randomUUID().replace(/-/g, "")}`.slice(0, 64);
    // `dev`: no identity provider vouches for this session, so recording a
    // provider name here would misrepresent how it was created.
    const account = await upsertDevUser({ openId, name, email, loginMethod: "dev" });
    if (!account) {
      res.status(500).json({ error: "Dev session could not be created" });
      return;
    }
    const sessionToken = await sdk.createSessionToken(openId, { name });
    res.cookie(COOKIE_NAME, sessionToken, { ...getSessionCookieOptions(req), maxAge: 30 * 60_000 });
    res.json({ signedIn: true, account: { id: account.id, name: account.name, email: account.email, role: account.role } });
  });

  app.post("/api/dev-auth/logout", async (req: Request, res: Response) => {
    await sdk.revokeSession(readSessionToken(req));
    res.clearCookie(COOKIE_NAME, getSessionCookieOptions(req));
    res.json({ signedIn: false });
  });
}
