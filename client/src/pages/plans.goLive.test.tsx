// @vitest-environment jsdom
// GO-LIVE-1: /plans sells credit packs and 30/90-day passes + Keep warm from the
// live catalog; the single credit retires per currency; the coverage block shows
// where the seeker's asks stand. Catalog payloads here are valid
// planCatalogResponseSchema bodies with every item price marked available.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Plans from "./Plans";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
const checkout = vi.hoisted(() => ({ openChargebeeCheckout: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => checkout);
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "INR" as const }));

beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); checkout.openChargebeeCheckout.mockClear(); window.sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

const amount = (minor: number) => minor;
const catalogPayload = (packsAvailable: Record<string, boolean> = {}, passesAvailable = true) => ({
  region: "IN", currency: "INR", priceNote: null,
  free: { openRequests: 2, creditsPerMonth: 2 },
  plans: [
    { id: "keep_warm", tier: "keep_warm", level: 1, label: "Keep warm", levelLabel: null, displayName: "Keep warm", openRequests: 5, creditsPerMonth: 4, carryover: 1, humanTime: { writtenReviews: 0, liveSessions: 0, hours: 0 }, humanTimeOffered: true, byApplication: false, recommended: false, terms: [{ interval: "yearly", days: null, amount: amount(99900), available: passesAvailable, autoExtend: [] }] },
    { id: "start", tier: "start", level: 2, label: "Start", levelLabel: null, displayName: "Start", openRequests: 5, creditsPerMonth: 12, carryover: 1, humanTime: { writtenReviews: 0, liveSessions: 0, hours: 0 }, humanTimeOffered: true, byApplication: false, recommended: false, terms: [{ interval: "30d", days: 30, amount: amount(49900), available: passesAvailable, autoExtend: [] }, { interval: "90d", days: 90, amount: amount(129900), available: passesAvailable, autoExtend: [] }] },
    { id: "momentum", tier: "momentum", level: 3, label: "Momentum", levelLabel: null, displayName: "Momentum", openRequests: 15, creditsPerMonth: 40, carryover: 3, humanTime: { writtenReviews: 0, liveSessions: 0, hours: 0 }, humanTimeOffered: true, byApplication: false, recommended: true, terms: [{ interval: "30d", days: 30, amount: amount(99900), available: passesAvailable, autoExtend: [] }, { interval: "90d", days: 90, amount: amount(249900), available: passesAvailable, autoExtend: [] }] },
    { id: "land_concierge", tier: "land", level: 5, label: "Land", levelLabel: "Concierge", displayName: "Land Concierge", openRequests: 75, creditsPerMonth: 200, carryover: "subscribed", humanTime: { writtenReviews: 8, liveSessions: 4, hours: 6 }, humanTimeOffered: true, byApplication: true, recommended: false, terms: [{ interval: "30d", days: 30, amount: amount(499900), available: false, autoExtend: [] }] },
  ],
  packs: [
    { id: "pack_2", credits: 2, amount: amount(9900), available: packsAvailable["pack_2"] ?? true, firstPack: true, recommended: false },
    { id: "pack_25", credits: 25, amount: amount(119900), available: packsAvailable["pack_25"] ?? true, firstPack: false, recommended: true },
  ],
  sessions: [], creditCosts: [],
  fairness: { maxOpenAsksPerCompany: 2, planVisibleToReferrers: false },
});

function stubFetch(options: { catalog?: unknown; mine?: unknown; companies?: unknown; checkout?: { status?: number; body?: unknown } } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const path = String(url);
    if (path.startsWith("/api/plans/catalog")) return { ok: true, status: 200, json: async () => options.catalog ?? catalogPayload() } as Response;
    if (path.startsWith("/api/company-referrals/mine")) return { ok: true, status: 200, json: async () => options.mine ?? { requests: [] } } as Response;
    if (path.startsWith("/api/companies")) return { ok: true, status: 200, json: async () => options.companies ?? { companies: [], openCount: 0 } } as Response;
    if (path.startsWith("/api/credits/summary")) return { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 3, plan: "free" } }) } as Response;
    if (path.startsWith("/api/chargebee/checkout") || path.startsWith("/api/chargebee/subscription-checkout")) {
      const status = options.checkout?.status ?? 200;
      return { ok: status < 400, status, json: async () => options.checkout?.body ?? { checkoutUrl: "https://chargebee.test/hp_9", hostedPageId: "hp_9" } } as Response;
    }
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderPlans() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Plans /></QueryClientProvider>);
}

