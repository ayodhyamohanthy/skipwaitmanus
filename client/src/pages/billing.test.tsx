// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Billing from "./Billing";

const { authState, getToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, getToken: vi.fn().mockResolvedValue("test-token") }));

// Packs-on-sale paths: the flag is mocked on here; creditPacksOffSale.test.tsx pins the shipped (off) state.
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ ...authState, getToken }), SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>, useLocation: () => ["/billing"] }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); authState.isSignedIn = true; try { window.localStorage.clear(); } catch { /* jsdom without storage */ } });

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const fail = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

/** Routes the three reads /billing makes; anything unrouted answers like the real server would. */
function stubFetch(options: { summary: unknown; receipts?: unknown[]; methods?: unknown; onSession?: () => unknown }) {
  const mock = vi.fn(async (url: string) => {
    const target = String(url);
    if (target.includes("/billing/payment-methods/session")) return (options.onSession?.() ?? ok({ url: "https://skipwait-test.chargebee.com/hosted/ps_manage" }));
    if (target.includes("/billing/payment-methods")) return ok(options.methods ?? { methods: [], customer: false });
    if (target.includes("/billing/receipts")) return ok({ receipts: options.receipts ?? [] });
    return ok({ summary: options.summary });
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

// As GET /api/credits/summary sends them: the caller's open-ask slots and the ledger block ride on the summary.
const slots = (plan: string, planLabel: string, cap: number) => ({ plan, planLabel, open: 1, cap, full: false, nextPlan: null });
const ledger = (creditsPerMonth: number, balance: number) => ({ balance, buckets: { cycle: balance, carriedOver: 0, trial: 0, welcome: 0, purchased: 0, promo: 0 }, creditsPerMonth, carryover: creditsPerMonth > 0 ? 1 : 0, cycle: { key: "2026-10", startsAt: null, endsAt: null, granted: creditsPerMonth, used: 0 }, planCreditsRemaining: balance, nextExpiry: null, planCreditsExpiringSoon: null, welcome: { granted: false, credits: 0, remaining: 0 } });
const freeSummary = { plan: "free", monthlyAllowance: 0, monthlyCreditsRemaining: 0, totalAvailable: 3, subscriptionStatus: null, subscriptionCurrentTermEnd: null, paymentMethodOnFile: false, paymentMethodRequiredForFreeCredits: true, slots: slots("free", "Free", 3), ledger: ledger(0, 3) };
// A 30-day Start pass (shared/planCatalog.ts: 8 open asks, 10 credits a cycle, 1 month of carryover).
const startSummary = { plan: "start", monthlyAllowance: 10, monthlyCreditsRemaining: 7, totalAvailable: 9, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z", paymentMethodOnFile: true, paymentMethodRequiredForFreeCredits: true, slots: slots("start", "Start", 8), ledger: ledger(10, 9) };

describe("Billing page", () => {
  it("shows the free plan, the payment-method prompt, and no invented methods", async () => {
    stubFetch({ summary: freeSummary });
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Manage plan." })).toBeTruthy();
    expect(screen.getByText("3 open asks · buy credits anytime")).toBeTruthy();
    expect(screen.getByText("No payments yet.")).toBeTruthy();
    expect(screen.getByText(/never sees or stores them/)).toBeTruthy();
    expect(screen.queryByText(/Visa|UPI|PayPal|4242|Make default|Add payment method/)).toBeNull();
    // D-067: no plan is sold from /plans until the D-046 passes go on sale, so Free offers the credits it can really buy.
    expect(screen.getByRole("link", { name: "Add credits" }).getAttribute("href")).toBe("/premium?role=job_seeker");
    expect(screen.queryByRole("link", { name: /Upgrade/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/DESIGN PREVIEW|Preview state|EXAMPLE RECEIPTS|Momentum|PLACEHOLDERS|\bPro\b|\bMax\b/);
  });

  it("lists the saved methods the provider holds, with no prompt once a card is on file", async () => {
    stubFetch({ summary: proSummary, methods: savedCard });
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Pro" })).toBeTruthy();
    expect(await screen.findByText(/Visa •••• 4242/)).toBeTruthy();
    expect(screen.getByText(/Default · expires 08\/28/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Manage payment methods" })).toBeTruthy();
    expect(screen.queryByText("Add a payment method to become eligible for free monthly credits.")).toBeNull();
  });

  it("dismisses the prompt without losing the reason, because the panel keeps saying it", async () => {
    stubFetch({ summary: freeSummary });
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss the payment method prompt" }));
    expect(screen.queryByText("Add a payment method to become eligible for free monthly credits.")).toBeNull();
    expect(screen.getByText("No payment method on file. Free monthly credits stay paused until one is saved.")).toBeTruthy();
  });

  it("opens the hosted card page through the server, never with card fields of its own", async () => {
    const fetchMock = stubFetch({ summary: freeSummary, onSession: () => fail(502, "We could not open the secure card page") });
    render(<Billing />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a payment method to unlock free monthly credits" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/billing/payment-methods/session?role=job_seeker", expect.objectContaining({ method: "POST", body: JSON.stringify({ returnTo: "methods" }) })));
    expect((await screen.findByRole("alert")).textContent).toContain("We could not open the secure card page");
    // No card number, expiry or CVV input exists on this page at all.
    expect(document.querySelector("input[autocomplete='cc-number']")).toBeNull();
  });

  it("still shows the plan and receipts when the provider cannot be reached", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/billing/payment-methods")) return fail(502, "We could not reach the payment provider. Try again in a moment.");
      if (target.includes("/billing/receipts")) return ok({ receipts: [] });
      return ok({ summary: freeSummary });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
    expect((await screen.findByRole("alert")).textContent).toContain("could not reach the payment provider");
    // The panel does not claim "no card" when it simply could not ask.
    expect(screen.queryByText("No payment method on file. Free monthly credits stay paused until one is saved.")).toBeNull();
  });

  it("re-reads the credits when the provider reports a card the summary did not know about", async () => {
    let summaryCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const target = String(url);
      if (target.includes("/billing/payment-methods")) return ok(savedCard);
      if (target.includes("/billing/receipts")) return ok({ receipts: [] });
      summaryCalls += 1;
      // First read predates the card; the second one is the month it unlocks.
      return ok({ summary: summaryCalls === 1 ? freeSummary : { ...freeSummary, monthlyAllowance: 3, monthlyCreditsRemaining: 3, paymentMethodOnFile: true } });
    }));
    render(<Billing />);
    await waitFor(() => expect(summaryCalls).toBe(2));
    await waitFor(() => expect(screen.queryByText("Add a payment method to become eligible for free monthly credits.")).toBeNull());
    expect(screen.queryByText(/this month's free credits are paused/)).toBeNull();
    // Exactly one re-read: the loop guard holds.
    expect(summaryCalls).toBe(2);
  });

  it("shows an active plan, real receipts, and walks cancellation to kept access", async () => {
    const receipts = [
      { id: 2, provider: "chargebee", amount: 500, currency: "USD", tokenCount: 5, status: "credited", providerInvoiceId: "inv-2", createdAt: "2026-10-06T06:00:00.000Z" },
      { id: 1, provider: "chargebee", amount: 9900, currency: "INR", tokenCount: 1, status: "refunded", providerInvoiceId: "inv-1", createdAt: "2026-09-06T06:00:00.000Z" },
    ];
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes("/subscription-cancel")) return ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" });
      if (String(url).includes("/billing/receipts")) return ok({ receipts });
      return ok({ summary: startSummary });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Billing />);
    expect(await screen.findByRole("heading", { name: "Start" })).toBeTruthy();
    expect(screen.getByText("Renews 6 Nov 2026 · 8 open asks · 10 credits/month")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plans & credits/ }).getAttribute("href")).toBe("/plans");
    expect(document.body.textContent).not.toMatch(/requests left|requests\/month|requests a month/);
    expect(screen.getByText("5 credits")).toBeTruthy();
    expect(screen.getByText("$5")).toBeTruthy();
    expect(screen.getByText("₹99")).toBeTruthy();
    expect(screen.getByText("Refunded")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel plan" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Before you go" })).toBeTruthy();
    expect(within(dialog).getByText(/You keep Start until 6 Nov\./)).toBeTruthy();
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
      return ok({ summary: startSummary });
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
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: { ...startSummary, subscriptionStatus: "non_renewing" } })));
    render(<Billing />);
    expect(await screen.findByText("Ends 6 Nov 2026 — you keep everything until then.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
  });

  it("leaves out open asks and monthly credits the server did not send, never guessing them", async () => {
    const { slots: _slots, ledger: _ledger, ...bare } = startSummary;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: bare })));
    render(<Billing />);
    expect(await screen.findByText("Renews 6 Nov 2026")).toBeTruthy();
    cleanup();
    const { slots: _freeSlots, ...bareFree } = freeSummary;
    stubFetch({ summary: bareFree });
    render(<Billing />);
    expect(await screen.findByText("Buy credits anytime")).toBeTruthy();
  });

  it("recovers from a network failure with Try again", async () => {
    let online = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (!online) throw new TypeError("Failed to fetch");
      if (String(url).includes("/billing/payment-methods")) return ok({ methods: [], customer: false });
      if (String(url).includes("/billing/receipts")) return ok({ receipts: [] });
      return ok({ summary: freeSummary });
    }));
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("Check your connection");
    online = true;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("treats a malformed summary as a failed load, never as an empty account", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: { plan: "start" } })));
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your plan");
    expect(screen.queryByRole("heading", { name: "Free" })).toBeNull();
  });

  it("treats a summary without the eligibility fact as a failed load, never as a card on file", async () => {
    const { paymentMethodOnFile: _eligible, ...older } = freeSummary;
    stubFetch({ summary: older });
    render(<Billing />);
    expect((await screen.findByRole("alert")).textContent).toContain("We could not load your plan");
  });

  it("asks signed-out visitors to sign in", () => {
    authState.isSignedIn = false;
    render(<Billing />);
    expect(screen.getByRole("heading", { name: "Manage plan." })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plans & credits/ }).getAttribute("href")).toBe("/plans");
    expect(screen.queryByRole("link", { name: /Compare plans/ })).toBeNull();
  });

  it("reads a stale Pro or Max summary as Free: the Free panel, no cancel action, no retired name", async () => {
    for (const plan of ["pro", "max"]) {
      vi.stubGlobal("fetch", vi.fn(async (url: string) => String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary: { ...startSummary, plan, slots: null } })));
      render(<Billing />);
      expect(await screen.findByRole("heading", { name: "Free" })).toBeTruthy();
      expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
      expect(document.body.textContent).not.toMatch(/\bPro\b|\bMax\b/);
      cleanup();
    }
  });
});
