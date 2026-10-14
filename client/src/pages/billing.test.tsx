// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Billing from "./Billing";

const { authState, getToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, getToken: vi.fn().mockResolvedValue("test-token") }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/billing"] }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
// As GET /api/credits/summary sends them: the caller's open-ask slots and the ledger block ride on the summary.
const slots = (plan: string, cap: number) => ({ plan, planLabel: plan === "free" ? "Free" : "Pro", open: 1, cap, full: false, nextPlan: null });
const ledger = (creditsPerMonth: number, balance: number) => ({ balance, buckets: { cycle: balance, carriedOver: 0, welcome: 0, purchased: 0, promo: 0 }, creditsPerMonth, carryover: creditsPerMonth > 0 ? 1 : 0, cycle: { key: "2026-10", startsAt: null, endsAt: null, granted: creditsPerMonth, used: 0 }, planCreditsRemaining: balance, nextExpiry: null, planCreditsExpiringSoon: null, welcome: { granted: false, credits: 0, remaining: 0 } });
const freeSummary = { plan: "free", monthlyAllowance: 0, monthlyCreditsRemaining: 0, totalAvailable: 3, subscriptionStatus: null, subscriptionCurrentTermEnd: null, slots: slots("free", 3), ledger: ledger(0, 3) };
const proSummary = { plan: "pro", monthlyAllowance: 10, monthlyCreditsRemaining: 7, totalAvailable: 9, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z", slots: slots("pro", 10), ledger: ledger(10, 9) };

describe("Billing page", () => {
  it("shows the free plan with an empty receipt ledger, never invented methods", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({ summary: freeSummary, receipts: [] })));
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Manage plan." })).toBeTruthy();
    expect(screen.getByText("3 open asks · buy credits anytime")).toBeTruthy();
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.getByText(/never sees or stores them/)).toBeTruthy();
    expect(screen.queryByText(/Visa|UPI|PayPal|4242|Make default|Add payment method/)).toBeNull();
    expect(screen.getByRole("link", { name: /Upgrade/ }).getAttribute("href")).toBe("/plans");
    expect(document.body.textContent).not.toMatch(/DESIGN PREVIEW|Preview state|EXAMPLE RECEIPTS|Momentum|PLACEHOLDERS/);
  });

  it("shows an active plan, real receipts, and walks cancellation to kept access", async () => {
    const receipts = [
      { id: 2, provider: "chargebee", amount: 500, currency: "USD", tokenCount: 5, status: "credited", providerInvoiceId: "inv-2", createdAt: "2026-10-06T06:00:00.000Z" },
      { id: 1, provider: "chargebee", amount: 9900, currency: "INR", tokenCount: 1, status: "refunded", providerInvoiceId: "inv-1", createdAt: "2026-09-06T06:00:00.000Z" },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/subscription-cancel")) return ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" });
      if (String(url).includes("/billing/receipts")) return ok({ receipts });
      return ok({ summary: proSummary });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Pro" })).toBeTruthy();
    expect(screen.getByText("Renews 6 Nov 2026 · 10 open asks · 10 credits/month")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/requests left|requests\/month|requests a month/);
    expect(screen.getByText("5 credits")).toBeTruthy();
    expect(screen.getByText("$5")).toBeTruthy();
    expect(screen.getByText("₹99")).toBeTruthy();
    expect(screen.getByText("Refunded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Before you go" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel anyway" }));
    expect(await within(screen.getByRole("dialog")).findByRole("heading", { name: "Plan cancelled." })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-cancel", expect.objectContaining({ method: "POST" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Ends 6 Nov 2026 — you keep everything until then.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
  });

  it("keeps the plan when the user backs out, and announces a failed cancellation in the dialog", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/subscription-cancel")) return { ok: false, status: 502, json: async () => ({ error: "We could not schedule your cancellation" }) };
      if (String(url).includes("/billing/receipts")) return ok({ receipts: [] });
      return ok({ summary: proSummary });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my plan" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalledWith("/api/chargebee/subscription-cancel", expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel anyway" }));
    expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toContain("We could not schedule your cancellation");
    expect(screen.getByText(/^Renews 6 Nov 2026/)).toBeTruthy();
  });

  it("shows a non-renewing plan as ending, with no cancel action", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: { ...proSummary, subscriptionStatus: "non_renewing" } })));
    render(<Billing />);
    expect(await screen.findByText("Ends 6 Nov 2026 — you keep everything until then.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
  });

  it("leaves out open asks and monthly credits the server did not send, never guessing them", async () => {
    const { slots: _slots, ledger: _ledger, ...bare } = proSummary;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: bare })));
    render(<Billing />);
    expect(await screen.findByText("Renews 6 Nov 2026")).toBeTruthy();
    cleanup();
    const { slots: _freeSlots, ...bareFree } = freeSummary;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: bareFree })));
    render(<Billing />);
    expect(await screen.findByText("Buy credits anytime")).toBeTruthy();
  });

  it("recovers from a network failure with Try again", async () => {
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!online) throw new TypeError("Failed to fetch");
      return String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: freeSummary });
    }));
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("Check your connection");
    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("treats a malformed summary as a failed load, never as an empty account", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: { plan: "pro" } })));
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your plan");
    expect(screen.queryByRole("heading", { name: "Free" })).toBeNull();
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    render(<Billing />);
    expect(screen.getByRole("heading", { name: "Manage plan." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Compare plans/ }).getAttribute("href")).toBe("/plans");
  });
});