describe("/plans sells credit packs from the live catalog", () => {
  it("renders pack cards with live prices and buys the 25-credit pack", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR");
    const calls = stubFetch();
    renderPlans();
    expect(await screen.findByText("25 credits")).toBeTruthy();
    expect(screen.getByText("₹1,199")).toBeTruthy();
    expect(screen.getAllByText("₹99").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Buy pack" }));
    await waitFor(() => expect(checkout.openChargebeeCheckout).toHaveBeenCalledWith("https://chargebee.test/hp_9"));
    const buy = calls.find(call => call.url === "/api/chargebee/checkout");
    expect(JSON.parse(String(buy?.init?.body))).toEqual({ packId: "pack_25", billingCountry: "IN", role: "job_seeker" });
  });

  it("disables a pack after a 409 and shows the server's sentence", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR");
    stubFetch({ checkout: { status: 409, body: { error: "The 25-credit pack is not on sale yet. Nothing has been charged.", code: "not_available_yet" } } });
    renderPlans();
    fireEvent.click(await screen.findByRole("button", { name: "Buy pack" }));
    expect(await screen.findByText("The 25-credit pack is not on sale yet. Nothing has been charged.")).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Not on sale yet" }).length).toBeGreaterThan(0));
    expect(checkout.openChargebeeCheckout).not.toHaveBeenCalled();
  });
});

describe("/plans sells passes and Keep warm", () => {
  it("shows the 30-day price by default, switches to 90 days, and buys the pass", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR");
    const calls = stubFetch();
    renderPlans();
    expect(await screen.findByText("Momentum")).toBeTruthy();
    expect(screen.getAllByText("for 30 days").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(await screen.findByText("₹2,499")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get Momentum" }));
    await waitFor(() => expect(checkout.openChargebeeCheckout).toHaveBeenCalledWith("https://chargebee.test/hp_9"));
    const buy = calls.find(call => call.url === "/api/chargebee/subscription-checkout");
    expect(JSON.parse(String(buy?.init?.body))).toEqual({ planId: "momentum", interval: "90d", currency: "INR", billingCountry: "IN", role: "job_seeker" });
  });

  it("nothing unsold is rendered while the flag is off (D-095 item 5)", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR");
    stubFetch({ catalog: catalogPayload({}, false) });
    renderPlans();
    expect(await screen.findByText("25 credits")).toBeTruthy();
    expect(screen.queryAllByRole("button", { name: /not on sale yet/i })).toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Keep warm" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Momentum" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Start" })).toBeNull();
    expect(screen.queryByText(/PASSES & YEARLY/i)).toBeNull();
  });

  it("keeps Keep warm yearly listed regardless of the toggle, and Concierge is by application", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR");
    stubFetch();
    renderPlans();
    expect(await screen.findByText("Keep warm")).toBeTruthy();
    expect(screen.getByText("a year")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    expect(screen.getByText("a year")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Request application/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Get Land Concierge/ })).toBeNull();
  });
});

describe("coverage block", () => {
  it("shows waiting, held and covered asks from the seeker's own asks and the directory", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker");
    stubFetch({
      mine: { requests: [
        { id: 1, companyDomain: "acme.com", companyName: "Acme", status: "pending", queueStatus: "waiting_for_coverage" },
        { id: 2, companyDomain: "globex.com", companyName: "Globex", status: "pending", queueStatus: "held_for_credit" },
        { id: 3, companyDomain: "initech.com", companyName: "Initech", status: "pending", queueStatus: "available_for_review" },
      ] },
      companies: { companies: [
        { slug: "acme", name: "Acme", initials: "AC", industry: "Tech", location: "Bengaluru", functions: [], blurb: "", domains: ["acme.com"], openToReferrals: false },
        { slug: "initech", name: "Initech", initials: "IN", industry: "Tech", location: "Bengaluru", functions: [], blurb: "", domains: ["initech.com"], openToReferrals: true },
      ], openCount: 1 },
    });
    renderPlans();
    expect(await screen.findByText(/Where your asks stand/)).toBeTruthy();
    expect(screen.getAllByText("Waits at no cost until a verified employee is available.").length).toBeGreaterThan(0);
    expect(screen.getByText("On hold until you add a credit.")).toBeTruthy();
    expect(screen.getByText("A verified employee can see this ask.")).toBeTruthy();
  });
});
