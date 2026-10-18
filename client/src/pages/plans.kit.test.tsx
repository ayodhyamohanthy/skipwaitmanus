// @vitest-environment jsdom
// /plans after D-067 (owner, Oct 18 2026): Pro/Max are removed, so the page
// states the free allowance and sells credits. It must never render a plan card
// for a plan checkout cannot charge, never call a subscription or gift checkout,
// and never show usage or moments the account has not really hit.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CreditsLedger } from "@shared/creditLedger";
import Plans from "./Plans";

const { authState, getToken } = vi.hoisted(() => ({ authState: { isSignedIn: true }, getToken: vi.fn(async () => "test-token") }));
// Packs-on-sale paths: the flag is mocked on here.
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken, openSignIn: vi.fn() }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));

const ledger = (patch: Partial<CreditsLedger> = {}): CreditsLedger => ({ balance: 0, buckets: { cycle: 0, carriedOver: 0, trial: 0, welcome: 0, purchased: 0, promo: 0 }, creditsPerMonth: 0, carryover: 0, cycle: { key: "2026-10", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-01T00:00:00.000Z", granted: 0, used: 0 }, planCreditsRemaining: 0, nextExpiry: null, planCreditsExpiringSoon: null, welcome: { granted: false, credits: 0, remaining: 0 }, ...patch });
const slots = (open: number, cap = 3, plan = "free") => ({ plan, planLabel: plan === "free" ? "Free" : "Free", open, cap, full: open >= cap, nextPlan: null });
const summary = ({ open = 0, used = 0, purchased = 0 } = {}) => ({ plan: "free", monthlyAllowance: 0, monthlyCreditsRemaining: 0, purchasedCreditsRemaining: purchased, totalAvailable: purchased, subscriptionStatus: null, subscriptionCurrentTermEnd: null, slots: slots(open), ledger: ledger({ balance: purchased, buckets: { cycle: 0, carriedOver: 0, trial: 0, welcome: 0, purchased, promo: 0 }, cycle: { key: "2026-10", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-01T00:00:00.000Z", granted: 0, used } }) });

function stub(payload: unknown) {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => ({ summary: payload }) };
    return { ok: true, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => { authState.isSignedIn = true; window.history.pushState({}, "", "/plans?role=job_seeker"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

describe("Plans after D-067", () => {
  it("states the free allowance and the credit price, and never sells a retired plan", async () => {
    authState.isSignedIn = false;
    const fetchMock = stub(null);
    render(<Plans />);
    expect(screen.getByRole("heading", { name: "Everything starts free." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Free", level: 2 })).toBeTruthy();
    // Signed out: the price of a credit, never a balance.
    expect(screen.getByText("$1 a credit")).toBeTruthy();
    expect(screen.getByText("PAY AS YOU GO")).toBeTruthy();
    // D-067: no retired plan, no retired price, no retired perk.
    const text = document.body.textContent ?? "";
    for (const banned of ["Pro", "Max", "Pro/Max", "$7", "$15", "₹599", "₹1,299", "DESIGN PREVIEW", "EXAMPLE PRICING", "Most chosen", "Yearly", "checkout preview", "Gift", "Your plan is active"]) expect(text).not.toContain(banned);
    // Limits come from the enforced entitlements, not from copy.
    expect(screen.getByText("3 referral requests open at once")).toBeTruthy();
    expect(screen.getByText("3 credits every month, then buy more as you need them")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never calls a subscription or gift checkout", async () => {
    const fetchMock = stub(summary({ open: 1 }));
    render(<Plans />);
    await screen.findByText("1 of 3");
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toEqual(["/api/credits/summary?role=job_seeker"]);
    expect(urls.some(url => url.includes("chargebee"))).toBe(false);
  });

  it("shows the account's own usage and only the moments it has really hit", async () => {
    stub(summary({ open: 3, used: 2 }));
    render(<Plans />);
    expect(await screen.findByText("3 of 3")).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Open referral slots used" }).getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("Your 3 requests are all open")).toBeTruthy();
    expect(screen.getByText("You're out of credits")).toBeTruthy();
    // A moment points at what it unblocks, never at a plan to buy.
    expect(screen.getAllByRole("link", { name: "Add credits" }).every(link => link.getAttribute("href") === "/premium?role=job_seeker")).toBe(true);
    expect(screen.getAllByRole("link", { name: "View my requests" }).every(link => link.getAttribute("href") === "/requests")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "I'll wait" }));
    expect(screen.queryByText("Your 3 requests are all open")).toBeNull();
    cleanup();

    // Slots free and no credits ever spent: no limit was hit, so no moments.
    stub(summary({ open: 1 }));
    render(<Plans />);
    expect(await screen.findByText("1 of 3")).toBeTruthy();
    expect(screen.queryByText("Upgrade moments")).toBeNull();
  });

  it("keeps the credits section and the balance out of the signed-out view", () => {
    authState.isSignedIn = false;
    stub(null);
    render(<Plans />);
    expect(screen.getByText("NO SUBSCRIPTION NEEDED")).toBeTruthy();
    expect(screen.queryByText("YOUR BALANCE")).toBeNull();
    expect(screen.queryByLabelText("Your usage this cycle")).toBeNull();
  });
});
