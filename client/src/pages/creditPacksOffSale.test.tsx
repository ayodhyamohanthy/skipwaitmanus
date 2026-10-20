// @vitest-environment jsdom
// Review round 2 (D-067, D-042): CREDIT_PACKS_ON_SALE is the switch that takes credit packs off
// sale without deleting them. With it off, no seeker surface may still offer "Add credits" and
// lead to the "Credit packs are paused." screen. creditPacksOnSale.test.tsx pins the shipped (on) state.
// GO-LIVE-1: the same switch hides the catalog's credit packs on /plans (passes keep their own switch).
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { CurrentPlanPanel } from "@/components/plans/BillingPanels";
import { UpgradeMoments, upgradeMoments } from "@/components/plans/UpgradeMoments";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Plans from "./Plans";

const openedCheckout = vi.hoisted(() => vi.fn());
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: false }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: null, getToken: async () => "test-token", openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));

// A Free account that spent its month's credits: the out-of-credits moment applies.
const spentFree = { plan: "free", subscriptionStatus: null, subscriptionCurrentTermEnd: null, totalAvailable: 0, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null }, ledger: { balance: 0, cycle: { used: 3 }, planCreditsExpiringSoon: null } } as never;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const freeSummary = { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 1, purchasedCreditsRemaining: 0, totalAvailable: 1, subscriptionStatus: null, subscriptionCurrentTermEnd: null };

/** /plans for a signed-in seeker, with a catalog that sells every pack (and the named pass terms). */
function renderPlans(terms: readonly string[] = []) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/plans/catalog")) return json(catalogFixture("INTL", { packs: true, terms }));
    if (url.startsWith("/api/credits/summary")) return json({ summary: freeSummary });
    if (url.startsWith("/api/company-referrals/mine")) return json({ requests: [] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.pushState({}, "", "/plans?role=job_seeker");
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Plans /></QueryClientProvider>);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

describe("credit packs off sale", () => {
  it("runs with the flag mocked off", () => { expect(CREDIT_PACKS_ON_SALE).toBe(false); });

  it("the out-of-credits moment offers no purchase: no Add credits link, dismiss only", () => {
    const moments = upgradeMoments(spentFree, new Date(), "/premium?role=job_seeker");
    const credits = moments.find(moment => moment.id === "credits");
    expect(credits).toBeDefined();
    expect(credits?.cta).toBeNull();
    expect(credits?.alt).toBe("dismiss");
    expect(credits?.copy).not.toMatch(/purchased|never expire|add credits/i);
    render(<UpgradeMoments moments={moments} />);
    expect(screen.getByText("You're out of credits")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    expect(document.querySelector('a[href^="/premium"]')).toBeNull();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("the Free billing panel shows no Add credits button", () => {
    render(<CurrentPlanPanel summary={spentFree} onCancel={() => undefined} />);
    expect(screen.getByRole("heading", { name: "Free" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add credits" })).toBeNull();
    expect(document.querySelector('a[href^="/premium"]')).toBeNull();
  });

  it("/plans shows no credit pack and no Buy for one, even when the catalog sells every pack", async () => {
    const fetchMock = renderPlans();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/plans/catalog"))).toBe(true));
    expect(await screen.findByText("Packs and passes go on sale soon.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Credit packs" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Buy \d+ credits$/ })).toBeNull();
    expect(document.querySelector("a[href='#credits']")).toBeNull();
    expect(screen.queryByRole("link", { name: /Add credits/ })).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
    expect(openedCheckout).not.toHaveBeenCalled();
  });

  it("/plans still lists a pass on sale (passes keep their own switch) while the packs stay hidden", async () => {
    renderPlans(["momentum:30d"]);
    const passes = await screen.findByRole("region", { name: "Passes" });
    expect(within(passes).getByRole("button", { name: "Buy Momentum, 30 days" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Credit packs" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Buy \d+ credits$/ })).toBeNull();
    expect(document.querySelector("a[href='#credits']")).toBeNull();
  });
});
