import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import { workEmailOtpCodes, workEmailOtpRateLimits, workEmailOtpReceipts } from "../drizzle/schema";
import { getDb, isWorkEmailDomain } from "./db";
import { sendTransactionalEmail } from "./emailDelivery";
import { resolve4, resolveMx } from "node:dns/promises";

export type WorkEmailOtpDeliveryInput = { to: string; code: string };
export type WorkEmailOtpSendResult = { sent: boolean; reason: "sent" | "not_configured" | "delivery_failed" | "rate_limited" | "invalid_email" | "invalid_domain"; retryAfterSeconds?: number };

import { workEmailStorageKeys } from "./workEmailKey";
import { OTP_LOCK_AFTER_FAILURES, OTP_LOCK_MS, OTP_RESEND_COOLDOWN_SECONDS, OtpLockedError } from "./otpPolicy";
export { OtpLockedError, OTP_RESEND_COOLDOWN_SECONDS, OTP_LOCK_AFTER_FAILURES, OTP_LOCK_MS } from "./otpPolicy";

// A whole IP (for example a shared office) is only locked by a much larger spray of failures.
const OTP_IP_LOCK_AFTER_FAILURES = 30;
export type WorkEmailOtpDependencies = { sendEmail?: (input: WorkEmailOtpDeliveryInput) => Promise<{ sent: boolean; reason: string }>; now?: () => number };

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const VERIFICATION_RECEIPT_MS = 10 * 60 * 1000;
const receiptHash = (value: string) => createHash("sha256").update(value).digest("hex");
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
export function limiterKey(kind: string, value: string) { return `${kind}:${createHash("sha256").update(value).digest("hex")}`; }
export function isValidWorkEmailOtpEmail(value: string): boolean {
  return isValidOtpLoginEmail(value);
}

/**
 * Email shape gate for the OTP planes. Referrers are work-email-only; job seekers sign in with
 * personal email, so the seeker plane accepts consumer domains (FOUNDER-LOCKED login rule, Oct 16 2026).
 * Deliverability is still enforced on send by hasDeliverableMailDomain (MX/A lookup).
 */
export function isValidOtpLoginEmail(value: string, opts: { seeker?: boolean } = {}): boolean {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || value.length > 320) return false;
  if (opts.seeker) return true;
  return isWorkEmailDomain(value.slice(value.lastIndexOf("@") + 1).toLowerCase());
}
/**
 * D-100.otp-hmac: a six-digit code has a million values, so an unkeyed SHA-256 of `email:code`
 * is recoverable offline from one database row. The stored hash is HMAC-SHA256 under a server
 * key derived like `workEmailFingerprintSecret` (`server/workEmailKey.ts`) with its own
 * `work-email-otp:` prefix: `WORK_EMAIL_HMAC_KEY` when set, otherwise `JWT_SECRET`. Same 64-hex
 * width, so no migration. Rotating the key only voids codes in flight (each lives 10 minutes).
 */
