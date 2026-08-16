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

  it("starts a Job Seeker Chargebee checkout without mutating the browser token balance", async () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /continue to \$1\.00 checkout/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ method: "POST" })));
    expect(localStorage.getItem("bridge-tokens")).toBe("0");
    expect(openCheckout).toHaveBeenCalledWith("https://skipwait-test.chargebee.com/hosted_pages/test");
  });

  it("starts a Referrer Chargebee checkout without mutating the purchased wallet", async () => {
    window.history.pushState({}, "", "/premium?role=referrer");
    render(<Premium />);
    fireEvent.click(screen.getByRole("button", { name: /continue to \$1\.00 checkout/i }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ body: expect.stringContaining('"role":"referrer"') })));
    expect(localStorage.getItem("bridge-referrer-paid-tokens")).toBeNull();
    expect(openCheckout).toHaveBeenCalled();
  });

  it("offers the approved USD one-time packs and keeps the brand/back-link layout", () => {
    window.history.pushState({}, "", "/premium");
    render(<Premium />);
    expect(screen.getByRole("link", { name: "skipwait.me home" }).parentElement?.className).toContain("items-center");
    expect(screen.getByRole("link", { name: "Back" }).getAttribute("href")).toBe("/request");
    expect(screen.getByText("1 token")).toBeTruthy();
    expect(screen.getByText("5 tokens")).toBeTruthy();
    expect(screen.getByText("10 tokens")).toBeTruthy();
    expect(screen.queryByText(/Domestic checkout simulation/i)).toBeNull();
  });
});
