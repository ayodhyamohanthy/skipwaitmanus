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