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

// Credit packs reopened (legacy $1 / Rs 99 per-credit route) once credits had a verified spend: debit at send, return on withdraw or expiry.
describe("credit packs are on sale", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("ships with the flag on", () => { expect(CREDIT_PACKS_ON_SALE).toBe(true); });

  it("/premium shows the quantity picker and a pay button, not the paused state", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) })));
    render(<Premium />);
    expect(await screen.findByLabelText("Number of credits to add")).toBeTruthy();
    expect(screen.queryByText("Credit packs are paused.")).toBeNull();
    expect(screen.getAllByRole("button", { name: /pay/i }).length).toBeGreaterThan(0);
  });

  it("labels only the purchased bucket as pack credits and names the free monthly credits separately", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    vi.stubGlobal("fetch", vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ summary: { totalAvailable: 3, ledger: { buckets: { purchased: 0, cycle: 3 } } } }) })));
    render(<Premium />);
    expect(await screen.findByText(/in total, including your free monthly credits/)).toBeTruthy();
    expect(document.body.textContent).toContain("You have 0 pack credits.");
    expect(document.body.textContent).not.toContain("on top of your monthly");
  });

  it("the plans credits bar renders and the out-of-credits moment offers Add credits", () => {
    const { container } = render(<CreditsSection summary={null} creditPrice={null} creditsHref="/premium" />);
    expect(container.innerHTML).not.toBe("");
    const summary = { plan: "free", ledger: { balance: 0, cycle: { used: 3 } }, slots: null } as never;
    const [moment] = upgradeMoments(summary, new Date(), "/premium");
    expect(moment.cta).toEqual({ label: "Add credits", href: "/premium" });
  });
});
