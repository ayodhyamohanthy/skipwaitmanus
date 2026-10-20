// @vitest-environment jsdom
// GO-LIVE-1 (packet §0.3 C4; §0.4 test 2): a Buy press on /plans posts the kit
// checkout body built from the one catalog response on screen, stores the
// intent for the return page and opens the hosted page; every refusal says in
// plain words that nothing was charged, and a double press sends one POST.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { REFERRER_PURCHASE_REFUSED_ERROR } from "@shared/referrerPurchases";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Plans from "./Plans";

const { openedCheckout, auth } = vi.hoisted(() => ({ openedCheckout: vi.fn(), auth: { isLoaded: true, isSignedIn: true, userId: null, getToken: vi.fn(async () => "test-token"), openSignIn: vi.fn() } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const NETWORK = "We couldn’t reach SkipWait. Check your connection and try again.";

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

describe("/plans buying (§0.4 test 2)", () => {
  it("a pack Buy posts the exact kit body, stores the intent and opens the hosted page", async () => {
    const fetchMock = serve({ summary: freeSummary, extra: url => url === "/api/chargebee/checkout" ? json({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_pack/", hostedPageId: "hp_pack" }) : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    expect(posts(fetchMock)).toEqual([]);
    fireEvent.click(within(packCard(25)).getByRole("button", { name: "Buy 25 credits" }));
    await waitFor(() => expect(openedCheckout).toHaveBeenCalledWith("https://skipwait-test.chargebee.com/pages/v3/hp_pack/"));
    const [[url, init]] = posts(fetchMock);
    expect(url).toBe("/api/chargebee/checkout");
    expect(init).toMatchObject({ method: "POST", credentials: "include", headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" } });
    expect(JSON.parse(String(init?.body))).toEqual({ packId: "pack_25", billingCountry: "INTL", role: "job_seeker" });
    expect(JSON.parse(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout") ?? "null")).toEqual({ hostedPageId: "hp_pack", role: "job_seeker" });
  });

  it("a browser that cannot store the intent still opens checkout (the webhook and reconcile still credit)", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("QuotaExceededError"); });
    try {
      serve({ summary: freeSummary, extra: url => url === "/api/chargebee/checkout" ? json({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_nostore/", hostedPageId: "hp_nostore" }) : undefined });
      render(<Plans />);
      await screen.findByRole("region", { name: "Credit packs" });
      fireEvent.click(within(packCard(25)).getByRole("button", { name: "Buy 25 credits" }));
      await waitFor(() => expect(openedCheckout).toHaveBeenCalledWith("https://skipwait-test.chargebee.com/pages/v3/hp_nostore/"));
      expect(screen.queryByRole("alert")).toBeNull();
    } finally {
      setItem.mockRestore();
    }
  });

  it("the billing country is the catalog's region: India after Different billing country?", async () => {
    const fetchMock = serve({ summary: freeSummary, extra: url => url === "/api/chargebee/checkout" ? json({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_in/", hostedPageId: "hp_in" }) : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(await screen.findByText("₹2,398")).toBeTruthy();
    expect(catalogReads(fetchMock).map(([url]) => String(url))).toEqual(["/api/plans/catalog", "/api/plans/catalog?region=IN"]);
    fireEvent.click(within(packCard(2)).getByRole("button", { name: "Buy 2 credits" }));
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    expect(JSON.parse(String(posts(fetchMock)[0][1]?.body))).toEqual({ packId: "pack_2", billingCountry: "IN", role: "job_seeker" });
  });

  it("an available plan term posts the exact kit plan body for the chosen length", async () => {
    const catalog = catalogFixture("INTL", { terms: ["momentum:30d", "momentum:90d", "keep_warm:yearly"] });
    const fetchMock = serve({ summary: freeSummary, catalog: () => json(catalog), extra: url => url === "/api/chargebee/subscription-checkout" ? json({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_pass/", hostedPageId: "hp_pass" }) : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Passes" });
    expect(within(passCard("Start")).getByText("Not on sale yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "90 days" }));
    fireEvent.click(within(passCard("Momentum")).getByRole("button", { name: "Buy Momentum, 90 days" }));
    await waitFor(() => expect(openedCheckout).toHaveBeenCalledWith("https://skipwait-test.chargebee.com/pages/v3/hp_pass/"));
    const [[url, init]] = posts(fetchMock);
    expect(url).toBe("/api/chargebee/subscription-checkout");
    expect(JSON.parse(String(init?.body))).toEqual({ planId: "momentum", interval: "90d", currency: "USD", billingCountry: "INTL", role: "job_seeker" });
    expect(JSON.parse(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout") ?? "null")).toEqual({ hostedPageId: "hp_pass", role: "job_seeker" });
    expect(within(passCard("Keep warm")).getByRole("button", { name: "Buy Keep warm, a year" })).toBeTruthy();
  });

  it("409 says not on sale, charges nothing and refreshes the catalog", async () => {
    const fetchMock = serve({ summary: freeSummary, extra: url => url === "/api/chargebee/checkout" ? json({ error: "The 25-credit pack is not on sale yet. Nothing has been charged.", code: "not_available_yet" }, 409) : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    const before = catalogReads(fetchMock).length;
    fireEvent.click(within(packCard(25)).getByRole("button", { name: "Buy 25 credits" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not on sale yet. Nothing has been charged.");
    await waitFor(() => expect(catalogReads(fetchMock).length).toBeGreaterThan(before));
    // The catalog is served public for 5 minutes: the refetch must not read the browser cache.
    expect(catalogReads(fetchMock).at(-1)?.[1]).toMatchObject({ cache: "no-cache" });
    expect(openedCheckout).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it.each([
    [503, { error: "Payments are not available right now. Please try again in a moment." }, "Payments are not available right now. Nothing has been charged."],
    // A refusal keeps the server's words and always says nothing was charged, never twice.
    [400, { error: "That credit pack is not available for this billing route" }, "That credit pack is not available for this billing route. Nothing has been charged."],
    [401, { error: "Sign in before purchasing tokens" }, "Sign in before purchasing tokens. Nothing has been charged."],
    [403, { error: REFERRER_PURCHASE_REFUSED_ERROR, code: "referrers_never_pay" }, REFERRER_PURCHASE_REFUSED_ERROR],
    // The provider leg failing (server/chargebeeRoutes.ts's real 502 bodies) reads the plain fallback.
    [502, { error: "Unable to start Chargebee checkout" }, "We couldn't start checkout. Nothing has been charged."],
    [500, { error: "Internal server error" }, "We couldn't start checkout. Nothing has been charged."],
    [502, {}, "We couldn't start checkout. Nothing has been charged."],
  ])("a %s answer shows plain words and opens nothing", async (status, body, copy) => {
    serve({ summary: freeSummary, extra: url => url === "/api/chargebee/checkout" ? json(body, status) : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    fireEvent.click(within(packCard(60)).getByRole("button", { name: "Buy 60 credits" }));
    expect((await screen.findByRole("alert")).textContent).toBe(copy);
    expect(openedCheckout).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("a pass whose provider leg fails (502) says nothing was charged and opens nothing", async () => {
    const catalog = catalogFixture("INTL", { terms: ["momentum:30d"] });
    serve({ summary: freeSummary, catalog: () => json(catalog), extra: url => url === "/api/chargebee/subscription-checkout" ? json({ error: "Unable to start the secure plan checkout" }, 502) : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Passes" });
    fireEvent.click(within(passCard("Momentum")).getByRole("button", { name: "Buy Momentum, 30 days" }));
    expect((await screen.findByRole("alert")).textContent).toBe("We couldn't start checkout. Nothing has been charged.");
    expect(openedCheckout).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("offline shows the shared network copy", async () => {
    serve({ summary: freeSummary, extra: url => { if (url === "/api/chargebee/checkout") throw new TypeError("Failed to fetch"); return undefined; } });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    fireEvent.click(within(packCard(5)).getByRole("button", { name: "Buy 5 credits" }));
    expect((await screen.findByRole("alert")).textContent).toBe(NETWORK);
    expect(openedCheckout).not.toHaveBeenCalled();
  });

  it("a double press sends one POST, and the button is disabled while sending", async () => {
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>(resolve => { release = resolve; });
    const fetchMock = serve({ summary: freeSummary, extra: url => url === "/api/chargebee/checkout" ? pending : undefined });
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    const buy = within(packCard(25)).getByRole("button", { name: "Buy 25 credits" });
    fireEvent.click(buy);
    fireEvent.click(buy);
    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    await waitFor(() => expect((within(packCard(25)).getByRole("button") as HTMLButtonElement).disabled).toBe(true));
    expect(within(packCard(25)).getByRole("button").textContent).toBe("Opening…");
    expect((within(packCard(60)).getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(packCard(25)).getByRole("button"));
    fireEvent.click(within(packCard(60)).getByRole("button", { name: "Buy 60 credits" }));
    release(json({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_once/", hostedPageId: "hp_once" }));
    await waitFor(() => expect(openedCheckout).toHaveBeenCalledTimes(1));
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("while sign-in is still loading every Buy is disabled and a press sends nothing", async () => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    const fetchMock = serve();
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    const buy = within(packCard(25)).getByRole("button", { name: "Buy 25 credits" }) as HTMLButtonElement;
    expect(buy.disabled).toBe(true);
    fireEvent.click(buy);
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(posts(fetchMock)).toEqual([]);
  });

  it("a signed-out press opens sign-in back to the same prices, with no POST and no checkout", async () => {
    auth.isSignedIn = false;
    const fetchMock = serve();
    render(<Plans />);
    await screen.findByRole("region", { name: "Credit packs" });
    fireEvent.click(within(packCard(25)).getByRole("button", { name: "Buy 25 credits" }));
    expect(auth.openSignIn).toHaveBeenCalledWith({ returnTo: "/plans?role=job_seeker&currency=USD#credits" });
    expect(posts(fetchMock)).toEqual([]);
    expect(openedCheckout).not.toHaveBeenCalled();
  });
});
