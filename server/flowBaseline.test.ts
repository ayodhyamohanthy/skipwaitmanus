import { describe, expect, it } from "vitest";
import { BASELINE_WINDOW_DAYS, baselineWeekStarts, decisionLatencyHours, daysSince, emptyFlowBaseline, isExternalReferrerDomain, utcWeekStartMs, weekKeyFor } from "../shared/flowBaseline";
import { buildFlowBaseline, operatorDomains } from "./flowBaseline";
import type { FlowBaselineSource } from "./flowBaselineSource";

// Fixed clock: Friday 2026-10-16 12:00 UTC. Weeks in the window are
// 2026-09-21, 2026-09-28, 2026-10-05 and 2026-10-12 (UTC Mondays).
const NOW = Date.UTC(2026, 9, 16, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const fixture = (overrides: Partial<FlowBaselineSource> = {}): FlowBaselineSource => ({
  loadRequests: async () => [],
  loadPassedRequestIds: async () => [],
  loadTransitionsSince: async () => [],
  loadReferrerProfiles: async () => [],
  loadAllocatedSlotCounts: async () => new Map<number, number>(),
  loadCompanyDomains: async () => [],
  loadSubscriberWallets: async () => [],
  countRequestsWithoutTransitions: async () => 0,
  ...overrides,
});

const request = (id: number, companyDomain: string, status: string, createdAt: number, referrerId: number | null = null) => ({ id, companyDomain, status, referrerId, createdAt: new Date(createdAt) });
const referrer = (userId: number, domain: string | null, overrides: Partial<{ paused: boolean; referralCapacity: number | null; verified: boolean; userSuspended: boolean; personSuspended: boolean | null }> = {}) => ({
  userId,
  accountType: "referrer",
  workEmailDomain: domain,
  workEmailVerifiedAt: overrides.verified === false ? null : new Date(NOW - 30 * DAY),
  paused: overrides.paused ?? false,
  referralCapacity: overrides.referralCapacity ?? 3,
  userSuspended: overrides.userSuspended ?? false,
  personSuspended: overrides.personSuspended ?? null,
});

describe("D-018 baseline aggregation", () => {
  it("buckets asks by week and outcome, counts expiries from the sweep, and measures decision latency", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadRequests: async () => [
        request(1, "acme.com", "approved", Date.UTC(2026, 9, 12, 9)),
        request(2, "acme.com", "pending", Date.UTC(2026, 9, 13, 9)),   // passed, still waiting for a colleague
        request(3, "acme.com", "closed", Date.UTC(2026, 9, 14, 9)),
        request(4, "beta.com", "withdrawn", Date.UTC(2026, 8, 29, 9)),
        request(5, "beta.com", "declined", Date.UTC(2026, 9, 12, 9)),  // historic terminal decline
        request(6, "unknown.example", "pending", Date.UTC(2026, 9, 12, 9)),
        request(7, "acme.com", "pending", Date.UTC(2026, 8, 18, 9)),   // before the first bucket
      ],
      loadPassedRequestIds: async () => [2],
      loadTransitionsSince: async () => [
        { requestId: 1, actorUserId: 11, action: "claim", createdAt: new Date(Date.UTC(2026, 9, 12, 11)) },
        { requestId: 1, actorUserId: 11, action: "approve", createdAt: new Date(Date.UTC(2026, 9, 13, 15)) }, // +30 h
        { requestId: 2, actorUserId: 11, action: "pass", createdAt: new Date(Date.UTC(2026, 9, 15, 11)) },    // +50 h
        { requestId: 3, actorUserId: 11, action: "expire", createdAt: new Date(Date.UTC(2026, 9, 15, 9)) },
      ],
      loadCompanyDomains: async () => [{ companyId: 1, domain: "acme.com" }, { companyId: 2, domain: "beta.com" }],
      loadReferrerProfiles: async () => [referrer(11, "acme.com"), referrer(12, "acme.com", { paused: true }), referrer(13, "beta.com", { referralCapacity: 1 }), referrer(14, "skipwait.me")],
      loadAllocatedSlotCounts: async () => new Map([[13, 1]]),
    }), { nowMs: NOW, operatorDomains: ["skipwait.me"] });

    expect(baseline.weeks.map(week => week.weekStart)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    const [first, second, third, current] = baseline.weeks;
    expect(first).toEqual({ weekStart: "2026-09-21", asks: 0, accepted: 0, passed: 0, expired: 0, declined: 0, withdrawn: 0, waiting: 0, uncovered: 0 });
    expect(second).toMatchObject({ weekStart: "2026-09-28", asks: 1, withdrawn: 1 });
    expect(third).toEqual({ weekStart: "2026-10-05", asks: 0, accepted: 0, passed: 0, expired: 0, declined: 0, withdrawn: 0, waiting: 0, uncovered: 0 });
    // Week of Oct 12: accepted, passed, expired, declined and one ask nobody has decided yet —
    // the ask written on Sep 18 falls outside every bucket, and a passed ask is its own outcome,
    // not "waiting" (it does still show up in waiting demand below).
    expect(current).toMatchObject({ weekStart: "2026-10-12", asks: 5, accepted: 1, passed: 1, expired: 1, declined: 1, withdrawn: 0, waiting: 1 });
    expect(baseline.expiries).toEqual({ total: 1, last7Days: 1 });
    // 30 h and 50 h: the median averages the middle pair, p90 is nearest-rank.
    expect(baseline.decisionLatency).toEqual({ sampleSize: 2, medianHours: 40, p90Hours: 50 });
  });

  it("counts uncovered asks from current coverage, and only asks inside the window", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadRequests: async () => [
        request(1, "acme.com", "pending", Date.UTC(2026, 9, 12, 9)),
        request(2, "unknown.example", "pending", Date.UTC(2026, 9, 12, 9)),
      ],
      loadReferrerProfiles: async () => [referrer(11, "acme.com")],
    }), { nowMs: NOW, operatorDomains: ["skipwait.me"] });

    const current = baseline.weeks[3];
    expect(current.asks).toBe(2);
    expect(current.uncovered).toBe(1); // unknown.example has no verified referrer at all
  });

  it("reports verified referrers per company including paused and at-capacity ones", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadRequests: async () => [request(1, "beta.com", "pending", Date.UTC(2026, 9, 12, 9)), request(2, "acme.com", "pending", Date.UTC(2026, 9, 13, 9))],
      loadReferrerProfiles: async () => [
        referrer(11, "acme.com"),
        referrer(12, "acme.com", { paused: true }),
        referrer(13, "acme.com", { verified: false }),
        referrer(14, "acme.com", { userSuspended: true }),
        referrer(15, "beta.com", { referralCapacity: 1 }),
        referrer(16, "gamma.com"),
      ],
      loadAllocatedSlotCounts: async () => new Map([[15, 1]]),
    }), { nowMs: NOW, operatorDomains: ["skipwait.me"] });

    // acme.com: two verified accounts (one paused, one free), plus an unverified and a suspended one — neither is a referrer.
    const acme = baseline.coverage.find(row => row.companyDomain === "acme.com");
    expect(acme).toEqual({ companyDomain: "acme.com", verifiedReferrers: 2, availableReferrers: 1, pausedOrFull: 1, waitingAsks: 1 });
    const beta = baseline.coverage.find(row => row.companyDomain === "beta.com");
    expect(beta).toMatchObject({ verifiedReferrers: 1, availableReferrers: 0, pausedOrFull: 1, waitingAsks: 1 });
    expect(baseline.coverage.find(row => row.companyDomain === "gamma.com")).toMatchObject({ verifiedReferrers: 1, availableReferrers: 1, waitingAsks: 0 });
    // Most waiting demand first: both have one ask, so the freer company leads.
    expect(baseline.coverage[0].companyDomain).toBe("acme.com");
  });

  it("reports waiting demand with the age of the oldest ask", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadRequests: async () => [
        request(1, "acme.com", "pending", NOW - 5 * DAY),
        request(2, "acme.com", "pending", NOW - 2 * DAY),
        request(3, "acme.com", "approved", NOW - 3 * DAY, 11), // claimed: not waiting
        request(4, "beta.com", "pending", NOW - 1 * DAY),
      ],
      loadReferrerProfiles: async () => [referrer(11, "acme.com")],
    }), { nowMs: NOW, operatorDomains: ["skipwait.me"] });

    expect(baseline.demand[0]).toEqual({ companyDomain: "acme.com", waitingAsks: 2, oldestWaitingDays: 5, verifiedReferrers: 1 });
    expect(baseline.demand[1]).toEqual({ companyDomain: "beta.com", waitingAsks: 1, oldestWaitingDays: 1, verifiedReferrers: 0 });
  });

  it("counts only external verified referrers as active supply, excluding operator domains", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadTransitionsSince: async () => [
        { requestId: 1, actorUserId: 11, action: "approve", createdAt: new Date(NOW - 2 * HOUR) },
        { requestId: 2, actorUserId: 12, action: "pass", createdAt: new Date(NOW - 9 * DAY) },
        { requestId: 3, actorUserId: 13, action: "claim", createdAt: new Date(NOW - 3 * HOUR) }, // operator: excluded
        { requestId: 4, actorUserId: 14, action: "expire", createdAt: new Date(NOW - HOUR) },   // no actor activity
        { requestId: 5, actorUserId: 15, action: "approve", createdAt: new Date(NOW - HOUR) },  // unverified: not supply
      ],
      loadReferrerProfiles: async () => [referrer(11, "acme.com"), referrer(12, "beta.com"), referrer(13, "skipwait.me"), referrer(15, "delta.com", { verified: false })],
    }), { nowMs: NOW, operatorDomains: ["skipwait.me"] });

    expect(baseline.externalReferrers).toEqual({ activeLast7Days: 1, activeInWindow: 2, excludedOperatorDomains: ["skipwait.me"] });
  });

  it("reports paying subscribers by plan and Free wallets inside the reverse trial", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadSubscriberWallets: async () => [
        { plan: "momentum", trialEndsAt: null, subscriptionCurrentTermEnd: new Date(NOW + 10 * DAY) },
        { plan: "start", trialEndsAt: null, subscriptionCurrentTermEnd: null },
        { plan: "keep_warm", trialEndsAt: null, subscriptionCurrentTermEnd: new Date(NOW + 200 * DAY) },
        { plan: "free", trialEndsAt: new Date(NOW + 5 * DAY), subscriptionCurrentTermEnd: null },
        { plan: "free", trialEndsAt: new Date(NOW - DAY), subscriptionCurrentTermEnd: null },
        { plan: "free", trialEndsAt: null, subscriptionCurrentTermEnd: null },
      ],
    }), { nowMs: NOW, operatorDomains: [] });

    expect(baseline.subscribers.paid).toBe(3);
    expect(baseline.subscribers.trialing).toBe(1); // the expired trial and the plain Free wallet are not trialing
    expect(baseline.subscribers.byPlan).toEqual([{ plan: "keep_warm", count: 1 }, { plan: "momentum", count: 1 }, { plan: "start", count: 1 }]);
    expect(baseline.dataQuality).toEqual([{ id: "paid_wallet_without_term", label: "Paid wallets with no term end", count: 1, hint: expect.any(String) }]);
  });

  it("surfaces data-quality rows and stays empty when every check passes", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadRequests: async () => [request(1, "gone.example", "pending", Date.UTC(2026, 9, 12, 9))],
      loadCompanyDomains: async () => [{ companyId: 1, domain: "acme.com" }],
      countRequestsWithoutTransitions: async () => 2,
    }), { nowMs: NOW, operatorDomains: [] });

    expect(baseline.dataQuality.map(row => [row.id, row.count])).toEqual([["asks_without_transition", 2], ["companies_off_directory", 1]]);

    const clean = await buildFlowBaseline(fixture(), { nowMs: NOW, operatorDomains: [] });
    expect(clean.dataQuality).toEqual([]);
    expect(clean.weeks).toHaveLength(4);
    expect(clean.decisionLatency).toEqual({ sampleSize: 0, medianHours: null, p90Hours: null });
  });

  it("carries counts only: the payload has no identity, address or request text", async () => {
    const baseline = await buildFlowBaseline(fixture({
      loadRequests: async () => [request(1, "acme.com", "approved", Date.UTC(2026, 9, 12, 9), 11)],
      loadReferrerProfiles: async () => [referrer(11, "acme.com")],
      loadTransitionsSince: async () => [{ requestId: 1, actorUserId: 11, action: "approve", createdAt: new Date(Date.UTC(2026, 9, 13, 9)) }],
    }), { nowMs: NOW, operatorDomains: ["skipwait.me"] });

    const serialized = JSON.stringify(baseline);
    expect(serialized).not.toContain("@");
    expect(serialized).not.toMatch(/userId|actorUserId|referrerId|jobSeekerId|email|candidateName|personalPitch/);
    expect(Object.keys(baseline.coverage[0])).not.toContain("userId");
  });

  it("derives operator domains from skipwait.me's own page plus the admin mailbox", () => {
    expect(operatorDomains(undefined)).toContain("skipwait.me");
    expect(operatorDomains("ops@example-team.com")).toEqual(expect.arrayContaining(["skipwait.me", "example-team.com"]));
    expect(operatorDomains("ops@skipwait.me")).toEqual(["skipwait.me"]);
  });
});

