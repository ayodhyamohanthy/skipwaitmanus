// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import AdminFlowHealth from "./AdminFlowHealth";

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("admin-token") }),
  SignInButton: ({ children }: { children: React.ReactNode }) => children,
}));

const health = { funnel: { requestsCreated: 3, requestsClaimed: 2, decisionsRecorded: 1, waitingForCoverage: 1 }, coverageGaps: [{ companyDomain: "acme.com", waitingRequests: 1, verifiedCoverage: 0 }], instrumentation: { uploadedDocuments: 5, recordedFailures: 0 } };
const revenue = { byProvider: [{ provider: "chargebee", currency: "INR", totalAmount: 118800, count: 12 }, { provider: "chargebee", currency: "USD", totalAmount: 3000, count: 2 }], totalsByCurrency: [{ currency: "INR", totalAmount: 118800, count: 12 }, { currency: "USD", totalAmount: 3000, count: 2 }], refundedTotalByCurrency: [{ currency: "INR", totalAmount: 9900, count: 1 }], recordedAt: "2026-09-02T00:00:00.000Z" };

describe("administrator flow health revenue section", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/revenue")) return { ok: true, json: async () => ({ revenue }) };
      return { ok: true, json: async () => ({ health }) };
    }));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders per-currency revenue totals and provider breakdown", async () => {
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getAllByText("₹1188").length).toBeGreaterThan(0));
    expect(screen.getAllByText("$30").length).toBeGreaterThan(0);
    expect(screen.getByText("INR settled")).toBeTruthy();
    expect(screen.getByText("USD settled")).toBeTruthy();
    expect(screen.getAllByText("chargebee")).toHaveLength(2);
    expect(screen.getByText("Refunded ₹99 · 1 payment")).toBeTruthy();
  });

  it("shows an empty state when no revenue is recorded yet", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/revenue")) return { ok: true, json: async () => ({ revenue: { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: "" } }) };
      return { ok: true, json: async () => ({ health }) };
    }));
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("No revenue recorded yet")).toBeTruthy());
  });
});

const baseline = {
  windowDays: 28,
  generatedAt: "2026-10-16T12:00:00.000Z",
  weeks: [
    { weekStart: "2026-10-05", asks: 0, accepted: 0, passed: 0, expired: 0, declined: 0, withdrawn: 0, waiting: 0, uncovered: 0 },
    { weekStart: "2026-10-12", asks: 5, accepted: 1, passed: 1, expired: 1, declined: 1, withdrawn: 0, waiting: 1, uncovered: 2 },
  ],
  expiries: { total: 1, last7Days: 1 },
  decisionLatency: { sampleSize: 2, medianHours: 40, p90Hours: 50 },
  coverage: [
    { companyDomain: "acme.com", verifiedReferrers: 3, availableReferrers: 3, pausedOrFull: 0, waitingAsks: 1 },
    { companyDomain: "beta.com", verifiedReferrers: 2, availableReferrers: 0, pausedOrFull: 2, waitingAsks: 0 },
  ],
  demand: [{ companyDomain: "acme.com", waitingAsks: 1, oldestWaitingDays: 3, verifiedReferrers: 3 }],
  externalReferrers: { activeLast7Days: 2, activeInWindow: 4, excludedOperatorDomains: ["skipwait.me"] },
  subscribers: { paid: 3, trialing: 1, byPlan: [{ plan: "momentum", count: 2 }, { plan: "keep_warm", count: 1 }] },
  dataQuality: [{ id: "asks_without_transition", label: "Asks with no state-machine record", count: 2, hint: "Audit that ask on its next read." }],
};

