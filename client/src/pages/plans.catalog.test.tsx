// @vitest-environment jsdom
// GO-LIVE-1 (packet §0.3 C2, C3, C8, C10; §0.4 test 1): /plans sells what
// GET /api/plans/catalog says is on sale, at the server's price, in the
// catalog's one currency. The fixture doubles every catalog amount, so each
// price asserted here can only have come from the payload. Buying is pinned in
// plans.buy.test.tsx.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ASK_COST_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import type { PlanCatalogResponse } from "@shared/billingCatalog";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Plans from "./Plans";

const { openedCheckout, auth } = vi.hoisted(() => ({ openedCheckout: vi.fn(), auth: { isLoaded: true, isSignedIn: true, userId: null, getToken: vi.fn(async () => "test-token"), openSignIn: vi.fn() } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const NETWORK = "We couldn’t reach SkipWait. Check your connection and try again.";
const RETIRED = /\bPro\b|\bMax\b|\$7\b|\$15\b|₹599|₹1,299/;
const REFUND_SENTENCE = "Unused purchased credits can be refunded on request within 14 days of purchase, less any credits already consumed by accepted referrals.";

type Extra = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;
type Serve = { catalog?: (region: string | null) => Response | Promise<Response>; summary?: unknown; extra?: Extra };

function serve({ catalog = region => json(catalogFixture(region === "IN" ? "IN" : "INTL")), summary = null, extra }: Serve = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const handled = await extra?.(url, init);
    if (handled) return handled;
    if (url.startsWith("/api/plans/catalog")) return catalog(new URL(url, "https://skipwait.test").searchParams.get("region"));
    if (url.startsWith("/api/credits/summary")) return json({ summary });
    if (url.startsWith("/api/company-referrals/mine")) return json({ requests: [] });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const posts = (fetchMock: ReturnType<typeof serve>) => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
const catalogReads = (fetchMock: ReturnType<typeof serve>) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/plans/catalog"));
const packCard = (credits: number) => screen.getByRole("article", { name: `${credits} credits` });
const passCard = (name: string) => within(screen.getByRole("region", { name: "Passes" })).getByRole("article", { name });
const freeSummary = { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 1, purchasedCreditsRemaining: 0, totalAvailable: 1, subscriptionStatus: null, subscriptionCurrentTermEnd: null };

beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); openedCheckout.mockClear(); window.history.pushState({}, "", "/plans?role=job_seeker"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); window.history.pushState({}, "", "/"); });

describe("/plans renders only what the catalog sells (§0.4 test 1)", () => {
  it("asks the edge region and lists packs and passes at the payload's USD prices", async () => {
    auth.isSignedIn = false;
    const fetchMock = serve();
    render(<Plans />);
    const packs = await screen.findByRole("region", { name: "Credit packs" });
    expect(packs.id).toBe("credits");
    expect(catalogReads(fetchMock).map(([url]) => String(url))).toEqual(["/api/plans/catalog"]);
    // Every USD pack in the payload, at its payload price; no rupee pack.
    expect(within(packs).getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["5 credits", "25 credits", "60 credits", "150 credits"]);
    expect(within(packCard(5)).getByText("$10")).toBeTruthy();
    expect(within(packCard(25)).getByText("$44")).toBeTruthy();
    expect(within(packCard(60)).getByText("$96")).toBeTruthy();
    expect(within(packCard(150)).getByText("$210")).toBeTruthy();
    expect(within(packs).getAllByRole("button", { name: /^Buy \d+ credits$/ })).toHaveLength(4);
    // "Recommended" only where the catalog marks it (the 25-credit pack and Momentum), never "Most popular".
    expect(within(packCard(25)).getByText("Recommended")).toBeTruthy();
    expect(within(passCard("Momentum")).getByText("Recommended")).toBeTruthy();
    expect(screen.getAllByText("Recommended")).toHaveLength(2);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/most popular|most chosen/i);
    expect(text).not.toMatch(RETIRED);
    // No "India price" note on a USD price (the FAQ may still say India pays India prices).
    expect(packs.textContent).not.toContain("India price");
    expect(screen.getByRole("region", { name: "Passes" }).textContent).not.toContain("India price");
    expect(screen.getByText(/PayPal \(USD\) · Secure hosted checkout via Chargebee/)).toBeTruthy();
    expect(screen.getByText("$0")).toBeTruthy();
  });

  it("lists every pass with the catalog's limits, and an unavailable term reads Not on sale yet with no button", async () => {
    auth.isSignedIn = false;
    serve();
    render(<Plans />);
    const passes = await screen.findByRole("region", { name: "Passes" });
    expect(within(passes).getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["Start", "Momentum", "Land Focus", "Land Sprint", "Keep warm", "Land Concierge"]);
    const momentum = passCard("Momentum");
    expect(within(momentum).getByText("$48")).toBeTruthy();
    expect(within(momentum).getByText("for 30 days")).toBeTruthy();
    expect(within(momentum).getByText("15 referral requests open at once")).toBeTruthy();
    expect(within(momentum).getByText("36 credits every month")).toBeTruthy();
    expect(within(momentum).getByText("Unused plan credits carry over up to 3 months")).toBeTruthy();
    expect(within(passCard("Land Focus")).getByText("Unused plan credits roll over while you're subscribed")).toBeTruthy();
    // D-041: human time reads "coming later" until reviewers are staffed (humanTimeOffered false).
    expect(within(passCard("Land Focus")).getByText(/coming later/)).toBeTruthy();
    expect(within(passCard("Land Sprint")).getByText(/coming later/)).toBeTruthy();
    for (const name of ["Start", "Momentum", "Land Focus", "Land Sprint", "Keep warm"]) {
      expect(within(passCard(name)).getByText("Not on sale yet")).toBeTruthy();
      expect(within(passCard(name)).queryByRole("button")).toBeNull();
    }
    expect(within(passCard("Keep warm")).getByText("$58")).toBeTruthy();
    expect(within(passCard("Keep warm")).getByText("a year")).toBeTruthy();
    const apply = within(passCard("Land Concierge")).getByRole("link", { name: /Apply/ });
    expect(apply.getAttribute("href")).toBe("/contact?topic=concierge");
    // 30 / 90 days toggle: the 90-day term at its payload price.
    fireEvent.click(within(passes).getByRole("radio", { name: "90 days" }));
    expect(within(passCard("Start")).getByText("$38")).toBeTruthy();
    expect(within(passCard("Start")).getByText("for 90 days")).toBeTruthy();
    expect(within(passCard("Keep warm")).getByText("$58")).toBeTruthy();
    expect(within(passes).getByRole("link", { name: /refund/i }).getAttribute("href")).toBe("/refunds");
  });

  it("prices India in rupees from the payload with the India price note, when the address asks for INR", async () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR");
    const fetchMock = serve();
    render(<Plans />);
    const packs = await screen.findByRole("region", { name: "Credit packs" });
    expect(catalogReads(fetchMock).map(([url]) => String(url))).toEqual(["/api/plans/catalog?region=IN"]);
    expect(within(packs).getAllByRole("article").map(card => card.getAttribute("aria-label"))).toEqual(["2 credits", "25 credits", "60 credits", "150 credits"]);
    expect(within(packCard(2)).getByText("₹198")).toBeTruthy();
    expect(within(packCard(25)).getByText("₹2,398")).toBeTruthy();
    expect(within(packCard(25)).getByText("India price")).toBeTruthy();
    expect(within(passCard("Momentum")).getByText(/India price/)).toBeTruthy();
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.getByText("₹0")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/GST/);
  });

  it("shows an unavailable pack without a button, and one line when nothing is on sale", async () => {
    auth.isSignedIn = false;
    serve({ catalog: () => json(catalogFixture("INTL", { packs: ["pack_25"] })) });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    expect(within(packCard(5)).getByText("Not on sale yet")).toBeTruthy();
    expect(within(packCard(5)).queryByRole("button")).toBeNull();
    expect(within(packCard(25)).getByRole("button", { name: "Buy 25 credits" })).toBeTruthy();
    cleanup();

    serve({ catalog: () => json(catalogFixture("INTL", { packs: false })) });
    render(<Plans />);
    expect(await screen.findByText("Packs and passes go on sale soon.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Credit packs" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Passes" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
  });

  it("drops every single-credit price, quotes the refund page for packs and says the D-063 sentence once", async () => {
    auth.isSignedIn = false;
    serve();
    render(<Plans />);
    const packs = await screen.findByRole("region", { name: "Credit packs" });
    const main = document.querySelector("main") as HTMLElement;
    expect(main.textContent).not.toMatch(/\$1(?![\d.,])|₹99(?![\d.,])|a credit\b|each credit you buy/i);
    // C10: the heading pill reads "Add credits" before sign-in; the Free card says "Add credits anytime".
    expect(main.querySelector(".credit-cta")?.textContent).toBe("Add credits");
    expect(screen.getByText("Add credits anytime")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Credit costs" })).getAllByRole("listitem").map(item => item.textContent)).toEqual(["1 creditEach ask a verified employee can see", "NeverBought credits expire"]);
    // Ruling 4.4: the refund page's own sentence for packs, with its link.
    expect(within(packs).getByText(REFUND_SENTENCE, { exact: false })).toBeTruthy();
    expect(within(packs).getByRole("link", { name: /refund/i }).getAttribute("href")).toBe("/refunds");
    // C3: the fairness band is the one place in the page body with the D-063 sentence.
    expect(main.textContent?.split(ASK_COST_SENTENCE).length).toBe(2);
    expect(main.textContent?.split(REFERRER_MONEY_SENTENCE).length).toBe(2);
    expect(within(screen.getByRole("region", { name: "Fairness promise" })).getByText(ASK_COST_SENTENCE)).toBeTruthy();
  });

  it("Add credits goes to the packs on this page while one is on sale, otherwise to /premium", async () => {
    serve({ summary: freeSummary });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    await screen.findByText("YOUR BALANCE");
    expect(screen.getAllByRole("link", { name: /Add credits/ }).map(link => link.getAttribute("href"))).toEqual(["#credits", "#credits"]);
    cleanup();

    serve({ summary: freeSummary, catalog: () => json(catalogFixture("INTL", { packs: false })) });
    render(<Plans />);
    await screen.findByText("Packs and passes go on sale soon.");
    await screen.findByText("YOUR BALANCE");
    expect(screen.getAllByRole("link", { name: /Add credits/ }).map(link => link.getAttribute("href"))).toEqual(["/premium?role=job_seeker", "/premium?role=job_seeker"]);
  });
});

describe("/plans states (C8)", () => {
  it("shows a loading skeleton while the catalog loads, and the account still renders", async () => {
    serve({ summary: freeSummary, catalog: () => new Promise<Response>(() => undefined) });
    render(<Plans />);
    expect(await screen.findByText("Loading prices…")).toBeTruthy();
    expect(await screen.findByText("YOUR BALANCE")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
  });

  it("a failed catalog says so with Try again, keeps the account, and recovers on retry", async () => {
    let calls = 0;
    const ok: PlanCatalogResponse = catalogFixture("INTL");
    serve({ summary: freeSummary, catalog: () => { calls += 1; return calls <= 2 ? json({ error: "Prices are unavailable right now. Try again in a moment." }, 503) : json(ok); } });
    render(<Plans />);
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain("Prices are unavailable right now. Try again in a moment.");
    expect(screen.getByText("YOUR BALANCE")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Credit packs" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["answers 500", (): Response => json({ error: "We could not refresh your plan details" }, 500)],
    ["cannot be reached", (): Response => { throw new TypeError("Failed to fetch"); }],
  ])("when the account summary %s, the packs and their Buy buttons still render", async (_case, summaryAnswer) => {
    const fetchMock = serve({ extra: url => url.startsWith("/api/credits/summary") ? summaryAnswer() : undefined });
    render(<Plans />);
    const packs = await screen.findByRole("region", { name: "Credit packs" });
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/credits/summary"))).toBe(true));
    expect(within(packs).getAllByRole("button", { name: /^Buy \d+ credits$/ }).map(button => button.textContent)).toEqual(["Buy", "Buy", "Buy", "Buy"]);
    expect(within(packs).getAllByRole("button", { name: /^Buy \d+ credits$/ }).every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("YOUR BALANCE")).toBeNull();
  });

  it("Different billing country? keeps its line while the other region's prices load, and asks for nothing", async () => {
    const fetchMock = serve({ catalog: region => region === "IN" ? new Promise<Response>(() => undefined) : json(catalogFixture("INTL")) });
    auth.isSignedIn = false;
    render(<Plans />);
    expect(await screen.findByText("$44")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(await screen.findByText("Loading prices…")).toBeTruthy();
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.queryByText("$44")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Buy/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use international payment/i }));
    expect(await screen.findByText("$44")).toBeTruthy();
    expect(posts(fetchMock)).toEqual([]);
  });

  it("offline reads the shared network copy", async () => {
    serve({ catalog: () => { throw new TypeError("Failed to fetch"); } });
    auth.isSignedIn = false;
    render(<Plans />);
    expect((await screen.findByRole("alert", {}, { timeout: 4000 })).textContent).toContain(NETWORK);
  });
});
