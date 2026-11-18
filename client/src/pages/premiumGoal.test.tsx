// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Premium from "./Premium";
// Load the lazy page graph before DOM waits; the tests still render the real switch.
import GoalPremium from "./goal/premium/GoalPremium";
import { assertGoalPage } from "@/test/goalPageContract";
import type { Mock } from "vitest";
import type * as PlanCatalog from "@shared/planCatalog";


const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, userId: "seeker-a", getToken: vi.fn(async () => "session-token"), openSignIn: vi.fn() }));
const flags = vi.hoisted(() => ({ sales: false, oneTap: false }));
const catalog = vi.hoisted(() => ({ data: { packs: [{ available: false }] }, isPending: false, isError: false, refetch: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/goalSurfaces", () => ({ goalSurfaceOn: () => true }));
vi.mock("@shared/planCatalog", async original => ({ ...(await original<typeof PlanCatalog>()), get CREDIT_PACKS_ON_SALE() { return flags.sales; } }));
vi.mock("@/lib/oneTap", () => ({ get ONE_TAP_PAY_SIGNIN() { return flags.oneTap; } }));
vi.mock("@/components/plans/plansCatalogApi", () => ({ usePlansCatalog: () => catalog }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureClientError: vi.fn() }));
const summary = { totalAvailable: 8, ledger: { buckets: { purchased: 5 } }, promoCreditsRemaining: 2, promoExpiresAt: null, promoStatus: null, promoOfferActive: false };
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
let request: Mock<(url: string, options?: RequestInit) => Promise<Response>>;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><Premium /></QueryClientProvider>) };
}
beforeEach(() => {
  auth.isLoaded = true; auth.isSignedIn = true; auth.userId = "seeker-a"; auth.openSignIn.mockClear();
  // A stalled-token test installs its own implementation; every other test starts from a working one.
  auth.getToken.mockReset().mockResolvedValue("session-token");
  flags.sales = false; flags.oneTap = false;
  catalog.data = { packs: [{ available: false }] }; catalog.isPending = false; catalog.isError = false;
  window.history.replaceState({}, "", "/premium?role=job_seeker&currency=USD&quantity=10");
  request = vi.fn(async (_url: string, _options?: RequestInit) => json({ summary })); vi.stubGlobal("fetch", request);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); window.sessionStorage.clear(); });

