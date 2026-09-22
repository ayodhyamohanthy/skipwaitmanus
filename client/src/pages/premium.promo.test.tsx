// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import Premium from "./Premium";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => null), openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));

function summaryFetch(summary: Record<string, unknown>) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ summary }) }));
}

describe("Premium promo banner", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("invites unclaimed users to earn bonus credits on first payment", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", summaryFetch({ totalAvailable: 3, promoCreditsRemaining: 0, promoExpiresAt: null, promoStatus: null }));
    render(<Premium />);
    expect(await screen.findByText("First verified payment earns 5 bonus credits.")).toBeTruthy();
  });

  it("shows the active promo balance with expiry instead of the claim banner", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", summaryFetch({ totalAvailable: 8, promoCreditsRemaining: 5, promoExpiresAt: new Date(Date.now() + 20 * 86_400_000).toISOString(), promoStatus: "active" }));
    render(<Premium />);
    await waitFor(() => expect(screen.queryByText("First verified payment earns 5 bonus credits.")).toBeNull());
    expect(screen.getByText((_, el) => el?.tagName === "P" && (el?.textContent ?? "").includes("bonus credit") && /expiring in \d+ day/.test(el?.textContent ?? ""))).toBeTruthy();
  });

  it("renders without promo UI when the summary carries no promo fields", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", summaryFetch({ totalAvailable: 3 }));
    render(<Premium />);
    await waitFor(() => expect(screen.getByRole("button", { name: /continue to pay/i })).toBeTruthy());
    expect(screen.queryByText("First verified payment earns 5 bonus credits.")).toBeNull();
  });
});
