import { createHash, randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { workEmailOtpCodes, workEmailOtpRateLimits } from "../drizzle/schema";
import { getDb, isWorkEmailDomain } from "./db";
import { sendTransactionalEmail } from "./emailDelivery";
import { resolve4, resolveMx } from "node:dns/promises";

export type WorkEmailOtpDeliveryInput = { to: string; code: string };
export type WorkEmailOtpSendResult = { sent: boolean; reason: "sent" | "not_configured" | "delivery_failed" | "rate_limited" | "invalid_email" | "invalid_domain" };
export type WorkEmailOtpDependencies = { sendEmail?: (input: WorkEmailOtpDeliveryInput) => Promise<{ sent: boolean; reason: string }>; now?: () => number };

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const VERIFICATION_RECEIPT_MS = 10 * 60 * 1000;
const DELIVERY_TIMEOUT_MS = 8_000;
const domainCache = new Map<string, { valid: boolean; until: number }>();
const reservedDomain = /(?:^|\.)(?:invalid|localhost|local|test|example)$/i;
export async function hasDeliverableMailDomain(domain: string): Promise<boolean> {
  const normalized = domain.trim().toLowerCase();
  if (!normalized || reservedDomain.test(normalized) || /^\[.*\]$/.test(normalized) || /^\d+(?:\.\d+){3}$/.test(normalized)) return false;
  const cached = domainCache.get(normalized); if (cached && cached.until > Date.now()) return cached.valid;
  let valid = false;
  try { valid = (await resolveMx(normalized)).some(row => row.exchange && row.priority >= 0); }
  catch { try { valid = (await resolve4(normalized)).length > 0; } catch { valid = false; } }
  domainCache.set(normalized, { valid, until: Date.now() + (valid ? 300_000 : 60_000) });
  return valid;
}
function limiterKey(kind: string, value: string) { return `${kind}:${createHash("sha256").update(value).digest("hex")}`; }
export function isValidWorkEmailOtpEmail(value: string): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || value.length > 320) return false;
  return isWorkEmailDomain(value.slice(value.lastIndexOf("@") + 1).toLowerCase());
}
export function hashCode(email: string, code: string): string { return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex"); }

type Limit = { key: string; windowMs: number; limit: number };
function fixedWindow(timestamp: number, windowMs: number) { return Math.floor(timestamp / windowMs) * windowMs; }
async function consumeLimits(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, limits: Limit[], timestamp: number) {
  return db.transaction(async tx => {
    await tx.delete(workEmailOtpRateLimits).where(lt(workEmailOtpRateLimits.expiresAt, new Date(timestamp)));
    for (const limit of limits) {
      const start = fixedWindow(timestamp, limit.windowMs);
      const inserted = await tx.execute(sql`INSERT IGNORE INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${limit.key}, ${new Date(start)}, 1, ${new Date(start + limit.windowMs)})`);
      if (Number((inserted as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0) === 1) continue;
      const incremented = await tx.update(workEmailOtpRateLimits).set({ hitCount: sql`${workEmailOtpRateLimits.hitCount} + 1` }).where(and(eq(workEmailOtpRateLimits.limiterKey, limit.key), eq(workEmailOtpRateLimits.windowStart, new Date(start)), lt(workEmailOtpRateLimits.hitCount, limit.limit)));
      if (Number(incremented[0]?.affectedRows ?? 0) !== 1) throw new Error("OTP_RATE_LIMITED");
    }
  });
}

export function createWorkEmailOtpService(dependencies: WorkEmailOtpDependencies = {}) {
  const now = dependencies.now ?? (() => Date.now());
  const sendEmail = dependencies.sendEmail;
  return {
    async sendCode(rawEmail: string, context: { ip?: string } = {}): Promise<WorkEmailOtpSendResult> {
      const email = rawEmail.trim().toLowerCase();
      if (!isValidWorkEmailOtpEmail(email)) return { sent: false, reason: "invalid_email" };
      const domain = email.slice(email.lastIndexOf("@") + 1);
      if (!(await hasDeliverableMailDomain(domain))) return { sent: false, reason: "invalid_domain" };
      const db = await getDb(); if (!db) return { sent: false, reason: "not_configured" };
      if (!sendEmail) return { sent: false, reason: "not_configured" };
      const timestamp = now();
      const limits: Limit[] = [
        { key: limiterKey("ip10m", context.ip || "unknown"), windowMs: 600_000, limit: 5 },
        { key: limiterKey("domain10m", domain), windowMs: 600_000, limit: 8 },
        { key: limiterKey("global1h", "all"), windowMs: 3_600_000, limit: 200 },
        { key: limiterKey("email10m", email), windowMs: 600_000, limit: 3 },
        { key: limiterKey("email1m", email), windowMs: 60_000, limit: 1 },
      ];
      try { await consumeLimits(db, limits, timestamp); } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") return { sent: false, reason: "rate_limited" };
        throw error;
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const delivery = await Promise.race([sendEmail({ to: email, code }), new Promise<{ sent:false; reason:string }>(resolve => setTimeout(() => resolve({ sent:false, reason:"timeout" }), DELIVERY_TIMEOUT_MS))]);
      if (!delivery.sent) return { sent: false, reason: delivery.reason === "not_configured" ? "not_configured" : "delivery_failed" };
      await db.insert(workEmailOtpCodes).values({ email, codeHash: hashCode(email, code), expiresAt: new Date(now() + CODE_TTL_MS), attempts: 0, createdAt: new Date(now()) });
      return { sent: true, reason: "sent" };
    },
    async verifyCode(rawEmail: string, rawCode: string, context: { ip?: string } = {}): Promise<boolean> {
      const email = rawEmail.trim().toLowerCase(), code = rawCode.trim();
      if (!isValidWorkEmailOtpEmail(email) || !/^\d{6}$/.test(code)) return false;
      const db = await getDb(); if (!db) return false;
      const timestamp = now();
      try {
        await consumeLimits(db, [
          { key: limiterKey("verify-ip10m", context.ip || "unknown"), windowMs: 600_000, limit: 20 },
          { key: limiterKey("verify-email10m", email), windowMs: 600_000, limit: 10 },
        ], timestamp);
      } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") return false;
        throw error;
      }
      return db.transaction(async tx => {
        // Only the newest active code is accepted. Locking serializes correct
        // and wrong guesses, so one request consumes it and counters never lose increments.
        const selected = await tx.execute(sql`SELECT id, codeHash, attempts FROM workEmailOtpCodes WHERE email = ${email} AND consumedAt IS NULL AND expiresAt > ${new Date(timestamp)} ORDER BY createdAt DESC, id DESC LIMIT 1 FOR UPDATE`);
        const rows = (selected as unknown as Array<Array<{ id: number; codeHash: string; attempts: number }>>)[0] ?? [];
        if (rows.length !== 1 || rows[0].attempts >= MAX_ATTEMPTS) return false;
        if (rows[0].codeHash !== hashCode(email, code)) {
          await tx.update(workEmailOtpCodes).set({ attempts: sql`${workEmailOtpCodes.attempts} + 1` }).where(and(eq(workEmailOtpCodes.id, rows[0].id), isNull(workEmailOtpCodes.consumedAt), lt(workEmailOtpCodes.attempts, MAX_ATTEMPTS)));
          return false;
        }
        const claimed = await tx.update(workEmailOtpCodes).set({ consumedAt: new Date(timestamp) }).where(and(eq(workEmailOtpCodes.id, rows[0].id), isNull(workEmailOtpCodes.consumedAt), lt(workEmailOtpCodes.attempts, MAX_ATTEMPTS)));
        return Number(claimed[0]?.affectedRows ?? 0) === 1;
      });
    },
    async registerFailedAttempt(rawEmail: string, rawCode: string): Promise<void> {
      const email = rawEmail.trim().toLowerCase(), code = rawCode.trim();
      if (!isValidWorkEmailOtpEmail(email) || !/^\d{6}$/.test(code)) return;
      const db = await getDb(); if (!db) return;
      await db.update(workEmailOtpCodes).set({ attempts: sql`${workEmailOtpCodes.attempts} + 1` }).where(and(eq(workEmailOtpCodes.email, email), isNull(workEmailOtpCodes.consumedAt), gt(workEmailOtpCodes.expiresAt, new Date(now())), lt(workEmailOtpCodes.attempts, MAX_ATTEMPTS)));
    },
    async hasRecentVerification(rawEmail: string, withinMs: number = VERIFICATION_RECEIPT_MS): Promise<boolean> {
      const email = rawEmail.trim().toLowerCase(); if (!isValidWorkEmailOtpEmail(email)) return false;
      const db = await getDb(); if (!db) return false;
      const rows = await db.select({ id: workEmailOtpCodes.id }).from(workEmailOtpCodes).where(and(eq(workEmailOtpCodes.email, email), gt(workEmailOtpCodes.consumedAt, new Date(now() - withinMs)))).limit(1);
      return rows.length === 1;
    },
  };
}
export const workEmailOtpService = createWorkEmailOtpService({ sendEmail: async ({ to, code }) => sendTransactionalEmail({ to, subject: "Your skipwait.me verification code", text: `Your skipwait.me verification code is ${code}. It expires in 10 minutes and works once.\n\nIf you did not request it, ignore this email - nothing changes.` }) });
