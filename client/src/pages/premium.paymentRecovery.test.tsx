// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Premium from "./Premium";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); });

describe("Premium payment return recovery", () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); });

  // Plans keeps the same two guarantees in plans.paymentRecovery.test.tsx (kit v4 card + dialog markup).
  it.each([{ name: "Premium", Page: Premium }])("waits for cookie auth before allowing checkout on $name", async ({ Page }) => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    window.history.pushState({}, "", Page === Premium ? "/premium?role=referrer" : "/plans?role=referrer");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Page />);
    const loading = screen.getByRole("button", { name: /checking sign-in/i }) as HTMLButtonElement;
    expect(loading.disabled).toBe(true);
    fireEvent.click(loading);
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    auth.isLoaded = true;
    auth.isSignedIn = true;
    view.rerender(<Page />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Plans also loads gift receipts/claimables alongside the summary.
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/api/credits/summary") || String(url).includes("/api/chargebee/gifts/mine"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: Page === Premium ? /continue to pay/i : /choose pro/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(Page === Premium ? "/api/chargebee/checkout" : "/api/chargebee/subscription-checkout", expect.objectContaining({ method: "POST" })));
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it.each([{ name: "Premium", Page: Premium }])("preserves role and selected purchase without auto-checkout on $name", async ({ Page }) => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", Page === Premium ? "/premium?role=referrer&currency=USD&source=credits" : "/plans?role=referrer&currency=USD&source=credits");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Page />);
    if (Page === Premium) fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "7" } });
    else fireEvent.click(screen.getByRole("button", { name: /^Max 30/ }));
    fireEvent.click(screen.getByRole("button", { name: /different billing country/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign in to pay/i }));
    const destination = auth.openSignIn.mock.calls[0][0].returnTo;
    const query = new URL(destination, window.location.origin).searchParams;
    expect(query.get("role")).toBe("referrer");
    expect(query.get("source")).toBe("credits");
    expect(query.get("currency")).toBe("INR");
    expect(query.get(Page === Premium ? "quantity" : "plan")).toBe(Page === Premium ? "7" : "max");
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();
    auth.isSignedIn = true;
    window.history.pushState({}, "", destination);
    render(<Page />);
    if (Page === Premium) expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("7");
    else expect(screen.getByRole("button", { name: /^Max 30/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/Razorpay/)).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Plans also loads gift receipts/claimables alongside the summary.
    expect(fetchMock.mock.calls.every(([url]) => String(url).includes("/api/credits/summary") || String(url).includes("/api/chargebee/gifts/mine"))).toBe(true);
  });

  it("shows credits only after the signed-in server recovery confirms a matching provider payment", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker&payment=pending");
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_recovery", role: "job_seeker" }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("credit-recovery")) return new Response(JSON.stringify({ status: "credited", tokenCount: 5, summary: { totalAvailable: 8 } }), { status: 200 });
      return new Response(JSON.stringify({ summary: { totalAvailable: 3 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    expect(await screen.findByText("5 referral credits are ready.")).toBeTruthy();
    expect(await screen.findByText("Your verified payment is complete and your available credits are updated.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/credit-recovery", expect.objectContaining({ method: "POST" }));
  });

  it("uses the requested Pro and Max subscription microcopy while preserving the role-aware plans destination", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ summary: { totalAvailable: 3 } }), { status: 200 })));
    render(<Premium />);
    const subscriptions = await screen.findByRole("link", { name: "Or Checkout Pro and Max Subscriptions" });
    expect(subscriptions.getAttribute("href")).toBe("/plans?role=job_seeker");
  });
});
