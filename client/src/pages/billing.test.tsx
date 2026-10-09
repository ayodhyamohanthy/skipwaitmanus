// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Billing from "./Billing";

const { authState, getToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/billing"] }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const freeSummary = { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, totalAvailable: 3, subscriptionStatus: null, subscriptionCurrentTermEnd: null };

describe("Billing page", () => {
  it("shows the free plan with an empty receipt ledger, never invented methods", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ summary: freeSummary, receipts: [] })));
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Manage plan." })).toBeTruthy();
    expect(screen.getAllByText("Free").length).toBeGreaterThan(0);
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.getByText(/never sees or stores them/)).toBeTruthy();
    expect(screen.queryByText(/Visa|UPI|PayPal/)).toBeNull();
    expect(screen.getByRole("link", { name: /Upgrade/ }).getAttribute("href")).toBe("/plans");
  });

  it("shows an active plan, real receipts, and walks cancellation to kept access", async () => {
    const summary = { plan: "pro", monthlyAllowance: 10, monthlyCreditsRemaining: 7, totalAvailable: 9, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z" };
    const receipts = [{ id: 1, provider: "chargebee", amount: 59900, currency: "INR", tokenCount: 10, status: "credited", providerInvoiceId: "inv-1", createdAt: "2026-10-06T00:00:00.000Z" }];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes("/subscription-cancel")) return ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" });
      if (String(url).includes("/billing/receipts")) return ok({ receipts });
      return ok({ summary });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: /Pro/ })).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("10 credits/month")).toBeTruthy();
    expect(screen.getByText(/Nov 6, 2026/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(screen.getByText("Cancelling")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-cancel", expect.objectContaining({ method: "POST" }));
  });
});
