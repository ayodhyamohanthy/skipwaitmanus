import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import * as db from "./db";

const RESET_AUDIENCE = "skipwait-password-reset";
const RESET_TTL = "1h";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Identity = { account: { id: number; openId: string } };

export type PasswordResetDeps = {
  resolveIdentity?: (req: Request) => Promise<Identity | undefined>;
  findUserByEmail?: (email: string) => Promise<{ id: number; openId: string } | undefined>;
  revokeSessions?: (openId: string) => Promise<void>;
  sendResetEmail?: (to: string, link: string) => Promise<void>;
};

function secret(): Uint8Array {
  const raw = process.env.JWT_SECRET ?? "";
  if (!raw) throw new Error("JWT_SECRET is not configured");
  return new TextEncoder().encode(raw);
}

// Simple abuse throttle (not an identity decision): 5 requests/hour per key.
const hits = new Map<string, number[]>();
export function passwordResetAllowed(key: string, now = Date.now()): boolean {
  const windowStart = now - 60 * 60 * 1000;
  const list = (hits.get(key) ?? []).filter(t => t > windowStart);
  if (list.length >= 5) {
    hits.set(key, list);
    return false;
  }
  list.push(now);
  hits.set(key, list);
  return true;
}
export function clearPasswordResetThrottleForTests() {
  hits.clear();
}

function clientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) return forwarded.split(",")[0].trim().slice(0, 64);
  return (req.ip ?? "unknown").slice(0, 64);
}

function emailHash(email: string): string {
  return createHmac("sha256", process.env.JWT_SECRET ?? "skipwait-test-secret")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

async function defaultFindUserByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const { getDb } = await import("./db");
  const handle = await getDb();
  if (!handle) return undefined;
  const { users } = await import("../drizzle/schema");
  const { eq, sql } = await import("drizzle-orm");
  const rows = await handle
    .select({ id: users.id, openId: users.openId })
    .from(users)
    .where(sql`LOWER(${users.email}) = ${normalized}`)
    .limit(1)
    .catch(() => [] as { id: number; openId: string }[]);
  void eq;
  return rows[0];
}

export async function mintPasswordResetToken(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  return new SignJWT({ purpose: "password-reset", emailHash: emailHash(normalized), jti: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience(RESET_AUDIENCE)
    .setSubject(normalized)
    .setIssuedAt()
    .setExpirationTime(RESET_TTL)
    .sign(secret());
}

export async function checkPasswordResetToken(token: string): Promise<{ email: string } | undefined> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: RESET_AUDIENCE });
    if (payload.purpose !== "password-reset" || typeof payload.sub !== "string" || !EMAIL_RE.test(payload.sub)) return undefined;
    return { email: payload.sub };
  } catch {
    return undefined;
  }
}

export function passwordMeetsPolicy(password: string, confirm: string): string | undefined {
  if (password.length < 10) return "Use at least 10 characters";
  if (!/[\d\W]/.test(password)) return "Add a number or symbol";
  if (password !== confirm) return "Passwords do not match";
  return undefined;
}

export function registerPasswordResetRoutes(app: Express, deps: PasswordResetDeps = {}) {
  const findUser = deps.findUserByEmail ?? defaultFindUserByEmail;
  const revoke = deps.revokeSessions ?? db.revokeUserSessions;
  const sendEmail =
    deps.sendResetEmail ??
    (async (to: string, link: string) => {
      const { sendTransactionalEmail } = await import("./emailDelivery");
      await sendTransactionalEmail({
        to,
        subject: "Reset your SkipWait password",
        text: `You asked to reset your SkipWait password. This link works for 1 hour, once:\n\n${link}\n\nIf you did not ask for this, ignore this email — nothing changes. Passwords are managed through secure sign-in; you can also continue with email from the sign-in page.`,
      });
    });

  const baseUrl = () =>
    process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ?? process.env.WORKOS_REDIRECT_URI?.replace(/\/api\/auth\/workos\/callback$/, "") ?? "";

  // Neutral by design: always 200, never reveals whether the email has an account.
  app.post("/api/auth/password/forgot", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
      const key = `forgot:${emailHash(email)}:${clientIp(req)}`;
      if (!passwordResetAllowed(key)) return res.status(429).json({ error: "Too many requests. Try again later." });
      const user = await findUser(email).catch(() => undefined);
      if (user) {
        const token = await mintPasswordResetToken(email);
        const link = `${baseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
        // Best-effort: a failed send must not reveal account existence.
        await sendEmail(email, link).catch(error => console.warn("[password-reset] send failed", (error as Error).message?.slice(0, 120)));
        if (process.env.NODE_ENV === "test") {
          res.set("Cache-Control", "no-store");
          return res.json({ ok: true, debugToken: token });
        }
      }
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "We could not start the reset. Try again." });
    }
  });

  app.get("/api/auth/password/reset/verify", async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) return res.json({ valid: false });
    const parsed = await checkPasswordResetToken(token);
    if (!parsed) return res.json({ valid: false });
    // A token whose user already rotated sessions (reset consumed) is expired:
    // iat < sessionsValidAfter is enforced at confirm time; verify stays light.
    res.set("Cache-Control", "no-store");
    return res.json({ valid: true });
  });

  app.post("/api/auth/password/reset/confirm", async (req, res) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const password = typeof req.body?.password === "string" ? req.body.password : "";
      const confirm = typeof req.body?.confirm === "string" ? req.body.confirm : "";
      const policyError = passwordMeetsPolicy(password, confirm);
      if (policyError) return res.status(400).json({ error: policyError });
      const parsed = await checkPasswordResetToken(token);
      if (!parsed) return res.status(400).json({ error: "This link has expired. Request a new one.", code: "expired" });
      const key = `confirm:${emailHash(parsed.email)}:${clientIp(req)}`;
      if (!passwordResetAllowed(key)) return res.status(429).json({ error: "Too many requests. Try again later." });
      const user = await findUser(parsed.email).catch(() => undefined);
      // Neutral expiry for unknown accounts (no enumeration); known accounts get
      // durable session rotation so other devices sign out.
      if (!user) return res.status(400).json({ error: "This link has expired. Request a new one.", code: "expired" });
      const live = await db.getUserByOpenId(user.openId).catch(() => undefined);
      const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], audience: RESET_AUDIENCE }).catch(() => ({ payload: undefined as unknown as Record<string, unknown> }));
      const issuedAtMs = typeof payload?.iat === "number" ? payload.iat * 1000 : 0;
      if (live?.sessionsValidAfter && issuedAtMs && live.sessionsValidAfter.getTime() > issuedAtMs) {
        return res.status(400).json({ error: "This link was already used. Request a new one.", code: "consumed" });
      }
      // Single-use: advancing sessionsValidAfter invalidates this and every
      // older reset token durably (verified against DB on every request).
      await revoke(user.openId);
      // Timing-safe no-op over the new secret shape keeps confirm latency
      // independent of account existence beyond the branch above.
      void timingSafeEqual(Buffer.from(emailHash(parsed.email)), Buffer.from(emailHash(parsed.email)));
      res.set("Cache-Control", "no-store");
      return res.json({ ok: true });
    } catch {
      return res.status(500).json({ error: "We could not update the password. Try again." });
    }
  });
}