describe("goal premium purchase parity", () => {
  it("shows the paused state in the goal frame without any payable action", async () => {
    const view = mount();
    await screen.findByText("Extra referral requests are paused.");
    assertGoalPage(view.container, { goalLine: "Get more referral requests." });
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay/i })).toBeNull();
    expect(screen.getByRole("link", { name: "Contact Support" }).getAttribute("href")).toBe("/support");
    expect(document.body.textContent).not.toMatch(/\bcredits?\b|\basks\b/i);
    expect(request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("never presents a purchase to referrers", async () => {
    flags.sales = true; window.history.replaceState({}, "", "/premium?role=referrer");
    mount(); await screen.findByText("Referrers never pay on skipwait.me.");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(document.querySelector("a[href^='/plans']")).toBeNull();
    expect(request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it("routes a retired single purchase to the existing packs page", async () => {
    flags.sales = true; catalog.data = { packs: [{ available: true }] };
    mount();
    expect((await screen.findByRole("link", { name: "See referral packs" })).getAttribute("href")).toBe("/plans#packs");
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it.each([["USD", 1, "$1 USD"], ["USD", 10, "$10 USD"], ["INR", 1, "₹99 INR"], ["INR", 10, "₹990 INR"]])("keeps the selected total for %s quantity %s", async (currency, quantity, total) => {
    flags.sales = true; window.history.replaceState({}, "", `/premium?currency=${currency}&quantity=${quantity}`);
    const view = mount();
    expect(await screen.findByText(`Pay ${total}`)).toBeTruthy();
    expect(screen.getByRole("button", { name: `Continue to pay ${total}` })).toBeTruthy();
    expect(screen.getByRole("contentinfo").textContent).toContain(total);
    assertGoalPage(view.container, { goalLine: "Get more referral requests." });
  });

  it("keeps currency, quantity and source through sign-in without starting checkout", async () => {
    flags.sales = true; auth.isSignedIn = false;
    window.history.replaceState({}, "", "/premium?currency=USD&source=balance");
    mount(); fireEvent.change(await screen.findByRole("spinbutton"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /Different billing country/ }));
    fireEvent.click(screen.getByRole("button", { name: "Sign in to pay ₹693 INR" }));
    const destination = new URL(auth.openSignIn.mock.calls[0][0].returnTo, window.location.origin);
    expect(Object.fromEntries(destination.searchParams)).toEqual({ currency: "INR", source: "balance", role: "job_seeker", quantity: "7" });
    expect(request).not.toHaveBeenCalled();
  });

  it("waits for auth and sends the unchanged checkout body once on repeated clicks", async () => {
    flags.sales = true; auth.isLoaded = false;
    const view = mount();
    const loading = await screen.findByRole("button", { name: "Checking sign-in…" });
    fireEvent.click(loading); expect(request).not.toHaveBeenCalled();
    auth.isLoaded = true; view.rerender(<QueryClientProvider client={view.client}><Premium /></QueryClientProvider>);
    const button = await screen.findByRole("button", { name: "Continue to pay $10 USD" });
    const checkoutReply = Promise.withResolvers<Response>();
    request.mockImplementation(async (url: string) => url.includes("/checkout") ? checkoutReply.promise : json({ summary }));
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(request.mock.calls.filter(([url]) => url === "/api/chargebee/checkout")).toHaveLength(1));
    const checkout = request.mock.calls.find(([url]) => url === "/api/chargebee/checkout");
    expect(JSON.parse(String(checkout?.[1]?.body))).toEqual({ itemPriceId: "skipwait_token_1-USD", billingCountry: "INTL", role: "job_seeker", quantity: 10 });
    expect(checkout?.[1]?.credentials).toBe("include");
    await act(async () => checkoutReply.resolve(json({ error: "Unavailable" }, 503)));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("does not invent a zero balance after malformed or failed responses", async () => {
    flags.sales = true; request.mockResolvedValue(json({ summary: { totalAvailable: "8" } }));
    mount(); await screen.findByText("Your balance did not load.");
    expect(screen.queryByText(/0 referral requests left/)).toBeNull();
    request.mockResolvedValue(json({ summary })); fireEvent.click(screen.getByRole("button", { name: "Retry balance" }));
    expect(await screen.findByText("8", { selector: "[data-testid='goal-num']" })).toBeTruthy();
  });

  it("keeps checkout unavailable during a catalog failure", async () => {
    flags.sales = true; catalog.isError = true;
    mount(); await screen.findByText("Live prices did not load.");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay/i })).toBeNull();
    expect(request.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  });

  it.each([true, false])("shows the existing first-payment offer only when the server enables it (%s)", async enabled => {
    flags.sales = true;
    request.mockResolvedValue(json({ summary: { ...summary, promoCreditsRemaining: 0, promoStatus: null, promoOfferActive: enabled } }));
    mount(); await screen.findByText("8", { selector: "[data-testid='goal-num']" });
    expect(Boolean(screen.queryByText(/First verified payment earns/))).toBe(enabled);
    if (enabled) expect(screen.getByText(/First verified payment earns/).textContent).toBe("First verified payment earns 5 bonus referral requests. They expire after 30 days and are used before your monthly allowance.");
  });

  it("keeps checkout locked after a successful navigation request", async () => {
    flags.sales = true;
    request.mockImplementation(async (url: string) => url === "/api/chargebee/checkout"
      ? json({ checkoutUrl: "https://checkout.example.test/hosted", hostedPageId: "hp-first" })
      : json({ summary }));
    mount();
    const button = await screen.findByRole("button", { name: "Continue to pay $10 USD" });
    fireEvent.click(button);
    await waitFor(() => expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBe(JSON.stringify({ hostedPageId: "hp-first", role: "job_seeker" })));
    // The navigation helper is mocked: settlement leaves the old document interactive.
    const settled = Promise.withResolvers<void>();
    window.setTimeout(settled.resolve, 0);
    await act(async () => { await settled.promise; });
    fireEvent.click(button); fireEvent.click(button);
    const repeated = Promise.withResolvers<void>();
    window.setTimeout(repeated.resolve, 0);
    await act(async () => { await repeated.promise; });
    expect(request.mock.calls.filter(([url]) => url === "/api/chargebee/checkout")).toHaveLength(1);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBe(JSON.stringify({ hostedPageId: "hp-first", role: "job_seeker" }));
  });
});

describe("goal premium payment return", () => {
  function pending(role = "job_seeker") {
    window.history.replaceState({}, "", `/premium?role=${role}&payment=pending&tokenCount=999&status=credited`);
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp-synthetic", role }));
  }
  it.each(["job_seeker", "referrer"])("recovers an already-started %s payment while sales are paused", async role => {
    pending(role); request.mockImplementation(async (url: string) => url.includes("credit-recovery") ? json({ status: "credited", tokenCount: 5, summary }) : json({ summary }));
    mount();
    expect(await screen.findByText("5 referral requests are ready.")).toBeTruthy();
    const calls = request.mock.calls.filter(([url]) => url.includes("credit-recovery"));
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({ hostedPageId: "hp-synthetic", role });
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
    expect(request.mock.calls.some(([url]) => url === "/api/chargebee/checkout")).toBe(false);
    expect(document.body.textContent).not.toContain("999");
  });

  it.each([400, 403, 409, 503])("never confirms a credited-looking non-success response (%s)", async status => {
    pending(); request.mockResolvedValue(json({ status: "credited", tokenCount: 5, summary }, status));
    mount(); await screen.findByText("We could not confirm this payment.");
    expect(screen.queryByText("5 referral requests are ready.")).toBeNull();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
  });

  it("shows review distinctly and never offers to pay again", async () => {
    pending(); request.mockResolvedValue(json({ status: "requires_review" }));
    mount(); await screen.findByText("This payment needs a review.");
    expect(screen.queryByRole("button", { name: /pay/i })).toBeNull();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
  });

  it("does not recover a stored checkout belonging to another role", async () => {
    pending("referrer"); window.history.replaceState({}, "", "/premium?payment=pending&role=job_seeker");
    mount(); await screen.findByText("This browser has no matching checkout to confirm.");
    expect(request.mock.calls.some(([url]) => url.includes("credit-recovery"))).toBe(false);
  });

  it("ignores an old account's late recovery after switching accounts", async () => {
    pending(); const oldReply = Promise.withResolvers<Response>();
    request.mockImplementation(async (url: string) => url.includes("credit-recovery") && auth.userId === "seeker-a" ? oldReply.promise : json({ status: "pending" }));
    const view = mount(); await waitFor(() => expect(request).toHaveBeenCalled());
    auth.userId = "seeker-b"; view.rerender(<QueryClientProvider client={view.client}><Premium /></QueryClientProvider>);
    await act(async () => oldReply.resolve(json({ status: "credited", tokenCount: 17, summary })));
    expect(screen.queryByText("17 referral requests are ready.")).toBeNull();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
  });

  it("keeps signed-out referrer recovery on work-email sign-in only", async () => {
    pending("referrer"); auth.isSignedIn = false;
    mount();
    const link = await screen.findByRole("link", { name: "Sign in to confirm payment" });
    const destination = new URL(String(link.getAttribute("href")), window.location.origin);
    expect(destination.searchParams.get("intent")).toBe("referrer");
    expect(destination.searchParams.get("returnTo")).toBe(window.location.pathname + window.location.search);
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("stops after three confirmation attempts despite repeated focus", async () => {
    pending(); request.mockResolvedValue(json({ status: "pending" }));
    mount(); await screen.findByText("We’re confirming your payment.");
    await waitFor(() => expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(1));
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await act(async () => { window.dispatchEvent(new Event("focus")); });
    }
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(3);
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
    expect(request.mock.calls.some(([url]) => url === "/api/chargebee/checkout")).toBe(false);
  });

  it("preserves automatic retries after a slow initial confirmation", async () => {
    vi.useFakeTimers();
    pending(); const firstReply = Promise.withResolvers<Response>();
    request.mockImplementationOnce(() => firstReply.promise)
      .mockResolvedValue(json({ status: "credited", tokenCount: 5, summary }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><GoalPremium /></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(1);
    // The first response finishes after both old startup-relative timer slots.
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    await act(async () => { firstReply.resolve(json({ status: "pending" })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(8000); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(2);
    expect(screen.getByText("5 referral requests are ready.")).toBeTruthy();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  // D-048-p3-premium review F1: the confirmation deadline covers token lookup, the request and its body,
  // so a stalled leg shows the help state instead of "We’re confirming your payment." forever.
  it.each(["token", "network", "body"])("shows bounded help when %s confirmation work never settles", async stalled => {
    vi.useFakeTimers(); pending();
    const token = Promise.withResolvers<string>();
    const reply = Promise.withResolvers<Response>();
    const body = Promise.withResolvers<unknown>();
    if (stalled === "token") auth.getToken.mockImplementation(() => token.promise);
    if (stalled === "network") request.mockImplementation(() => reply.promise);
    if (stalled === "body") {
      const response = json({ status: "credited", tokenCount: 17, summary });
      vi.spyOn(response, "json").mockImplementation(() => body.promise);
      request.mockResolvedValue(response);
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const view = render(<QueryClientProvider client={client}><GoalPremium /></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.queryByText("We’re confirming your payment.")).toBeNull();
    expect(screen.getByText("We could not confirm this payment.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get help with this payment" }).getAttribute("href")).toBe("/support");
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
    const confirmation = request.mock.calls.find(([url]) => url.includes("credit-recovery"));
    if (stalled !== "token") expect(confirmation?.[1]?.signal?.aborted).toBe(true);
    // The capped retries still run sequentially inside their own deadlines.
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(auth.getToken).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
    expect(auth.getToken).toHaveBeenCalledTimes(3);
    // Let the third (last) attempt reach its own deadline before the stalled legs answer.
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    await act(async () => {
      token.resolve("late-token");
      reply.resolve(json({ status: "credited", tokenCount: 17, summary }));
      body.resolve({ status: "credited", tokenCount: 17, summary });
    });
    expect(screen.queryByText("17 referral requests are ready.")).toBeNull();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(auth.getToken).toHaveBeenCalledTimes(3);
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(stalled === "token" ? 0 : 3);
    expect(request.mock.calls.some(([url]) => url === "/api/chargebee/checkout")).toBe(false);
  });

  it("preserves automatic retries after a slow response-body parse", async () => {
    vi.useFakeTimers(); pending();
    const body = Promise.withResolvers<unknown>();
    const slow = json({ status: "pending" });
    vi.spyOn(slow, "json").mockImplementation(() => body.promise);
    request.mockResolvedValueOnce(slow)
      .mockResolvedValueOnce(json({ status: "pending" }))
      .mockResolvedValue(json({ status: "credited", tokenCount: 5, summary }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><GoalPremium /></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(screen.getByText("We could not confirm this payment.")).toBeTruthy();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).not.toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(2500); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(2);
    await act(async () => { body.resolve({ status: "pending" }); });
    expect(screen.queryByText("5 referral requests are ready.")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(3);
    expect(screen.getByText("5 referral requests are ready.")).toBeTruthy();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it.each(["credited", "requires_review"])("cancels automatic retries after a %s result", async status => {
    vi.useFakeTimers(); pending();
    request.mockResolvedValue(json(status === "credited" ? { status, tokenCount: 5, summary } : { status }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<QueryClientProvider client={client}><GoalPremium /></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
    expect(request.mock.calls.filter(([url]) => url.includes("credit-recovery"))).toHaveLength(1);
    expect(screen.getByText(status === "credited" ? "5 referral requests are ready." : "This payment needs a review.")).toBeTruthy();
    expect(request.mock.calls.some(([url]) => url === "/api/chargebee/checkout")).toBe(false);
  });
});