describe("baseline maths (shared contract)", () => {
  it("buckets by the UTC Monday, four whole weeks oldest first", () => {
    expect(baselineWeekStarts(NOW)).toEqual(["2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(new Date(utcWeekStartMs(NOW)).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    // Sunday belongs to the week that started six days earlier, never to the next one.
    expect(new Date(utcWeekStartMs(Date.UTC(2026, 9, 18, 23, 59))).toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(new Date(utcWeekStartMs(Date.UTC(2026, 9, 19, 0, 0))).toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("drops a timestamp outside the window instead of folding it into a bucket", () => {
    const weeks = baselineWeekStarts(NOW);
    expect(weekKeyFor(Date.UTC(2026, 9, 13), weeks)).toBe("2026-10-12");
    expect(weekKeyFor(Date.UTC(2026, 8, 18), weeks)).toBeNull();
    expect(weekKeyFor(Date.UTC(2026, 10, 1), weeks)).toBeNull();
  });

  it("averages the middle pair for the median, uses nearest-rank for p90, and nulls an empty sample", () => {
    expect(decisionLatencyHours([])).toEqual({ medianHours: null, p90Hours: null });
    expect(decisionLatencyHours([-1, Number.NaN])).toEqual({ medianHours: null, p90Hours: null });
    expect(decisionLatencyHours([1, 2, 3, 4].map(value => value * HOUR))).toEqual({ medianHours: 2.5, p90Hours: 4 });
    expect(decisionLatencyHours([90 * 60 * 1000, 30 * 60 * 1000])).toEqual({ medianHours: 1, p90Hours: 1.5 });
    expect(decisionLatencyHours([5 * HOUR])).toEqual({ medianHours: 5, p90Hours: 5 });
  });

  it("excludes operator domains and blank domains from external counting", () => {
    expect(isExternalReferrerDomain("acme.com", ["skipwait.me"])).toBe(true);
    // A case difference is still the same domain: the comparison is normalized.
    expect(isExternalReferrerDomain("SkipWait.ME", ["skipwait.me"])).toBe(false);
    expect(isExternalReferrerDomain("", ["skipwait.me"])).toBe(false);
    expect(isExternalReferrerDomain(null, ["skipwait.me"])).toBe(false);
    expect(isExternalReferrerDomain("acme.com", ["acme.com", "skipwait.me"])).toBe(false);
  });

  it("counts waiting days from the oldest ask and never goes negative", () => {
    expect(daysSince(NOW - 3 * DAY, NOW)).toBe(3);
    expect(daysSince(NOW + DAY, NOW)).toBe(0);
  });

  it("builds a zero baseline with the real week buckets and no invented numbers", () => {
    const baseline = emptyFlowBaseline(NOW, ["skipwait.me"]);
    expect(baseline.windowDays).toBe(BASELINE_WINDOW_DAYS);
    expect(baseline.weeks).toHaveLength(4);
    expect(baseline.weeks.every(week => week.asks === 0 && week.uncovered === 0)).toBe(true);
    expect(baseline.decisionLatency).toEqual({ sampleSize: 0, medianHours: null, p90Hours: null });
    expect(baseline.subscribers).toEqual({ paid: 0, trialing: 0, byPlan: [] });
    expect(baseline.externalReferrers).toEqual({ activeLast7Days: 0, activeInWindow: 0, excludedOperatorDomains: ["skipwait.me"] });
    expect(baseline.dataQuality).toEqual([]);
  });
});
