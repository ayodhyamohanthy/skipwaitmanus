import { createHash } from "node:crypto";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { workEmailOtpRateLimits } from "../../drizzle/schema";
import { getDb } from "../db";

/**
 * Durable fixed-window limits, single-use claims and failure lockouts for the public auth surface (seeker
 * password sign-in, sign-up, verification, forgot and reset). Same storage and the same atomic statements as
 * the work-email OTP limiter (server/workEmailOtp.ts), in the same workEmailOtpRateLimits table: keys are
 * namespaced and hashed, so no raw email or IP is stored and nothing collides with the OTP buckets. Expired
 * rows are pruned inside each transaction. Nothing here is a process-memory decision, and a missing store
 * reports "unavailable" so callers fail closed.
 */

/** anchorMs pins the window to a fixed start (for example a ticket's issue time) instead of the clock grid. */
export type DurableLimit = { readonly key: string; readonly windowMs: number; readonly limit: number; readonly anchorMs?: number };
export type DurableLimitResult =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: "rate_limited"; readonly retryAfterSeconds: number }
  | { readonly allowed: false; readonly reason: "unavailable" };

/** A one-time marker: the row exists exactly once for (key, windowStart) until expiresAt. */
export type DurableClaim = { readonly key: string; readonly windowStart: Date; readonly expiresAt: Date };
export type DurableClaimResult = "claimed" | "already_claimed" | "unavailable";

/** Counts failures in a clock window; reaching the threshold writes a lock row that lasts lockMs. */
export type DurableFailureCounter = { readonly key: string; readonly windowMs: number; readonly threshold: number; readonly lockKey: string; readonly lockMs: number };
export type DurableLockState = { readonly locked: false } | { readonly locked: true; readonly retryAfterSeconds: number } | { readonly locked: "unavailable" };

export type DurableLimitTx = {
  pruneExpired(now: Date): Promise<void>;
  /** Inserts the row with hitCount 1; false when it already exists. */
  insertWindow(key: string, windowStart: Date, expiresAt: Date): Promise<boolean>;
  /** Increments only while hitCount < limit; false when the bucket is full. */
  incrementBelow(key: string, windowStart: Date, limit: number): Promise<boolean>;
  exists(key: string, windowStart: Date, now: Date): Promise<boolean>;
  remove(key: string, windowStart: Date): Promise<void>;
  /** Inserts the row with hitCount 1 or adds one to it; returns the count after this hit. */
  countHit(key: string, windowStart: Date, expiresAt: Date): Promise<number>;
  /** The latest expiry among live rows for these keys, or null. */
  latestExpiry(keys: readonly string[], now: Date): Promise<Date | null>;
  /** Deletes every window of these keys. */
  removeKeys(keys: readonly string[]): Promise<void>;
};
/** Storage seam: MySQL in production, an in-memory transactional fake in tests. */
export type DurableLimitStore = { transaction<T>(work: (tx: DurableLimitTx) => Promise<T>): Promise<T> };
type StoreOption = { readonly store?: DurableLimitStore | null; readonly now?: number };

const KEY_MAX = 96;
const NAMESPACE_PATTERN = /^[a-z0-9-]{1,31}$/;

export function durableLimiterKey(namespace: string, value: string): string {
  if (!NAMESPACE_PATTERN.test(namespace)) throw new Error("Invalid durable limiter namespace");
  const key = `${namespace}:${createHash("sha256").update(value).digest("hex")}`;
  if (key.length > KEY_MAX) throw new Error("Durable limiter key is too long");
  return key;
}

export function fixedWindowStart(timestamp: number, windowMs: number): number {
  return Math.floor(timestamp / windowMs) * windowMs;
}

/** MySQL TIMESTAMP columns hold whole seconds; an anchor with a fraction would never match its own row. */
function wholeSeconds(timestamp: number): number {
  return Math.floor(timestamp / 1000) * 1000;
}

class DurableLimitExceeded extends Error {
  constructor(readonly retryAfterSeconds: number) { super("DURABLE_RATE_LIMITED"); this.name = "DurableLimitExceeded"; }
}

function affectedRowsOf(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  if (header && typeof header === "object" && "affectedRows" in header) {
    const value = header.affectedRows;
    return typeof value === "number" ? value : Number(value ?? 0);
  }
  return 0;
}

function firstRowOf(result: unknown): Record<string, unknown> | undefined {
  const rows = Array.isArray(result) ? result[0] : undefined;
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row && typeof row === "object" ? row as Record<string, unknown> : undefined;
}

