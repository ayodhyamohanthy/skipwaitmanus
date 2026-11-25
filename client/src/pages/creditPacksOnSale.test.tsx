// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import Premium from "./Premium";

// GO-LIVE-1: /premium reads the live catalog through React Query, so tests wrap a client.
function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
import { upgradeMoments } from "@/components/plans/UpgradeMoments";
import { CreditsSection } from "@/components/plans/PlansCredits";

const openChargebeeCheckout = vi.hoisted(() => vi.fn());
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => null), openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout }));

// Oct 25 2026 freeze (shared/planCatalog.ts): new pack purchases are paused ahead of the
// banded-plans replacement. The pre-pause on-sale behavior is still exercised under
// deps/mocks in premium.promo, premium.totalLabel and premium.localPrice tests.
describe("credit packs are paused", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("ships with the flag off", () => { expect(CREDIT_PACKS_ON_SALE).toBe(false); });

  it("/premium shows the paused state: no quantity picker, no pay button, support link", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) })));
    render(<Premium />);
    expect(await screen.findByText("Credit packs are paused.")).toBeTruthy();
    expect(screen.queryByLabelText("Number of credits to add")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /pay/i })).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Contact Support" })).toBeTruthy();
  });

  it("the out-of-credits moment offers no purchase while paused", () => {
    const summary = { plan: "free", ledger: { balance: 0, cycle: { used: 3 } }, slots: null } as never;
    const [moment] = upgradeMoments(summary, new Date(), "/premium");
    expect(moment.cta).toBeNull();
  });

  it("the plans credits bar still renders the credit count when paused", () => {
    const { container } = render(<CreditsSection summary={null} creditPrice={null} creditsHref="/premium" />);
    expect(container.innerHTML).toBe("");
  });
});
