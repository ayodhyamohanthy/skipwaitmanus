// @vitest-environment jsdom
// Plans half of premium.paymentRecovery.test.tsx, on the kit v4 card + checkout
// dialog markup: checkout waits for cookie auth, and a signed-out upgrade keeps
// role, source, currency and plan through sign-in without auto-checkout.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Plans from "./Plans";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));
beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

const onlyAccountReads = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.every(([url]) => String(url).includes("/api/credits/summary") || String(url).includes("/api/chargebee/gifts/mine"));

describe("Plans payment return recovery", () => {
  it("waits for cookie auth before allowing checkout", async () => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=referrer");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Plans />);
    const loading = screen.getAllByRole("button", { name: /checking sign-in/i }) as HTMLButtonElement[];
    expect(loading.length).toBe(2);
    expect(loading.every(button => button.disabled)).toBe(true);
    for (const button of loading) fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(auth.openSignIn).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    auth.isLoaded = true;
    auth.isSignedIn = true;
    view.rerender(<Plans />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Plans also loads gift receipts/claimables alongside the summary.
    expect(onlyAccountReads(fetchMock)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /^Pay / }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/subscription-checkout", expect.objectContaining({ method: "POST" })));
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("preserves role and selected plan without auto-checkout", async () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/plans?role=referrer&currency=USD&source=credits");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Plans />);
    fireEvent.click(screen.getByRole("button", { name: /different billing country/i }));
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Max" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /sign in to pay/i }));
    const destination = String(auth.openSignIn.mock.calls[0]?.[0]?.returnTo);
    const query = new URL(destination, window.location.origin).searchParams;
    expect(query.get("role")).toBe("referrer");
    expect(query.get("source")).toBe("credits");
    expect(query.get("currency")).toBe("INR");
    expect(query.get("plan")).toBe("max");
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();
    auth.isSignedIn = true;
    window.history.pushState({}, "", destination);
    render(<Plans />);
    expect(screen.getByRole("heading", { name: "Max", level: 2 }).closest("article")?.className).toContain("featured");
    expect(screen.getByRole("heading", { name: "Pro", level: 2 }).closest("article")?.className).not.toContain("featured");
    expect(screen.getByText(/Razorpay/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(onlyAccountReads(fetchMock)).toBe(true);
  });
});
