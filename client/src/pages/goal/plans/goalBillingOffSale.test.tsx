// @vitest-environment jsdom
// D-048-p3-plans: with credit packs off sale (D-067/D-042, CREDIT_PACKS_ON_SALE
// false) a seeker with no referral requests left is never pointed at the paused
// purchase page. creditPacksOffSale.test.tsx pins the same rule for the kit page.
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { goalSurfaceOn } from "@/lib/goalSurfaces";

vi.mock("@shared/planCatalog", async importOriginal => ({
  ...(await importOriginal<typeof import("@shared/planCatalog")>()),
  CREDIT_PACKS_ON_SALE: false,
}));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: () => true }));
vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token" }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <button type="button">{children ?? "Sign in"}</button>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/billing", vi.fn()],
  useSearch: () => "",
}));

const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
const summary = {
  plan: "free",
  monthlyAllowance: 0,
  monthlyCreditsRemaining: 0,
  totalAvailable: 0,
  subscriptionStatus: null,
  subscriptionCurrentTermEnd: null,
  slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null },
  ledger: {
    balance: 0,
    buckets: { cycle: 0, carriedOver: 0, trial: 0, welcome: 0, purchased: 0, promo: 0 },
    creditsPerMonth: 0,
    carryover: 0,
    cycle: { key: "2026-10", startsAt: null, endsAt: null, granted: 0, used: 0 },
    planCreditsRemaining: 0,
    nextExpiry: null,
    planCreditsExpiringSoon: null,
    welcome: { granted: false, credits: 0, remaining: 0 },
  },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Goal /billing with packs off sale", () => {
  it("points at the plans page instead of the paused purchase page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (String(url).includes("/billing/receipts") ? ok({ receipts: [] }) : ok({ summary }))));
    const GoalBilling = (await import("./GoalBilling")).default;
    render(<GoalBilling />);
    const primary = await screen.findByRole("link", { name: "See plans and prices" });
    expect(primary.getAttribute("href")).toBe("/plans");
    expect(document.querySelector('a[href^="/premium"]')).toBeNull();
    expect(goalSurfaceOn("plans")).toBe(true);
  });
});
