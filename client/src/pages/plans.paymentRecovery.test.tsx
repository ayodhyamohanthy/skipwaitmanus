// @vitest-environment jsdom
// Plans half of premium.paymentRecovery.test.tsx: the account read waits for
// cookie auth, the currency in the address survives sign-in, and /plans starts
// no checkout of any kind (D-067 removed the Pro/Max plan checkout; credits are
// bought on /premium). The referrer role gets no purchase at all (D-055:
// referrers never pay).
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Plans from "./Plans";

function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));
beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

// GO-LIVE-1: /plans also reads the public live catalog (GET /api/plans/catalog, no checkout).
const ACCOUNT_GETS = ["/api/credits/summary", "/api/plans/catalog", "/api/company-referrals/mine", "/api/companies"];
const onlyAccountReads = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.every(([url, init]) => ACCOUNT_GETS.some(path => String(url).startsWith(path)) && (init?.method ?? "GET") === "GET");
const planPurchase = /upgrade|\bpay\b|choose|gift|checkout|checking sign-in/i;

describe("Plans payment return recovery", () => {
  it("waits for cookie auth before reading the account, and never starts a checkout", async () => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=job_seeker");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Plans />);
    expect(screen.queryAllByRole("button").filter(button => planPurchase.test(button.textContent ?? ""))).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(auth.openSignIn).not.toHaveBeenCalled();
    // Only the public catalog is read before sign-in; never the account.
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/plans/catalog"))).toBe(true);
    fetchMock.mockClear();
    auth.isLoaded = true;
    auth.isSignedIn = true;
    view.rerender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Plans /></QueryClientProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(onlyAccountReads(fetchMock)).toBe(true);
    expect(screen.queryAllByRole("button").filter(button => planPurchase.test(button.textContent ?? ""))).toEqual([]);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("keeps the currency from the address through sign-in without auto-checkout", async () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=job_seeker&currency=INR&source=credits");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Plans />);
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    // Oct 25 2026 freeze: pack sales paused, no purchase section on the legacy page.
    expect(screen.queryByText("Credits")).toBeNull();
    expect(fetchMock.mock.calls.every(([url]) => String(url).startsWith("/api/plans/catalog"))).toBe(true);
    fetchMock.mockClear();
    view.unmount();
    auth.isSignedIn = true;
    render(<Plans />);
    expect(screen.getByText(/Razorpay/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(onlyAccountReads(fetchMock)).toBe(true);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });
});

describe("Plans for the referrer role (D-055: referrers never pay)", () => {
  const purchaseControl = /upgrade|pay|choose|add credits|buy|gift|checkout|renew/i;

  it("offers no purchase, says referrers never pay, and sends no checkout", async () => {
    window.history.pushState({}, "", "/plans?role=referrer&currency=USD");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 0 } }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<Plans />);
    expect(await screen.findByText("Referrers never pay on skipwait.me.")).toBeTruthy();
    expect(screen.queryAllByRole("button").filter(button => purchaseControl.test(button.textContent ?? ""))).toEqual([]);
    expect(document.querySelector("a[href^='/premium'], a[href*='payment=']")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/chargebee/"))).toBe(false);
  });

  it("offers no purchase to a signed-out visitor on the referrer role either", () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=referrer");
    vi.stubGlobal("fetch", vi.fn());
    render(<Plans />);
    expect(screen.getByText("Referrers never pay on skipwait.me.")).toBeTruthy();
    expect(screen.queryAllByRole("button").filter(button => purchaseControl.test(button.textContent ?? ""))).toEqual([]);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("still shows the pending screen after a referrer checkout started before the switch-off", () => {
    window.history.pushState({}, "", "/plans?role=referrer&payment=pending");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) }));
    render(<Plans />);
    expect(screen.getByText("Access starts only after the verified payment event reaches our server.")).toBeTruthy();
  });
});