export async function mysqlDurableLimitStore(): Promise<DurableLimitStore | null> {
  const db = await getDb();
  if (!db) return null;
  const table = workEmailOtpRateLimits;
  return {
    transaction: work => db.transaction(async tx => work({
      async pruneExpired(now) { await tx.delete(table).where(lt(table.expiresAt, now)); },
      async insertWindow(key, windowStart, expiresAt) {
        const inserted = await tx.execute(sql`INSERT IGNORE INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${key}, ${windowStart}, 1, ${expiresAt})`);
        return affectedRowsOf(inserted) === 1;
      },
      async incrementBelow(key, windowStart, limit) {
        const updated = await tx.update(table).set({ hitCount: sql`${table.hitCount} + 1` }).where(and(eq(table.limiterKey, key), eq(table.windowStart, windowStart), lt(table.hitCount, limit)));
        return affectedRowsOf(updated) === 1;
      },
      async exists(key, windowStart, now) {
        const rows = await tx.select({ id: table.id, expiresAt: table.expiresAt }).from(table).where(and(eq(table.limiterKey, key), eq(table.windowStart, windowStart))).limit(1);
        return rows.length === 1 && rows[0].expiresAt.getTime() > now.getTime();
      },
      async remove(key, windowStart) { await tx.delete(table).where(and(eq(table.limiterKey, key), eq(table.windowStart, windowStart))); },
      async countHit(key, windowStart, expiresAt) {
        await tx.execute(sql`INSERT INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt) VALUES (${key}, ${windowStart}, 1, ${expiresAt}) ON DUPLICATE KEY UPDATE hitCount = hitCount + 1`);
        const counted = await tx.execute(sql`SELECT hitCount FROM workEmailOtpRateLimits WHERE limiterKey = ${key} AND windowStart = ${windowStart} LIMIT 1`);
        return Number(firstRowOf(counted)?.hitCount ?? 0);
      },
      async latestExpiry(keys, now) {
        if (!keys.length) return null;
        const result = await tx.execute(sql`SELECT MAX(expiresAt) AS until FROM workEmailOtpRateLimits WHERE limiterKey IN (${sql.join(keys.map(key => sql`${key}`), sql`, `)}) AND expiresAt > ${now}`);
        const until = firstRowOf(result)?.until;
        return until instanceof Date || typeof until === "string" ? new Date(until) : null;
      },
      async removeKeys(keys) {
        if (!keys.length) return;
        await tx.delete(table).where(inArray(table.limiterKey, keys));
      },
    })),
  };
}

async function storeFor(options: StoreOption): Promise<DurableLimitStore | null> {
  return options.store === undefined ? mysqlDurableLimitStore() : options.store;
}

/** Consumes one hit in every bucket, all or nothing: a full bucket rolls back the others. */
export async function consumeDurableLimits(limits: readonly DurableLimit[], options: StoreOption = {}): Promise<DurableLimitResult> {
  const store = await storeFor(options);
  if (!store) return { allowed: false, reason: "unavailable" };
  const timestamp = options.now ?? Date.now();
  try {
    await store.transaction(async tx => {
      await tx.pruneExpired(new Date(timestamp));
      for (const limit of limits) {
        const start = limit.anchorMs === undefined ? fixedWindowStart(timestamp, limit.windowMs) : wholeSeconds(limit.anchorMs);
        if (await tx.insertWindow(limit.key, new Date(start), new Date(start + limit.windowMs))) continue;
        if (!(await tx.incrementBelow(limit.key, new Date(start), limit.limit))) {
          throw new DurableLimitExceeded(Math.max(1, Math.ceil((start + limit.windowMs - timestamp) / 1000)));
        }
      }
    });
    return { allowed: true };
  } catch (error) {
    if (error instanceof DurableLimitExceeded) return { allowed: false, reason: "rate_limited", retryAfterSeconds: error.retryAfterSeconds };
    throw error;
  }
}

/** Records one failure on every counter in one transaction; a counter at its threshold writes its lock row. */
export async function recordDurableFailures(counters: readonly DurableFailureCounter[], options: StoreOption = {}): Promise<"recorded" | "unavailable"> {
  const store = await storeFor(options);
  if (!store) return "unavailable";
  const timestamp = options.now ?? Date.now();
  await store.transaction(async tx => {
    await tx.pruneExpired(new Date(timestamp));
    for (const counter of counters) {
      const start = fixedWindowStart(timestamp, counter.windowMs);
      const hits = await tx.countHit(counter.key, new Date(start), new Date(start + counter.windowMs));
      const lockedAt = wholeSeconds(timestamp);
      if (hits >= counter.threshold) await tx.insertWindow(counter.lockKey, new Date(lockedAt), new Date(lockedAt + counter.lockMs));
    }
  });
  return "recorded";
}

/** Whether any of these lock keys is live, and for how long. */
export async function activeDurableLock(lockKeys: readonly string[], options: StoreOption = {}): Promise<DurableLockState> {
  const store = await storeFor(options);
  if (!store) return { locked: "unavailable" };
  const now = new Date(options.now ?? Date.now());
  const until = await store.transaction(tx => tx.latestExpiry(lockKeys, now));
  if (!until || until.getTime() <= now.getTime()) return { locked: false };
  return { locked: true, retryAfterSeconds: Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 1000)) };
}

/** Atomically takes a one-time claim. Exactly one concurrent caller sees "claimed". */
export async function claimDurableOnce(claim: DurableClaim, options: StoreOption = {}): Promise<DurableClaimResult> {
  const store = await storeFor(options);
  if (!store) return "unavailable";
  const now = new Date(options.now ?? Date.now());
  return store.transaction(async tx => {
    await tx.pruneExpired(now);
    return (await tx.insertWindow(claim.key, claim.windowStart, claim.expiresAt)) ? "claimed" : "already_claimed";
  });
}

export async function isDurablyClaimed(claim: DurableClaim, options: StoreOption = {}): Promise<boolean | "unavailable"> {
  const store = await storeFor(options);
  if (!store) return "unavailable";
  const now = new Date(options.now ?? Date.now());
  return store.transaction(tx => tx.exists(claim.key, claim.windowStart, now));
}

/** Removes every window of these keys (for example a lock and its failure count once the owner proved the inbox). */
export async function clearDurableKeys(keys: readonly string[], options: StoreOption = {}): Promise<"cleared" | "unavailable"> {
  const store = await storeFor(options);
  if (!store) return "unavailable";
  await store.transaction(tx => tx.removeKeys([...keys]));
  return "cleared";
}

/** Gives a claim back when the guarded side effect failed, so the same link can be retried. */
export async function releaseDurableClaim(claim: DurableClaim, options: StoreOption = {}): Promise<void> {
  const store = await storeFor(options);
  if (!store) return;
  await store.transaction(tx => tx.remove(claim.key, claim.windowStart));
}
