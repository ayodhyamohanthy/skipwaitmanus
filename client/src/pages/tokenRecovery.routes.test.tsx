// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Premium from "./Premium";

vi.mock("@/lib/trpc", () => ({ trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 1 }, refresh: vi.fn(), logout: vi.fn() }) }));
vi.mock("@clerk/react", () => ({ useAuth: () => ({ isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-clerk-token") }), useClerk: () => ({ openSignIn: vi.fn() }) }));
const openCheckout = vi.fn();
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (...args: unknown[]) => openCheckout(...args) }));

function prepareStorage() {
  localStorage.clear();
  localStorage.setItem("bridge-job-seeker-token-reset-3-free-v1", "complete");
  localStorage.setItem("bridge-tokens", "0");
}

describe("secure token checkout routes", () => {
  beforeEach(() => {
    prepareStorage();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ checkoutUrl: "https://skipwait-test.chargebee.com/hosted_pages/test", hostedPageId: "hp_test" }) })));
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); openCheckout.mockReset(); });

  it("starts an editable multi-token Job Seeker Chargebee checkout without mutating the browser token balance", async () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of credits to add" }), { target: { value: "3" } });
    expect(screen.getByDisplayValue("3")).toBeTruthy();
    expect(screen.getByText("3 referral credits")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue to pay ₹297 inr/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ method: "POST", body: expect.stringContaining('"quantity":3') })));
    expect(localStorage.getItem("bridge-tokens")).toBe("0");
    expect(openCheckout).toHaveBeenCalledWith("https://skipwait-test.chargebee.com/hosted_pages/test");
  });

  it("starts a Referrer Chargebee checkout without mutating the purchased wallet", async () => {
    window.history.pushState({}, "", "/premium?role=referrer");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue to pay ₹990 inr/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ body: expect.stringContaining('"role":"referrer"') })));
    expect(localStorage.getItem("bridge-referrer-paid-tokens")).toBeNull();
    expect(openCheckout).toHaveBeenCalled();
  });

  it("shows one detected local route first, with a quiet correction path for another billing country", () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    expect(screen.queryByRole("link", { name: "skipwait.me home" })).toBeNull();
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/request");
    expect(screen.getByText("Pay $1")).toBeTruthy();
    expect(screen.getByText(/PayPal/)).toBeTruthy();
    expect(screen.queryByText("India · INR")).toBeNull();
    expect(screen.queryByText("Outside India · USD")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(screen.getByText("Pay ₹99")).toBeTruthy();
    expect(screen.getByText(/Razorpay Domestic/)).toBeTruthy();
    expect((screen.getByRole("spinbutton", { name: "Number of credits to add" }) as HTMLInputElement).value).toBe("10");
    expect(screen.getByText(/credits are added only after verified payment/i)).toBeTruthy();
  });

  it("defaults to an editable ten-credit quantity without preset pack buttons", () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect((screen.getByRole("spinbutton", { name: "Number of credits to add" }) as HTMLInputElement).value).toBe("10");
    expect(screen.queryByText("Credit packs")).toBeNull();
    expect(screen.queryByRole("button", { name: "Choose a custom quantity" })).toBeNull();
    expect(screen.queryByRole("button", { name: /5 credits/i })).toBeNull();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of credits to add" }), { target: { value: "5" } });
    expect(screen.getByText("5 referral credits")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue to pay ₹495 INR/i })).toBeTruthy();
  });
});
