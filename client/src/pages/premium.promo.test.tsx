// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Premium from "./Premium";

// Packs-on-sale paths: the flag is mocked on here; creditPacksOffSale.test.tsx pins the shipped (off) state.
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => null), openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

// GO-LIVE-1 C9: /premium reads the catalog for its currency; with no pack on sale it keeps the picker these tests pin.
function summaryFetch(summary: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL) => String(input).startsWith("/api/plans/catalog")
    ? { ok: true, json: async () => catalogFixture("INTL", { packs: false }) }
    : { ok: true, json: async () => ({ summary }) });
}

describe("Premium promo banner", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("invites unclaimed users to earn bonus credits on first payment", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", summaryFetch({ totalAvailable: 3, promoCreditsRemaining: 0, promoExpiresAt: null, promoStatus: null, promoOfferActive: true }));
    render(<Premium />);
    expect(await screen.findByText("First verified payment earns 5 bonus credits.")).toBeTruthy();
  });

  it("does not advertise the bonus while promo grants are switched off", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    const fetchMock = summaryFetch({ totalAvailable: 3, promoCreditsRemaining: 0, promoExpiresAt: null, promoStatus: null, promoOfferActive: false });
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("First verified payment earns 5 bonus credits.")).toBeNull());
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