export function otpCodeHashSecret(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.WORK_EMAIL_HMAC_KEY?.trim();
  return configured ? `work-email-otp:${configured}` : `work-email-otp-jwt:${env.JWT_SECRET?.trim() || "skipwait-local-development-secret"}`;
}
export function hashCode(email: string, code: string, secret: string = otpCodeHashSecret()): string {
  return createHmac("sha256", secret).update(`${email.toLowerCase()}:${code}`).digest("hex");
}
/** The pre-D-100 form, read only for rows created before OTP_HMAC_SINCE. */
function legacyHashCode(email: string, code: string): string { return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex"); }
/**
 * Rows created before this instant may still hold the legacy SHA-256 form. Codes live
 * CODE_TTL_MS (10 minutes), so the legacy read dies on its own once this has passed; a later
 * row may delete it. Rows created at or after it must carry the HMAC.
 */
export const OTP_HMAC_SINCE = "2026-11-06T00:00:00.000Z";
const OTP_HMAC_SINCE_MS = Date.parse(OTP_HMAC_SINCE);
function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8"), right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
function storedCodeMatches(row: { codeHash: string; createdAt: Date | string | null }, email: string, code: string): boolean {
  if (sameHex(row.codeHash, hashCode(email, code))) return true;
  const createdMs = row.createdAt == null ? Number.NaN : new Date(row.createdAt).getTime();
  return Number.isFinite(createdMs) && createdMs < OTP_HMAC_SINCE_MS && sameHex(row.codeHash, legacyHashCode(email, code));
}

type Limit = { key: string; windowMs: number; limit: number };
function fixedWindow(timestamp: number, windowMs: number) { return Math.floor(timestamp / windowMs) * windowMs; }
export async function consumeLimits(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, limits: Limit[], timestamp: number) {
  return db.transaction(async tx => {
    await tx.delete(workEmailOtpRateLimits).where(lt(workEmailOtpRateLimits.expiresAt, new Date(timestamp)));
    for (const limit of limits) {
      const start = fixedWindow(timestamp, limit.windowMs);
      const inserted = await tx.execute(sql`INSERT IGNORE INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${limit.key}, ${new Date(start)}, 1, ${new Date(start + limit.windowMs)})`);
      if (Number((inserted as unknown as Array<{ affectedRows?: number }>)[0]?.affectedRows ?? 0) === 1) continue;
      const incremented = await tx.update(workEmailOtpRateLimits).set({ hitCount: sql`${workEmailOtpRateLimits.hitCount} + 1` }).where(and(eq(workEmailOtpRateLimits.limiterKey, limit.key), eq(workEmailOtpRateLimits.windowStart, new Date(start)), lt(workEmailOtpRateLimits.hitCount, limit.limit)));
      if (Number(incremented[0]?.affectedRows ?? 0) !== 1) throw Object.assign(new Error("OTP_RATE_LIMITED"), { retryAfterSeconds: Math.max(1, Math.ceil((start + limit.windowMs - timestamp) / 1000)) });
    }
  });
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const lockKeys = (email: string, ip: string) => ({ pair: limiterKey("vlock-pair", `${email}|${ip}`), ip: limiterKey("vlock-ip", ip) });
const failKeys = (email: string, ip: string) => ({ pair: limiterKey("vfail-pair", `${email}|${ip}`), ip: limiterKey("vfail-ip", ip) });

export async function activeLockUntil(db: Db, email: string, ip: string, timestamp: number): Promise<Date | null> {
  const keys = lockKeys(email, ip);
  const result = await db.execute(sql`SELECT MAX(expiresAt) AS until FROM workEmailOtpRateLimits WHERE limiterKey IN (${keys.pair}, ${keys.ip}) AND expiresAt > ${new Date(timestamp)}`);
  const row = (result as unknown as Array<Array<{ until: Date | string | null }>>)[0]?.[0];
  return row?.until ? new Date(row.until) : null;
}

/** Counts a wrong code against the (email, IP) pair and the IP; locks either once its threshold is reached. */
export async function recordVerifyFailure(db: Db, email: string, ip: string, timestamp: number) {
  const fails = failKeys(email, ip), locks = lockKeys(email, ip);
  await db.transaction(async tx => {
    const start = fixedWindow(timestamp, OTP_LOCK_MS);
    for (const [kind, threshold] of [["pair", OTP_LOCK_AFTER_FAILURES], ["ip", OTP_IP_LOCK_AFTER_FAILURES]] as const) {
      await tx.execute(sql`INSERT INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${fails[kind]}, ${new Date(start)}, 1, ${new Date(start + OTP_LOCK_MS)}) ON DUPLICATE KEY UPDATE hitCount = hitCount + 1`);
      const counted = await tx.execute(sql`SELECT hitCount FROM workEmailOtpRateLimits WHERE limiterKey = ${fails[kind]} AND windowStart = ${new Date(start)} LIMIT 1`);
      const hits = Number((counted as unknown as Array<Array<{ hitCount: number }>>)[0]?.[0]?.hitCount ?? 0);
      if (hits >= threshold) await tx.execute(sql`INSERT IGNORE INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${locks[kind]}, ${new Date(timestamp)}, 1, ${new Date(timestamp + OTP_LOCK_MS)})`);
    }
  });
}

export function createWorkEmailOtpService(dependencies: WorkEmailOtpDependencies = {}) {
  const now = dependencies.now ?? (() => Date.now());
  const sendEmail = dependencies.sendEmail;
  return {
    async sendCode(rawEmail: string, context: { ip?: string; seeker?: boolean } = {}): Promise<WorkEmailOtpSendResult> {
      const email = rawEmail.trim().toLowerCase();
      if (!isValidOtpLoginEmail(email, { seeker: context.seeker })) return { sent: false, reason: "invalid_email" };
      const domain = email.slice(email.lastIndexOf("@") + 1);
      if (!(await hasDeliverableMailDomain(domain))) return { sent: false, reason: "invalid_domain" };
      const db = await getDb(); if (!db) return { sent: false, reason: "not_configured" };
      if (!sendEmail) return { sent: false, reason: "not_configured" };
      const timestamp = now();
      const limits: Limit[] = [
        { key: limiterKey("ip10m", context.ip || "unknown"), windowMs: 600_000, limit: 5 },
        // Seeker codes go to shared mailbox domains (gmail.com), so the per-domain cap would throttle everyone.
        context.seeker ? { key: limiterKey("seeker-global1h", "all"), windowMs: 3_600_000, limit: 500 } : { key: limiterKey("domain10m", domain), windowMs: 600_000, limit: 8 },
        { key: limiterKey("global1h", "all"), windowMs: 3_600_000, limit: context.seeker ? 700 : 200 },
        { key: limiterKey("email10m", email), windowMs: 600_000, limit: 3 },
        { key: limiterKey("email30s", email), windowMs: OTP_RESEND_COOLDOWN_SECONDS * 1000, limit: 1 },
      ];
      try { await consumeLimits(db, limits, timestamp); } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") return { sent: false, reason: "rate_limited", retryAfterSeconds: (error as Error & { retryAfterSeconds?: number }).retryAfterSeconds };
        throw error;
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      const delivery = await sendEmail({ to: email, code }).catch(() => ({ sent: false, reason: "delivery_failed" }));
      if (!delivery.sent) return { sent: false, reason: delivery.reason === "not_configured" ? "not_configured" : "delivery_failed" };
      await db.insert(workEmailOtpCodes).values({ email: workEmailStorageKeys(email).write, codeHash: hashCode(email, code), expiresAt: new Date(now() + CODE_TTL_MS), attempts: 0, createdAt: new Date(now()) });
      return { sent: true, reason: "sent" };
    },
    async verifyCode(rawEmail: string, rawCode: string, context: { ip?: string; seeker?: boolean } = {}): Promise<boolean> {
      const email = rawEmail.trim().toLowerCase(), code = rawCode.trim();
      if (!isValidOtpLoginEmail(email, { seeker: context.seeker }) || !/^\d{6}$/.test(code)) return false;
      const db = await getDb(); if (!db) return false;
      const timestamp = now();
      const clientIp = context.ip || "unknown";
      const lockedUntil = await activeLockUntil(db, email, clientIp, timestamp);
      if (lockedUntil) throw new OtpLockedError(lockedUntil, Math.max(1, Math.ceil((lockedUntil.getTime() - timestamp) / 1000)));
      try {
        await consumeLimits(db, [
          { key: limiterKey("verify-ip10m", context.ip || "unknown"), windowMs: 600_000, limit: 20 },
          { key: limiterKey("verify-email10m", email), windowMs: 600_000, limit: 10 },
        ], timestamp);
      } catch (error) {
        if (error instanceof Error && error.message === "OTP_RATE_LIMITED") return false;
        throw error;
      }
      const accepted = await db.transaction(async tx => {
        // Only the newest active code is accepted. Locking serializes correct
        // and wrong guesses, so one request consumes it and counters never lose increments.
        const selected = await tx.execute(sql`SELECT id, codeHash, attempts, createdAt FROM workEmailOtpCodes WHERE email IN (${sql.join(workEmailStorageKeys(email).read.map(value => sql`${value}`), sql`, `)}) AND consumedAt IS NULL AND expiresAt > ${new Date(timestamp)} ORDER BY createdAt DESC, id DESC LIMIT 1 FOR UPDATE`);
        const rows = (selected as unknown as Array<Array<{ id: number; codeHash: string; attempts: number; createdAt: Date | string | null }>>)[0] ?? [];
        if (rows.length !== 1 || rows[0].attempts >= MAX_ATTEMPTS) return false;
        if (!storedCodeMatches(rows[0], email, code)) {
          await tx.update(workEmailOtpCodes).set({ attempts: sql`${workEmailOtpCodes.attempts} + 1` }).where(and(eq(workEmailOtpCodes.id, rows[0].id), isNull(workEmailOtpCodes.consumedAt), lt(workEmailOtpCodes.attempts, MAX_ATTEMPTS)));
          return false;
        }
        const claimed = await tx.update(workEmailOtpCodes).set({ consumedAt: new Date(timestamp) }).where(and(eq(workEmailOtpCodes.id, rows[0].id), isNull(workEmailOtpCodes.consumedAt), lt(workEmailOtpCodes.attempts, MAX_ATTEMPTS)));
        return Number(claimed[0]?.affectedRows ?? 0) === 1;
      });
      if (!accepted) {
        // Fail-open: a counter error must never block a legitimate sign-in path.
        try { await recordVerifyFailure(db, email, clientIp, timestamp); } catch { /* counters are best effort */ }
        const nowLocked = await activeLockUntil(db, email, clientIp, timestamp).catch(() => null);
        if (nowLocked) throw new OtpLockedError(nowLocked, Math.max(1, Math.ceil((nowLocked.getTime() - timestamp) / 1000)));
      }
      return accepted;
    },
    async issueEnrollmentReceipt(rawEmail: string, userId: number): Promise<{ receipt: string; expiresAt: Date }> {
      const email = rawEmail.trim().toLowerCase();
      if (!isValidWorkEmailOtpEmail(email) || !Number.isInteger(userId) || userId <= 0) throw new Error("Invalid OTP receipt scope");
      const db = await getDb(); if (!db) throw new Error("Database unavailable");
      const receipt = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now() + VERIFICATION_RECEIPT_MS);
      await db.insert(workEmailOtpReceipts).values({ receiptHash: receiptHash(receipt), email: workEmailStorageKeys(email).write, userId, purpose: "work_email_enrollment", expiresAt });
      return { receipt, expiresAt };
    },
    async registerFailedAttempt(rawEmail: string, rawCode: string): Promise<void> {
      const email = rawEmail.trim().toLowerCase(), code = rawCode.trim();
      if (!isValidWorkEmailOtpEmail(email) || !/^\d{6}$/.test(code)) return;
      const db = await getDb(); if (!db) return;
      await db.update(workEmailOtpCodes).set({ attempts: sql`${workEmailOtpCodes.attempts} + 1` }).where(and(inArray(workEmailOtpCodes.email, workEmailStorageKeys(email).read), isNull(workEmailOtpCodes.consumedAt), gt(workEmailOtpCodes.expiresAt, new Date(now())), lt(workEmailOtpCodes.attempts, MAX_ATTEMPTS)));
    },

  };
}
/** The code email. The code leads the subject so lock-screen previews and the phone's code
 *  autofill (iOS AutoFill from Mail, Android suggestions) can offer it without opening the email. */
export function otpEmailMessage(code: string): { subject: string; text: string } {
  return {
    subject: `${code} is your skipwait.me verification code`,
    text: `Your skipwait.me verification code is ${code}. It expires in 10 minutes and works once.\n\nIf you did not request it, ignore this email - nothing changes.`,
  };
}
export const workEmailOtpService = createWorkEmailOtpService({ sendEmail: async ({ to, code }) => sendTransactionalEmail({ to, ...otpEmailMessage(code) }) });
