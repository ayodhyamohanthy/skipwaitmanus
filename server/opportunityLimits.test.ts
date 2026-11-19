import { describe, expect, it } from "vitest";
import { checkPostingAllowance, isOpportunityLive, opportunityLimits } from "./opportunityLimits";

const now = new Date("2026-10-17T00:00:00Z");
const days = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("opportunity limits", () => {
  it("defaults to 3 open, 10 a day, 30 days and honours env overrides", () => {
    expect(opportunityLimits()).toEqual({ maxOpenPerUser: 3, maxPerUserPerDay: 10, hiringNowTtlDays: 30 });
    process.env.OPPORTUNITY_MAX_OPEN_PER_USER = "5"; process.env.OPPORTUNITY_HIRING_NOW_TTL_DAYS = "nope";
    expect(opportunityLimits().maxOpenPerUser).toBe(5);
    expect(opportunityLimits().hiringNowTtlDays).toBe(30);
    delete process.env.OPPORTUNITY_MAX_OPEN_PER_USER; delete process.env.OPPORTUNITY_HIRING_NOW_TTL_DAYS;
  });
  it("blocks the 4th open post and the 11th post in a day, and allows below the caps", () => {
    expect(checkPostingAllowance({ openCount: 2, lastDayCount: 9 })).toBeNull();
    expect(checkPostingAllowance({ openCount: 3, lastDayCount: 0 })).toMatch(/3 openings/);
    expect(checkPostingAllowance({ openCount: 0, lastDayCount: 10 })).toMatch(/limit of 10/);
  });
  it("expires hiring-now after 30 days and walk-ins when they end", () => {
    expect(isOpportunityLive({ isActive: true, kind: "hiring_now", createdAt: days(29), walkInEndsAt: null }, now)).toBe(true);
    expect(isOpportunityLive({ isActive: true, kind: "hiring_now", createdAt: days(31), walkInEndsAt: null }, now)).toBe(false);
    expect(isOpportunityLive({ isActive: true, kind: "walk_in", createdAt: days(40), walkInEndsAt: new Date(now.getTime() + 3600_000) }, now)).toBe(true);
    expect(isOpportunityLive({ isActive: true, kind: "walk_in", createdAt: days(1), walkInEndsAt: new Date(now.getTime() - 1) }, now)).toBe(false);
    expect(isOpportunityLive({ isActive: false, kind: "hiring_now", createdAt: days(1), walkInEndsAt: null }, now)).toBe(false);
  });
});
