// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Mock } from "vitest";
import type { useAuth } from "@/_core/auth";
import type { PremiumBalance } from "@/lib/premiumPurchase";
import type { TokenRole } from "@/lib/tokens";
import Premium from "./Premium";

const auth = vi.hoisted(() => ({
  isLoaded: true, isSignedIn: true, userId: "seeker-a",
  getToken: vi.fn(async () => "session-token"),
  openSignIn: vi.fn<ReturnType<typeof useAuth>["openSignIn"]>(),
}));
const openCheckout = vi.hoisted(() => vi.fn());
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: openCheckout }));
vi.mock("@/lib/sentry", () => ({ captureClientError: vi.fn() }));

// Preload the lazy graph; every case still renders the public Premium entrypoint.
beforeAll(async () => { await import("./goal/premium/GoalPremium"); });
const pendingKey = "skipwait.pending-chargebee-checkout";
const json = (body: object) => new Response(JSON.stringify(body), {
  status: 200, headers: { "content-type": "application/json" },
});
let summary: PremiumBalance;
let request: Mock<(url: string, options?: RequestInit) => Promise<Response>>;
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><Premium /></QueryClientProvider>) };
}
function rememberCheckout(role: TokenRole) {
  const stored = JSON.stringify({ hostedPageId: "hp-retirement", role });
  window.sessionStorage.setItem(pendingKey, stored);
  return stored;
}
function localWallets() {
  return ["bridge-tokens", "bridge-referrer-paid-tokens", "bridge-job-seeker-token-reset-3-free-v1"]
    .map(key => window.localStorage.getItem(key));
}
function expectNoPurchase() {
  expect(request.mock.calls.some(([url]) => url === "/api/chargebee/checkout")).toBe(false);
  expect(openCheckout).not.toHaveBeenCalled();
}
beforeEach(() => {
  auth.isLoaded = true; auth.isSignedIn = true; auth.userId = "seeker-a";
  auth.getToken.mockClear(); auth.openSignIn.mockClear(); openCheckout.mockClear();
  window.history.replaceState({}, "", "/premium?role=job_seeker");
  window.localStorage.clear(); window.sessionStorage.clear();
  window.localStorage.setItem("bridge-tokens", "991");
  window.localStorage.setItem("bridge-referrer-paid-tokens", "887");
  window.localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
  summary = { totalAvailable: 13, ledger: { buckets: { purchased: 4 } } };
  request = vi.fn(async (_url: string, _options?: RequestInit) => json({ summary }));
  vi.stubGlobal("fetch", request);
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  window.localStorage.clear(); window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("public Premium retirement parity", () => {
  it("keeps a signed-out referrer on the no-purchase return to referring", async () => {
    auth.isSignedIn = false;
    window.history.replaceState({}, "", "/premium?role=referrer&currency=USD&quantity=7");
    mount();
    await screen.findByText("Referrers never pay on skipwait.me.");
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/referrer");
    expect(screen.getByRole("link", { name: "Back to referring" }).getAttribute("href")).toBe("/referrer");
    expect(screen.queryByRole("region", { name: "Your referral request balance" })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay|billing country/i })).toBeNull();
    expect(document.querySelector("a[href^='/plans']")).toBeNull();
    expect(request).not.toHaveBeenCalled();
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expectNoPurchase();
  });

  it("preserves the exact pending seeker URL for sign-in without starting checkout", async () => {
    auth.isSignedIn = false;
    const returnTo = "/premium?role=job_seeker&payment=pending&currency=INR&quantity=7&source=balance&tokenCount=999&status=credited";
    window.history.replaceState({}, "", returnTo);
    const stored = rememberCheckout("job_seeker");
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to confirm payment" }));
    expect(auth.openSignIn).toHaveBeenCalledExactlyOnceWith({ returnTo });
    expect(request).not.toHaveBeenCalled();
    expect(auth.getToken).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(pendingKey)).toBe(stored);
    expect(screen.queryByRole("region", { name: "Your referral request balance" })).toBeNull();
    expectNoPurchase();
  });

  it.each(["job_seeker", "referrer"] as const)("waits for loaded auth before recovering a %s payment", async role => {
    auth.isLoaded = false;
    window.history.replaceState({}, "", `/premium?role=${role}&payment=pending`);
    const stored = rememberCheckout(role);
    request.mockResolvedValue(json({ status: "credited", tokenCount: 5, summary }));
    const view = mount();
    const checking = await screen.findByRole("button", { name: "Checking sign-in…" });
    expect(checking.hasAttribute("disabled")).toBe(true);
    fireEvent.click(checking);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(request).not.toHaveBeenCalled();
    expect(auth.getToken).not.toHaveBeenCalled();
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(pendingKey)).toBe(stored);
    auth.isLoaded = true;
    view.rerender(<QueryClientProvider client={view.client}><Premium /></QueryClientProvider>);
    await screen.findByRole("link", { name: "Use my referral requests" });
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/chargebee/credit-recovery", expect.objectContaining({
      method: "POST", credentials: "include", body: JSON.stringify({ hostedPageId: "hp-retirement", role }),
    }));
    expectNoPurchase();
  });

  it("shows the server total and purchased bucket separately when promo fields are missing", async () => {
    mount();
    const balance = await screen.findByRole("region", { name: "Your referral request balance" });
    await within(balance).findByText("13", { selector: "[data-testid='goal-num']" });
    expect(balance.textContent).toContain("13 referral requests left");
    expect(balance.textContent).toContain("4 from purchases, included in your total.");
    expect(balance.textContent).not.toMatch(/991|887|additional referral requests|ends /);
    expect(request).toHaveBeenCalledExactlyOnceWith("/api/credits/summary?role=job_seeker", expect.objectContaining({
      credentials: "include", headers: { Authorization: "Bearer session-token" },
    }));
    expectNoPurchase();
  });

  it("does not fabricate purchased or promo balances when the server omits them", async () => {
    summary = { totalAvailable: 3 };
    mount();
    const balance = await screen.findByRole("region", { name: "Your referral request balance" });
    await within(balance).findByText("3", { selector: "[data-testid='goal-num']" });
    expect(balance.textContent).toContain("3 referral requests left");
    expect(balance.textContent).not.toMatch(/from purchases|additional referral requests|ends /);
    expect(screen.queryByText(/First verified payment earns/)).toBeNull();
  });

  it("hides an already-loaded server balance after sign-out", async () => {
    const view = mount();
    await screen.findByText("13", { selector: "[data-testid='goal-num']" });
    const callsBeforeSignOut = request.mock.calls.length;
    auth.isSignedIn = false;
    view.rerender(<QueryClientProvider client={view.client}><Premium /></QueryClientProvider>);
    expect(screen.queryByRole("region", { name: "Your referral request balance" })).toBeNull();
    expect(screen.queryByText("13", { selector: "[data-testid='goal-num']" })).toBeNull();
    expect(request).toHaveBeenCalledTimes(callsBeforeSignOut);
  });

  it("shows an existing promo balance and its expiry without offering another bonus", async () => {
    summary = { ...summary, promoCreditsRemaining: 5, promoExpiresAt: "2026-12-15T12:00:00.000Z", promoStatus: "active", promoOfferActive: false };
    mount();
    const balance = await screen.findByRole("region", { name: "Your referral request balance" });
    await within(balance).findByText("5", { selector: "[data-testid='goal-num']" });
    expect(balance.textContent).toContain("13 referral requests left");
    expect(balance.textContent).toContain("5 additional referral requests already in your balance · ends 12/15/2026.");
    expect(screen.queryByText(/First verified payment earns/)).toBeNull();
    expectNoPurchase();
  });

  it.each([
    { role: "job_seeker", back: "/request", action: "Back to my referral request" },
    { role: "referrer", back: "/referrer", action: "Back to referring" },
  ] as const)("keeps both browser wallets unchanged and returns a $role to the right flow", async ({ role, back, action }) => {
    const wallets = localWallets();
    window.history.replaceState({}, "", `/premium?role=${role}`);
    const view = mount();
    expect((await screen.findByRole("link", { name: action })).getAttribute("href")).toBe(back);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(back);
    expect(screen.queryByRole("link", { name: "skipwait.me home" })).toBeNull();
    expect(localWallets()).toEqual(wallets);
    view.unmount();
    window.history.replaceState({}, "", `/premium?role=${role}&payment=pending`);
    rememberCheckout(role);
    request.mockResolvedValue(json({ status: "credited", tokenCount: 5, summary }));
    mount();
    expect((await screen.findByRole("link", { name: "Use my referral requests" })).getAttribute("href")).toBe(back);
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe(back);
    expect(localWallets()).toEqual(wallets);
    expectNoPurchase();
  });
});