describe("administrator flow-health baseline panel (D-018)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("renders the four-week baseline, coverage, demand, subscribers and data-quality rows", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/admin/revenue")) return { ok: true, json: async () => ({ revenue: { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: "" } }) };
      return { ok: true, json: async () => ({ health, baseline }) };
    }));
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Baseline")).toBeTruthy());
    // Weekly buckets, newest week first, with the week that had no asks kept visible.
    expect(screen.getByText("Week of")).toBeTruthy();
    expect(screen.getAllByText("2026-10-12").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2026-10-05").length).toBeGreaterThan(0);
    // Durations with their sample size, and no invented number when unsampled.
    expect(screen.getByText("Median time to first decision")).toBeTruthy();
    expect(screen.getByText("40 h")).toBeTruthy();
    expect(screen.getByText("2 asks with an accept or pass.")).toBeTruthy();
    // Coverage, including the paused-or-full column and the D-037 supply caption.
    expect(screen.getByText("Verified coverage by company")).toBeTruthy();
    // acme.com appears in coverage, demand and the funnel's own coverage gaps — assert presence, not uniqueness.
    expect(screen.getAllByText("acme.com").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("beta.com")).toBeTruthy();
    expect(screen.getByText(/Companies at or above 3 available referrers: 1\./)).toBeTruthy();
    // Subscribers by plan and the excluded operator domain.
    expect(screen.getByText("momentum · 2")).toBeTruthy();
    expect(screen.getByText("keep warm · 1")).toBeTruthy();
    // The wordmark also says skipwait.me, so assert the chip is present rather than unique.
    expect(screen.getAllByText("skipwait.me").length).toBeGreaterThanOrEqual(2);
    // Data quality is named, never a bare number.
    expect(screen.getByText("Asks with no state-machine record")).toBeTruthy();
    expect(screen.getByText("Audit that ask on its next read.")).toBeTruthy();
  });

  it("shows an unavailable state rather than a zeroed panel when the server sent no baseline", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/admin/revenue")) return { ok: true, json: async () => ({ revenue: { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: "" } }) };
      return { ok: true, json: async () => ({ health }) };
    }));
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText(/The baseline is unavailable in this session/)).toBeTruthy());
    expect(screen.queryByText("Week of")).toBeNull();
  });
});

const fanOut = {
  requests: 9,
  creationsScanned: 5,
  employeeNotifications: 18,
  largestRequestFanOut: 7,
  fastTrackRequests: 2,
  reviewGrants: 11,
  requestsWithGrants: 4,
  grantsPerRequest: 2.8,
  mostEmailedEmployee: 5,
  repeatedRoleLinks: 1,
  requestsOnRepeatedRoleLinks: 3,
};

function serveHealth(payloadHealth: unknown) {
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/api/admin/revenue")) return { ok: true, json: async () => ({ revenue: { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: "" } }) };
    return { ok: true, json: async () => ({ health: payloadHealth }) };
  }));
}

describe("administrator flow-health notification fan-out panel", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("separates employee reach from review links, and states the window it measured", async () => {
    serveHealth({ ...health, fanOut });
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Notification fan-out")).toBeTruthy());
    expect(screen.getByText("In-app notices across the last 5 recorded requests.")).toBeTruthy();
    expect(screen.getByText("One request reached this many verified employees.")).toBeTruthy();
    expect(screen.getByText("Review links the single most-emailed employee received.")).toBeTruthy();
    expect(screen.getByText("2 of 5 recorded requests reached one named referrer")).toBeTruthy();
    expect(screen.getByText("1 role link reused by 3 requests.")).toBeTruthy();
  });

  it("keeps a measured zero visible and drops the reuse line when nothing repeated", async () => {
    serveHealth({ ...health, fanOut: { ...fanOut, repeatedRoleLinks: 0, requestsOnRepeatedRoleLinks: 0, mostEmailedEmployee: 0 } });
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Notification fan-out")).toBeTruthy());
    expect(screen.getByText("Review links the single most-emailed employee received.")).toBeTruthy();
    expect(screen.queryByText(/reused by/)).toBeNull();
  });

  it("names the API build when the payload has no fan-out block at all", async () => {
    serveHealth(health);
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Notification fan-out")).toBeTruthy());
    expect(screen.getByText("This API build does not report fan-out yet. Deploy the matching API release to read it.")).toBeTruthy();
  });

  it("treats a partial fan-out block as unavailable instead of rendering blank counts", async () => {
    serveHealth({ ...health, fanOut: { requests: 9, employeeNotifications: 18 } });
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Notification fan-out")).toBeTruthy());
    expect(screen.getByText("This API build does not report fan-out yet. Deploy the matching API release to read it.")).toBeTruthy();
  });
});
