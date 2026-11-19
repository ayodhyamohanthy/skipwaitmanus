import { describe, expect, it } from "vitest";
import { buildReferrerHome, monthStartUtc } from "./referrerHome";

describe("referrer home read model", () => {
  it("computes capacity left and routing state", () => {
    expect(buildReferrerHome({ verified: true, paused: false, capacity: 3, usedThisMonth: 1, waiting: 4, expiringSoon: 1 })).toEqual({ capacity: { total: 3, usedThisMonth: 1, left: 2 }, routing: { state: "active" }, waiting: 4, expiringSoon: 1 });
    expect(buildReferrerHome({ verified: true, paused: false, capacity: 3, usedThisMonth: 5, waiting: 0, expiringSoon: 0 }).routing.state).toBe("at_capacity");
    expect(buildReferrerHome({ verified: true, paused: true, capacity: 3, usedThisMonth: 0, waiting: 0, expiringSoon: 0 }).routing.state).toBe("paused");
    expect(buildReferrerHome({ verified: false, paused: false, capacity: 3, usedThisMonth: 0, waiting: 0, expiringSoon: 0 }).routing.state).toBe("unverified");
  });
  it("never reports negative or invalid values", () => {
    const home = buildReferrerHome({ verified: true, paused: false, capacity: Number.NaN, usedThisMonth: -2, waiting: -1, expiringSoon: -1 });
    expect(home).toMatchObject({ capacity: { total: 3, usedThisMonth: 0, left: 3 }, waiting: 0, expiringSoon: 0 });
  });
  it("month starts at UTC midnight on the 1st", () => {
    expect(monthStartUtc(new Date("2026-10-31T23:59:59Z")).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
});
