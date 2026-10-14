import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { claimDurableOnce, consumeDurableLimits, durableLimiterKey, isDurablyClaimed, releaseDurableClaim } from "./durableRateLimit";
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
  });
});
