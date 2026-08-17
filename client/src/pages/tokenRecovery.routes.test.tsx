// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Premium from "./Premium";

vi.mock("@/lib/trpc", () => ({ trpc: { ai: { draftHiringManagerEmail: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) } } } }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true, isLoading: false, user: { id: 1 }, refresh: vi.fn(), logout: vi.fn() }) }));
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

  it("starts a multi-token Job Seeker Chargebee checkout without mutating the browser token balance", async () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: "Add one token" }));
    fireEvent.click(screen.getByRole("button", { name: "Add one token" }));
    expect(screen.getByDisplayValue("3")).toBeTruthy();
    expect(screen.getByText("3 action tokens")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /continue to ₹297 inr checkout/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ method: "POST", body: expect.stringContaining('"quantity":3') })));
    expect(localStorage.getItem("bridge-tokens")).toBe("0");
    expect(openCheckout).toHaveBeenCalledWith("https://skipwait-test.chargebee.com/hosted_pages/test");
  });

  it("starts a Referrer Chargebee checkout without mutating the purchased wallet", async () => {
    window.history.pushState({}, "", "/premium?role=referrer");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /continue to ₹99 inr checkout/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ body: expect.stringContaining('"role":"referrer"') })));
    expect(localStorage.getItem("bridge-referrer-paid-tokens")).toBeNull();
    expect(openCheckout).toHaveBeenCalled();
  });

  it("offers Razorpay Domestic for INR and PayPal for international USD while keeping the brand/back-link layout", () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    expect(screen.getByRole("link", { name: "skipwait.me home" }).parentElement?.className).toContain("items-center");
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/request");
    expect(screen.getByText("1 action token")).toBeTruthy();
    expect((screen.getByRole("spinbutton", { name: "Number of tokens to add" }) as HTMLInputElement).value).toBe("1");
    expect(screen.getByText("Chargebee hosted checkout")).toBeTruthy();
    expect(screen.getAllByText("₹99 INR").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$1 USD per token").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Razorpay Domestic/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/PayPal/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/Razorpay International \/ Export/i)).toBeNull();
  });
});
