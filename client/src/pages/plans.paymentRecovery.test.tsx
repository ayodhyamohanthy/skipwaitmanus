// @vitest-environment jsdom
// Plans half of premium.paymentRecovery.test.tsx: the account read waits for
// cookie auth, the currency in the address survives sign-in, and /plans starts
// no checkout without a press (GO-LIVE-1 sells credit packs here, from the
// catalog). A return with a stored intent for this role credits through the
// shared recovery (C6, client/src/lib/pendingCheckout.ts). The referrer role
// gets no purchase at all (D-055: referrers never pay).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Plans from "./Plans";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, userId: null, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));
beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); window.history.pushState({}, "", "/"); });

const PENDING_KEY = "skipwait.pending-chargebee-checkout";
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Extra = (url: string, init?: RequestInit) => Response | undefined;
function serve(extra?: Extra) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const handled = extra?.(url, init);
    if (handled) return handled;
    if (url.startsWith("/api/plans/catalog")) return json(catalogFixture(new URL(url, "https://skipwait.test").searchParams.get("region") === "IN" ? "IN" : "INTL"));
    if (url.startsWith("/api/company-referrals/mine")) return json({ requests: [] });
    return json({ summary: { totalAvailable: 3 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// "No fetch at all" became "no POST and no checkout without a press": the public catalog is read on load.
const onlyReads = (fetchMock: ReturnType<typeof serve>) => fetchMock.mock.calls.every(([url, init]) => (init?.method ?? "GET") === "GET" && !String(url).includes("/api/chargebee/"));
const accountReads = (fetchMock: ReturnType<typeof serve>) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/credits/summary"));
const planPurchase = /upgrade|\bpay\b|choose|gift|checkout|checking sign-in/i;

describe("Plans payment return recovery", () => {
  it("waits for cookie auth before reading the account, and never starts a checkout", async () => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=job_seeker");
    const fetchMock = serve();
    const client = queryClient();
    const view = rtlRender(<QueryClientProvider client={client}><Plans /></QueryClientProvider>);
    expect(await screen.findByRole("region", { name: "Credit packs" })).toBeTruthy();
    expect(screen.queryAllByRole("button").filter(button => planPurchase.test(button.textContent ?? ""))).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(accountReads(fetchMock)).toEqual([]);
    expect(onlyReads(fetchMock)).toBe(true);
    auth.isLoaded = true;
    auth.isSignedIn = true;
    view.rerender(<QueryClientProvider client={client}><Plans /></QueryClientProvider>);
    await waitFor(() => expect(accountReads(fetchMock).length).toBeGreaterThan(0));
    expect(onlyReads(fetchMock)).toBe(true);
    expect(screen.queryAllByRole("button").filter(button => planPurchase.test(button.textContent ?? ""))).toEqual([]);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("keeps the currency from the address through sign-in without auto-checkout", async () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR&source=credits");
    const fetchMock = serve();
    const view = rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    // The rupee price comes from the catalog for India, never a client constant.
    expect(await screen.findByText("₹198")).toBeTruthy();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/plans/catalog?region=IN"]);
    view.unmount();
    auth.isSignedIn = true;
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(screen.getByText(/Razorpay/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(accountReads(fetchMock).length).toBeGreaterThan(0));
    expect(await screen.findByText("₹198")).toBeTruthy();
    expect(onlyReads(fetchMock)).toBe(true);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("a return with a stored pack intent credits through credit-recovery (C6)", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&payment=pending");
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ hostedPageId: "hp_pack", role: "job_seeker" }));
    const fetchMock = serve(url => url === "/api/chargebee/credit-recovery" ? json({ status: "credited", tokenCount: 25, summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 0, totalAvailable: 25, subscriptionStatus: null, subscriptionCurrentTermEnd: null } }) : undefined);
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "25 referral credits are ready." })).toBeTruthy();
    const recoveries = fetchMock.mock.calls.filter(([url]) => url === "/api/chargebee/credit-recovery");
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0][1]).toMatchObject({ method: "POST", credentials: "include", headers: { Authorization: "Bearer test-token" } });
    expect(JSON.parse(String(recoveries[0][1]?.body))).toEqual({ hostedPageId: "hp_pack", role: "job_seeker" });
    expect(window.sessionStorage.getItem(PENDING_KEY)).toBeNull();
    // The return screen sells nothing: no catalog read, no checkout.
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/plans/catalog") || String(url) === "/api/chargebee/checkout")).toBe(false);
  });

  it("a return still being confirmed says nothing else is needed", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&payment=pending");
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ hostedPageId: "hp_pack", role: "job_seeker" }));
    serve(url => url === "/api/chargebee/credit-recovery" ? json({ status: "pending" }) : undefined);
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(await screen.findByText(/Nothing else is needed from you/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "We’re confirming your payment." })).toBeTruthy();
    expect(window.sessionStorage.getItem(PENDING_KEY)).not.toBeNull();
  });

  it("an intent stored for the other role is not used: the static copy stays and nothing is asked", () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&payment=pending");
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ hostedPageId: "hp_ref", role: "referrer" }));
    const fetchMock = serve();
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(screen.getByText("Access starts only after the verified payment event reaches our server.")).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/chargebee/"))).toBe(false);
  });
});

describe("Plans for the referrer role (D-055: referrers never pay)", () => {
  const purchaseControl = /upgrade|pay|choose|add credits|buy|gift|checkout|renew/i;

  it("offers no purchase, says referrers never pay, and sends no checkout", async () => {
    window.history.pushState({}, "", "/plans?role=referrer&currency=USD");
    const fetchMock = serve();
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(await screen.findByText("Referrers never pay on SkipWait.")).toBeTruthy();
    expect(screen.queryAllByRole("button").filter(button => purchaseControl.test(button.textContent ?? ""))).toEqual([]);
    expect(document.querySelector("a[href^='/premium'], a[href*='payment='], a[href='#credits']")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/chargebee/"))).toBe(false);
    // No price list either: the referrer arm never asks for the catalog.
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/plans/catalog"))).toBe(false);
    expect(screen.queryByRole("region", { name: "Credit packs" })).toBeNull();
  });

  it("offers no purchase to a signed-out visitor on the referrer role either", () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=referrer");
    vi.stubGlobal("fetch", vi.fn());
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(screen.getByText("Referrers never pay on SkipWait.")).toBeTruthy();
    expect(screen.queryAllByRole("button").filter(button => purchaseControl.test(button.textContent ?? ""))).toEqual([]);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("still shows the pending screen after a referrer checkout started before the switch-off", () => {
    window.history.pushState({}, "", "/plans?role=referrer&payment=pending");
    serve();
    rtlRender(<QueryClientProvider client={queryClient()}><Plans /></QueryClientProvider>);
    expect(screen.getByText("Access starts only after the verified payment event reaches our server.")).toBeTruthy();
  });
});
