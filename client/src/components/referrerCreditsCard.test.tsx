// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReferrerCreditsCard } from "./ReferrerCreditsCard";

const { getToken, authState } = vi.hoisted(() => ({ getToken: vi.fn().mockResolvedValue("test-token"), authState: { signedIn: true } }));

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isSignedIn: authState.signedIn, getToken }) }));

afterEach(() => { cleanup(); authState.signedIn = true; vi.unstubAllGlobals(); });

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ReferrerCreditsCard /></QueryClientProvider>);
}

const summary = { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 2, purchasedCreditsRemaining: 4, totalAvailable: 6, cycleKey: "2026-10", subscriptionStatus: null, subscriptionCurrentTermEnd: null };

describe("ReferrerCreditsCard", () => {
  it("renders the meter, usage copy and the purchased-credit line", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ summary }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderCard();
    expect(await screen.findByText("6 left")).toBeTruthy();
    expect(screen.getByText("1 of 3 free credits used this month.")).toBeTruthy();
    expect(screen.getByText("4 purchased credits — never expire.")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the plans link once credits run out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ summary: { ...summary, monthlyCreditsRemaining: 0, totalAvailable: 0 } }) })));
    renderCard();
    expect(await screen.findByRole("link", { name: /Increase your referral allowance/ })).toBeTruthy();
  });

  it("renders nothing and fetches nothing when signed out", () => {
    authState.signedIn = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = renderCard();
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
