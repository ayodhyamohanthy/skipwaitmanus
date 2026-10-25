// @vitest-environment jsdom
// /plans on live data: the Free plan and the account's own active plan, usage and
// upgrade moments only from the account's own summary, active-plan cancel
// renewal, the checkout return states, and no Pro, Max, gift or plan checkout
// (D-067 removed them; the D-046 passes go on sale here in their own slice).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CreditsLedger } from "@shared/creditLedger";
import { FREE_ASKS_CHIP } from "@shared/moneyCopy";
import { planCatalogResponse } from "@shared/billingCatalog";
import { creditFrom } from "@/components/plans/planCatalog";
import Plans from "./Plans";

// GO-LIVE-1: /plans reads the live catalog through React Query, so tests wrap a client.
function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

const { openedCheckout, authState, getToken } = vi.hoisted(() => ({ openedCheckout: vi.fn(), authState: { isSignedIn: true }, getToken: vi.fn(async () => "test-token") }));
// Packs-on-sale paths: the flag is mocked on here; creditPacksOnSale.test.tsx pins the shipped (on) state and creditPacksOffSale.test.tsx the switched-off path.
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken, openSignIn: vi.fn() }) }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));

type Handler = (url: string, init?: RequestInit) => { ok: boolean; status?: number; json: () => Promise<unknown> } | undefined;
const ok = (json: unknown) => ({ ok: true, json: async () => json });
// Summaries as GET /api/credits/summary sends them: the ledger block and the caller's open-ask slots.
const ledger = (patch: Partial<CreditsLedger> = {}): CreditsLedger => ({ balance: 0, buckets: { cycle: 0, carriedOver: 0, trial: 0, welcome: 0, purchased: 0, promo: 0 }, creditsPerMonth: 0, carryover: 0, cycle: { key: "2026-10", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-01T00:00:00.000Z", granted: 0, used: 0 }, planCreditsRemaining: 0, nextExpiry: null, planCreditsExpiringSoon: null, welcome: { granted: false, credits: 0, remaining: 0 }, ...patch });
// The live server names no next plan until a pass is on sale (shared/openAskSlots.ts SLOT_NUDGE_SELLABLE_PLAN_IDS).
const slots = (open: number, cap = 3, plan = "free", planLabel = "Free") => ({ plan, planLabel, open, cap, full: open >= cap, nextPlan: null });
const free = ({ open = 0, used = 0, purchased = 0 } = {}) => ({ plan: "free", monthlyAllowance: 0, monthlyCreditsRemaining: 0, purchasedCreditsRemaining: purchased, totalAvailable: purchased, subscriptionStatus: null, subscriptionCurrentTermEnd: null, slots: slots(open), ledger: ledger({ balance: purchased, buckets: { cycle: 0, carriedOver: 0, trial: 0, welcome: 0, purchased, promo: 0 }, cycle: { key: "2026-10", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-11-01T00:00:00.000Z", granted: 0, used } }) });
// A 30-day Start pass (shared/planCatalog.ts: 8 open asks, 10 credits a cycle, 1 month of carryover).
const start = { plan: "start", monthlyAllowance: 10, monthlyCreditsRemaining: 7, purchasedCreditsRemaining: 2, totalAvailable: 9, subscriptionStatus: "active", subscriptionCurrentTermEnd: "2026-11-06T00:00:00.000Z", slots: slots(2, 8, "start", "Start"), ledger: ledger({ balance: 9, buckets: { cycle: 7, carriedOver: 0, trial: 0, welcome: 0, purchased: 2, promo: 0 }, creditsPerMonth: 10, carryover: 1, cycle: { key: "2026-10", startsAt: "2026-10-06T00:00:00.000Z", endsAt: "2026-11-06T00:00:00.000Z", granted: 10, used: 3 }, planCreditsRemaining: 7, nextExpiry: { credits: 7, expiresAt: "2026-12-06T00:00:00.000Z" } }) };
const RETIRED = /\bPro\b|\bMax\b|\$7\b|\$15\b|₹599|₹1,299/;
const PLAN_PURCHASE = /upgrade|see pro|see max|gift|pay \$|pay ₹|checkout/i;

function stub(summary: unknown, extra?: Handler) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const handled = extra?.(String(url), init);
    if (handled) return handled;
    if (String(url).includes("/api/credits/summary")) return ok({ summary });
    return ok({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// GO-LIVE-1: the page also reads the public live catalog; never a checkout POST.
const ACCOUNT_GETS = ["/api/credits/summary", "/api/plans/catalog", "/api/company-referrals/mine", "/api/companies"];
const onlySummaryReads = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.every(([url, init]) => ACCOUNT_GETS.some(path => String(url).startsWith(path)) && (init?.method ?? "GET") === "GET");

beforeEach(() => { authState.isSignedIn = true; window.history.pushState({}, "", "/plans?role=job_seeker"); openedCheckout.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

describe("Plans on live data", () => {
  it("renders the Free plan and the credit price, with no Pro, Max, gift, compare table or plan checkout", async () => {
    authState.isSignedIn = false;
    const fetchMock = stub(null);
    render(<Plans />);
    expect(screen.getByRole("heading", { name: "Choose how much help you need." })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Free", level: 2 })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).not.toEqual(expect.arrayContaining(["Pro", "Max"]));
    // Signed out: the price of a credit, never a balance or a welcome offer that is not live yet.
    expect(screen.getByText("Credits")).toBeTruthy();
    expect(screen.getByText("PAY AS YOU GO")).toBeTruthy();
    expect(screen.getByText("3 referral requests open at once")).toBeTruthy();
    // Review round 2 (D-063): the credit cost strip never calls a referral request free.
    const costs = screen.getByRole("list", { name: "Credit costs" });
    expect(within(costs).getAllByRole("listitem").map(item => item.textContent)).toEqual(["1 creditEach ask a verified employee can see", "PacksEach credit you buy", "NeverBought credits expire"]);
    // The canonical free-allowance sentence (D-127 copy) is allowed; the guard
    // still bans any OTHER "free credits" framing (paid credits are never free).
    const text = (document.body.textContent ?? "").split(FREE_ASKS_CHIP).join("");
    expect(text).not.toMatch(RETIRED);
    for (const banned of ["DESIGN PREVIEW", "EXAMPLE PRICING", "PREVIEW DATA", "Most chosen", "Momentum", "Land", "Yearly", "2 mo free", "checkout preview", "YOUR BALANCE", "free credits", "every month are free", "One private referral request", "Compare every individual plan", "monthly credits", "Your plan"]) expect(text).not.toContain(banned);
    expect(screen.queryAllByRole("button").filter(button => PLAN_PURCHASE.test(button.textContent ?? ""))).toEqual([]);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByLabelText("Your usage this cycle")).toBeNull();
    expect(screen.queryByText("Upgrade moments")).toBeNull();
    // Signed out reads only the public catalog (no prices of its own, no account data).
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/plans/catalog"))).toBe(true);
  });

  // POSTMERGE-oct22 P2 (#478): the page must render the live catalog's per-credit range. The tests above
  // only pin the no-catalog fallback ("Credits" / "Packs"), so a missing or wrong live price passed them.
  it("renders the live catalog's per-credit range for USD and INR, never the fallback", async () => {
    for (const region of ["INTL", "IN"] as const) {
      authState.isSignedIn = false;
      const catalog = planCatalogResponse({ region, available: () => true, usdRecurringConfirmed: true, sessionsStaffed: true, indiaGstRegistered: false });
      const range = creditFrom(catalog);
      expect(range).toBeTruthy();
      stub(null, url => (url.includes("/api/plans/catalog") ? ok(catalog) : undefined));
      render(<Plans />);
      // The price badge carries the catalog range, not the generic word.
      expect(await screen.findByText(`${range} a credit`)).toBeTruthy();
      // The credit-cost strip's pack row carries it too.
      const costs = screen.getByRole("list", { name: "Credit costs" });
      expect(within(costs).getAllByRole("listitem").map(item => item.textContent)).toContain(`${range}Each credit you buy`);
      expect(screen.queryByText("Credits")).toBeNull();
      expect(screen.queryByText("Packs of credits")).toBeNull();
      cleanup();
    }
  });

  it("shows the account's own usage and only the upgrade moments it has really hit", async () => {
    const fetchMock = stub(free({ open: 3, used: 2 }));
    render(<Plans />);
    expect(await screen.findByText("3 of 3")).toBeTruthy();
    expect(screen.getByText("2 of 2")).toBeTruthy();
    expect(screen.getByRole("meter", { name: "Open referral slots used" }).getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByRole("meter", { name: "Plan credits expiring" }).getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByText("0 credits")).toBeTruthy();
    expect(screen.getByText("Upgrade moments")).toBeTruthy();
    // No plan is on sale, so the slots moment names none: it says how a slot frees and points at the asks.
    const slotsMoment = screen.getByText("Your 3 requests are all open").closest("article") as HTMLElement;
    expect(within(slotsMoment).getByText("Wait for an answer to free a slot. Queue position stays equal either way.")).toBeTruthy();
    expect(within(slotsMoment).getByRole("link", { name: "View my requests" }).getAttribute("href")).toBe("/requests");
    const creditsMoment = screen.getByText("You're out of credits").closest("article") as HTMLElement;
    expect(within(creditsMoment).getByRole("link", { name: "Add credits" }).getAttribute("href")).toBe("/premium?role=job_seeker");
    expect(within(creditsMoment).queryByRole("link", { name: /Compare plans/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I'll wait" }));
    expect(screen.queryByText("Your 3 requests are all open")).toBeNull();
    expect(screen.getAllByRole("link", { name: "Add credits" }).every(link => link.getAttribute("href") === "/premium?role=job_seeker")).toBe(true);
    expect(document.body.textContent).not.toMatch(RETIRED);
    expect(screen.queryAllByRole("button").filter(button => PLAN_PURCHASE.test(button.textContent ?? ""))).toEqual([]);
    expect(onlySummaryReads(fetchMock)).toBe(true);
    cleanup();

    // Slots free and no credits ever spent: no limit was hit, so no moments.
    stub(free({ open: 1 }));
    render(<Plans />);
    expect(await screen.findByText("1 of 3")).toBeTruthy();
    expect(screen.queryByText("Upgrade moments")).toBeNull();
    cleanup();

    // Plan credits rolling off within 7 days: the expiry moment and the usage card, from the ledger.
    const expiresAt = new Date(Date.now() + 6.5 * 86_400_000).toISOString();
    stub({ ...start, ledger: { ...start.ledger, planCreditsExpiringSoon: { credits: 4, expiresAt } } });
    render(<Plans />);
    const expiring = (await screen.findByText("4 credits expire in 7 days")).closest("article") as HTMLElement;
    expect(within(expiring).getByRole("link", { name: "Ask for a referral" }).getAttribute("href")).toBe("/ask");
    expect(screen.getByRole("meter", { name: "Plan credits expiring" }).getAttribute("aria-valuenow")).toBe("57");
    expect(screen.queryByText("You're out of credits")).toBeNull();
  });

  it("marks the account's active plan from the summary, with its enforced limits, its end date and the renewal control (QA #359)", async () => {
    const fetchMock = stub(start, url => url.includes("/subscription-cancel") ? ok({ currentTermEnd: "2026-11-06T00:00:00.000Z" }) : undefined);
    render(<Plans />);
    const card = (await screen.findByRole("heading", { name: "Start", level: 2 })).closest("article") as HTMLElement;
    expect(card.className).toContain("featured");
    expect(within(card).getByText("Your plan")).toBeTruthy();
    expect(within(card).getByText("Your plan is active")).toBeTruthy();
    expect(within(card).getByText("Ends 6 Nov 2026 — your allowance stays until then.")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Cancel renewal" })).toBeTruthy();
    expect(within(card).getByText("8 referral requests open at once")).toBeTruthy();
    expect(within(card).getByText("10 credits every month")).toBeTruthy();
    expect(within(card).getByText("Unused plan credits carry over 1 month")).toBeTruthy();
    // Review round 2: the summary carries no term or currency, so the card names no price.
    expect(card.querySelector(".plan-price")).toBeNull();
    expect(within(card).queryByText("for 30 days")).toBeNull();
    expect(screen.getByRole("link", { name: "Manage plan" }).getAttribute("href")).toBe("/billing");
    expect(screen.queryByRole("button", { name: /Upgrade to/ })).toBeNull();
    expect(screen.getByText("9 credits")).toBeTruthy();
    expect(screen.getByText("3 of 12")).toBeTruthy();
    expect(screen.getByText(/Your plan adds 10 each cycle\./)).toBeTruthy();
    // QA review (#359 finding 1): the cancel-renewal walk-through is restored under
    // the card's live labels, so a broken confirm fails here.
    fireEvent.click(within(card).getByRole("button", { name: "Cancel renewal" }));
    fireEvent.click(within(card).getByRole("button", { name: "Yes, cancel renewal" }));
    expect(await screen.findByText("Renewal is off")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-cancel", expect.objectContaining({ method: "POST" }));
    expect(openedCheckout).not.toHaveBeenCalled();
  });

  // Review round 2: a cancel request that never reaches skipwait.me shows the plain network
  // message, never the browser's raw "Failed to fetch". Restored under the live labels (QA #359 finding 1).
  it("says plainly when cancel renewal cannot reach skipwait.me", async () => {
    stub(start, url => { if (url.includes("/subscription-cancel")) throw new TypeError("Failed to fetch"); return undefined; });
    render(<Plans />);
    const card = (await screen.findByRole("heading", { name: "Start", level: 2 })).closest("article") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "Cancel renewal" }));
    fireEvent.click(within(card).getByRole("button", { name: "Yes, cancel renewal" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn’t reach skipwait.me. Check your connection and try again.");
    expect(within(card).getByText("Your plan is active")).toBeTruthy();
  });

  it("reads a stale Pro or Max summary as Free: no plan card, no cancel, no retired name", async () => {
    for (const plan of ["pro", "max"]) {
      stub({ ...start, plan, slots: null });
      render(<Plans />);
      expect(await screen.findByText("9 credits")).toBeTruthy();
      expect(screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent)).not.toEqual(expect.arrayContaining(["Pro", "Max", "Start"]));
      expect(screen.queryByText("Your plan")).toBeNull();
      expect(screen.queryByRole("button", { name: "Cancel renewal" })).toBeNull();
      expect(document.body.textContent).not.toMatch(RETIRED);
      cleanup();
    }
  });

  it("drops the retired gift states: no gift notice, no gift load", async () => {
    for (const gift of ["done", "cancelled"]) {
      window.history.pushState({}, "", `/plans?role=job_seeker&gift=${gift}`);
      const fetchMock = stub(free());
      render(<Plans />);
      expect(await screen.findByText("0 of 3")).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/gift/i);
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/chargebee/gifts"))).toBe(false);
      cleanup();
    }
  });

  it("shows the payment-pending return without plan cards, in words that fit a pack or a pass", () => {
    window.history.pushState({}, "", "/plans?payment=pending");
    stub(free());
    render(<Plans />);
    expect(screen.getByRole("heading", { name: "We’re confirming your payment." })).toBeTruthy();
    expect(screen.getByText("Access starts only after the verified payment event reaches our server.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /View my requests/ }).getAttribute("href")).toBe("/requests");
    expect(screen.queryByText("Choose how much help you need")).toBeNull();
    expect(document.body.textContent).not.toContain("monthly credits");
  });

  it("says a cancelled checkout charged nothing, then shows the page", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&payment=cancelled");
    stub(free());
    render(<Plans />);
    expect(screen.getByRole("status").textContent).toBe("Checkout was cancelled. Nothing was charged.");
    expect(screen.getByRole("heading", { name: "Choose how much help you need." })).toBeTruthy();
    expect(await screen.findByText("0 of 3")).toBeTruthy();
  });
});

describe("Plans free-credits card check (D-079 superseded by D-127)", () => {
  it("D-127: a locked free seeker no longer sees a Validate-your-card gate - card validation moved to first purchase", async () => {
    stub({ ...free(), freeCreditsLocked: true, cardValidated: false, cycleKey: "2026-10" });
    render(<Plans />);
    await screen.findByText("YOUR BALANCE");
    expect(screen.queryByRole("button", { name: /Validate your card/ })).toBeNull();
    expect(screen.queryByText(/Validate your card to unlock/)).toBeNull();
  });

  it("an unlocked free seeker does not see the validate CTA", async () => {
    stub(free());
    render(<Plans />);
    await screen.findByText("YOUR BALANCE");
    expect(screen.queryByRole("button", { name: /Validate your card/ })).toBeNull();
  });
});
