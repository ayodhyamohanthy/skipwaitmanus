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

const revenueOnly = { byProvider: [], totalsByCurrency: [], refundedTotalByCurrency: [], recordedAt: "" };
const fanOutHealth = (fanOut: Record<string, number> | undefined) => ({
  funnel: { requestsCreated: 3, requestsClaimed: 2, decisionsRecorded: 1, waitingForCoverage: 1 },
  coverageGaps: [], instrumentation: { uploadedDocuments: 5, recordedFailures: 0 }, fanOut,
});
const serve = (payload: unknown) => vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/admin/revenue")) return { ok: true, json: async () => ({ revenue: revenueOnly }) };
  return { ok: true, json: async () => ({ health: payload }) };
});

describe("administrator flow health fan-out section", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("shows how many employees one seeker action reached", async () => {
    vi.stubGlobal("fetch", serve(fanOutHealth({ requests: 5, creationsScanned: 5, employeeNotifications: 121, largestRequestFanOut: 120, fastTrackRequests: 2, reviewGrants: 41, requestsWithGrants: 3, grantsPerRequest: 13.7, mostEmailedEmployee: 9, repeatedRoleLinks: 1, requestsOnRepeatedRoleLinks: 3 })));
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Employees notified")).toBeTruthy());
    expect(screen.getByText("121")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("41")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("2 of 5 recorded requests reached one named referrer")).toBeTruthy();
    expect(screen.getByText("1 role link reused by 3 requests.")).toBeTruthy();
    expect(screen.queryByText("This API build does not report fan-out yet. Deploy the matching API release to read it.")).toBeNull();
  });

  it("states measured zero instead of hiding the panel when nothing has been sent", async () => {
    // An absent panel and a zero panel mean opposite things to the person deciding
    // whether the product is spamming referrers.
    vi.stubGlobal("fetch", serve(fanOutHealth({ requests: 0, creationsScanned: 0, employeeNotifications: 0, largestRequestFanOut: 0, fastTrackRequests: 0, reviewGrants: 0, requestsWithGrants: 0, grantsPerRequest: 0, mostEmailedEmployee: 0, repeatedRoleLinks: 0, requestsOnRepeatedRoleLinks: 0 })));
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("Largest single fan-out")).toBeTruthy());
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/reused by/)).toBeNull();
  });

  it("names the missing API build rather than showing nothing when fanOut is absent", async () => {
    vi.stubGlobal("fetch", serve(fanOutHealth(undefined)));
    render(<AdminFlowHealth />);
    await waitFor(() => expect(screen.getByText("This API build does not report fan-out yet. Deploy the matching API release to read it.")).toBeTruthy());
  });
});