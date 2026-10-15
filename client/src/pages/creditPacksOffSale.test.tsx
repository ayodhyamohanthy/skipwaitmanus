// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import Premium from "./Premium";
import { upgradeMoments } from "@/components/plans/UpgradeMoments";
import { CreditsSection } from "@/components/plans/PlansCredits";

const openChargebeeCheckout = vi.hoisted(() => vi.fn());
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => null), openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout }));

// Credit packs are off sale until credits have a verified spend (spent at send, returned on withdraw or expiry).
describe("credit packs are off sale", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); vi.unstubAllGlobals(); });

  it("ships with the flag off", () => { expect(CREDIT_PACKS_ON_SALE).toBe(false); });

  it("/premium shows a paused state with no quantity picker and no pay button, and never starts a checkout", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, json: async () => ({ summary: { totalAvailable: 3 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    expect(await screen.findByText("Credit packs are paused.")).toBeTruthy();
    expect(screen.queryByLabelText("Number of credits to add")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay/i })).toBeNull();
    expect(screen.getByRole("link", { name: "See Pro and Max" }).getAttribute("href")).toBe("/plans?role=job_seeker");
    expect(openChargebeeCheckout).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes("/api/chargebee/checkout"))).toBe(false);
  });

  it("the plans credits bar is gone and the out-of-credits moment points at plans, not a pack", () => {
    const { container } = render(<CreditsSection summary={null} currency="USD" creditsHref="/premium" />);
    expect(container.innerHTML).toBe("");
    const summary = { plan: "free", ledger: { balance: 0, cycle: { used: 3 } }, slots: null } as never;
    const [moment] = upgradeMoments(summary, new Date(), "/premium", () => {});
    expect(moment.cta).toEqual({ label: "Compare plans", href: "#compare" });
    expect(JSON.stringify(moment)).not.toMatch(/pack|Add credits/i);
  });
});
