import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeDurableLock, claimDurableOnce, consumeDurableLimits, durableLimiterKey, isDurablyClaimed, recordDurableFailures, releaseDurableClaim } from "./durableRateLimit";
import { createMemoryDurableLimitStore } from "./memoryDurableLimitStore";

const T0 = Date.UTC(2026, 9, 14, 10, 0, 0);

describe("durable auth limiter", () => {
  it("hashes the raw value into a namespaced key that fits the column", () => {
    const key = durableLimiterKey("pw-signin-email", "asha@wipro.com");
    expect(key).toMatch(/^pw-signin-email:[a-f0-9]{64}$/);
    expect(key).not.toContain("asha");
    expect(key.length).toBeLessThanOrEqual(96);
    expect(() => durableLimiterKey("Bad Namespace", "x")).toThrow();
  });

  it("allows up to the limit in a fixed window, then reports when it reopens", async () => {
    const store = createMemoryDurableLimitStore();
    const limits = [{ key: durableLimiterKey("t-email", "a"), windowMs: 15 * 60_000, limit: 3 }];
    for (let i = 0; i < 3; i++) expect(await consumeDurableLimits(limits, { store, now: T0 + i })).toEqual({ allowed: true });
    expect(await consumeDurableLimits(limits, { store, now: T0 + 60_000 })).toEqual({ allowed: false, reason: "rate_limited", retryAfterSeconds: 14 * 60 });
    expect(await consumeDurableLimits(limits, { store, now: T0 + 15 * 60_000 })).toEqual({ allowed: true });
  });

  it("is all-or-nothing: a full bucket does not spend the other buckets", async () => {
    const store = createMemoryDurableLimitStore();
    const ip = { key: durableLimiterKey("t-ip", "203.0.113.9"), windowMs: 60_000, limit: 10 };
    const email = { key: durableLimiterKey("t-email", "a"), windowMs: 60_000, limit: 1 };
    expect((await consumeDurableLimits([ip, email], { store, now: T0 })).allowed).toBe(true);
    expect((await consumeDurableLimits([ip, email], { store, now: T0 + 1 })).allowed).toBe(false);
    expect(Array.from(store.rows.values()).map(row => row.hitCount).sort()).toEqual([1, 1]);
  });

  it("counts concurrent attempts exactly", async () => {
    const store = createMemoryDurableLimitStore();
    const limits = [{ key: durableLimiterKey("t-email", "race"), windowMs: 60_000, limit: 5 }];
    const results = await Promise.all(Array.from({ length: 12 }, () => consumeDurableLimits(limits, { store, now: T0 })));
    expect(results.filter(result => result.allowed)).toHaveLength(5);
  });

  it("reports unavailable instead of allowing when there is no durable store", async () => {
    expect(await consumeDurableLimits([{ key: "x:y", windowMs: 1000, limit: 1 }], { store: null })).toEqual({ allowed: false, reason: "unavailable" });
    const claim = { key: "x:y", windowStart: new Date(T0), expiresAt: new Date(T0 + 1000) };
    expect(await claimDurableOnce(claim, { store: null })).toBe("unavailable");
    expect(await isDurablyClaimed(claim, { store: null })).toBe("unavailable");
  });

  it("grants a one-time claim to exactly one concurrent caller and can give it back", async () => {
    const store = createMemoryDurableLimitStore();
    const claim = { key: durableLimiterKey("t-use", "jti-1"), windowStart: new Date(T0), expiresAt: new Date(T0 + 3_600_000) };
    const results = await Promise.all([1, 2, 3].map(() => claimDurableOnce(claim, { store, now: T0 })));
    expect(results.sort()).toEqual(["already_claimed", "already_claimed", "claimed"]);
    expect(await isDurablyClaimed(claim, { store, now: T0 })).toBe(true);
    await releaseDurableClaim(claim, { store });
    expect(await isDurablyClaimed(claim, { store, now: T0 })).toBe(false);
    expect(await claimDurableOnce(claim, { store, now: T0 })).toBe("claimed");
    expect(await isDurablyClaimed(claim, { store, now: T0 + 3_600_001 })).toBe(false);
  });

  it("uses the OTP limiter's atomic MySQL statements on the same table", () => {
    const source = readFileSync(new URL("./durableRateLimit.ts", import.meta.url), "utf8");
    expect(source).toContain("INSERT IGNORE INTO workEmailOtpRateLimits (limiterKey, windowStart, hitCount, expiresAt)");
    expect(source).toContain("lt(table.hitCount, limit)");
    expect(source).toContain("lt(table.expiresAt, now)");
    // The failure lockout mirrors server/workEmailOtp.ts recordVerifyFailure / activeLockUntil.
    expect(source).toContain("ON DUPLICATE KEY UPDATE hitCount = hitCount + 1");
    expect(source).toContain("SELECT MAX(expiresAt) AS until FROM workEmailOtpRateLimits WHERE limiterKey IN");
  });

  it("an anchored window counts exactly over its own lifetime, whatever the clock boundary", async () => {
    const store = createMemoryDurableLimitStore();
    // A ticket issued 30 s before a 10-minute clock boundary: a clock-aligned window would reset mid-ticket.
    const issuedAt = T0 + 9 * 60_000 + 30_000;
    const limits = [{ key: durableLimiterKey("t-ticket", "jti-1"), windowMs: 10 * 60_000, limit: 5, anchorMs: issuedAt }];
    for (let i = 0; i < 5; i++) expect((await consumeDurableLimits(limits, { store, now: issuedAt + i * 60_000 })).allowed).toBe(true);
    expect(await consumeDurableLimits(limits, { store, now: issuedAt + 6 * 60_000 })).toEqual({ allowed: false, reason: "rate_limited", retryAfterSeconds: 4 * 60 });
  });

  it("an anchor is floored to whole seconds so MySQL TIMESTAMP equality holds", async () => {
    const store = createMemoryDurableLimitStore();
    const limits = [{ key: durableLimiterKey("t-ticket", "jti-2"), windowMs: 60_000, limit: 2, anchorMs: T0 + 1_234 }];
    expect((await consumeDurableLimits(limits, { store, now: T0 + 2_000 })).allowed).toBe(true);
    expect((await consumeDurableLimits(limits, { store, now: T0 + 3_000 })).allowed).toBe(true);
    expect((await consumeDurableLimits(limits, { store, now: T0 + 4_000 })).allowed).toBe(false);
    expect(Array.from(store.rows.keys())[0]).toContain(`|${T0 + 1_000}`);
  });

  it("locks a counter once its failures reach the threshold, and reports when the lock ends", async () => {
    const store = createMemoryDurableLimitStore();
    const counter = { key: durableLimiterKey("t-fail-pair", "a|ip"), windowMs: 15 * 60_000, threshold: 3, lockKey: durableLimiterKey("t-lock-pair", "a|ip"), lockMs: 15 * 60_000 };
    expect(await activeDurableLock([counter.lockKey], { store, now: T0 })).toEqual({ locked: false });
    for (let i = 0; i < 2; i++) expect(await recordDurableFailures([counter], { store, now: T0 + i })).toBe("recorded");
    expect(await activeDurableLock([counter.lockKey], { store, now: T0 + 10 })).toEqual({ locked: false });
    expect(await recordDurableFailures([counter], { store, now: T0 + 60_000 })).toBe("recorded");
    expect(await activeDurableLock([counter.lockKey], { store, now: T0 + 60_000 })).toEqual({ locked: true, retryAfterSeconds: 15 * 60 });
    expect(await activeDurableLock([counter.lockKey], { store, now: T0 + 60_000 + 15 * 60_000 })).toEqual({ locked: false });
  });

  it("counts failures per counter: one locked pair does not lock another", async () => {
    const store = createMemoryDurableLimitStore();
    const pair = (who: string) => ({ key: durableLimiterKey("t-fail-pair", who), windowMs: 60_000, threshold: 2, lockKey: durableLimiterKey("t-lock-pair", who), lockMs: 60_000 });
    await recordDurableFailures([pair("a")], { store, now: T0 });
    await recordDurableFailures([pair("a")], { store, now: T0 + 1 });
    expect((await activeDurableLock([pair("a").lockKey], { store, now: T0 + 2 })).locked).toBe(true);
    expect((await activeDurableLock([pair("b").lockKey], { store, now: T0 + 2 })).locked).toBe(false);
  });

  it("fails closed: no durable store means unavailable, never unlocked", async () => {
    const counter = { key: "x:y", windowMs: 1000, threshold: 1, lockKey: "x:z", lockMs: 1000 };
    expect(await recordDurableFailures([counter], { store: null })).toBe("unavailable");
    expect(await activeDurableLock(["x:z"], { store: null })).toEqual({ locked: "unavailable" });
  });
});
