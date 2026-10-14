// @vitest-environment jsdom
// Kit v4 Add-credits dialog on /plans: opening the credit pill shows the pack
// grid, picking a pack and paying hands the correct Kit item price to the
// hosted Chargebee checkout. Purchased credits are one-time bundles, so no
// quantity is sent. A signed-out visitor is routed through sign-in first.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import Plans from "./Plans";

const { openedCheckout, openSignIn, authState } = vi.hoisted(() => ({ openedCheckout: vi.fn(), openSignIn: vi.fn(), authState: { isSignedIn: true } }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: authState.isSignedIn, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn }) }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));

const ok = (json: unknown) => ({ ok: true, json: async () => json });
const freeSummary = { summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, totalAvailable: 3, subscriptionStatus: null, subscriptionCurrentTermEnd: null } };

beforeEach(() => { authState.isSignedIn = true; openedCheckout.mockClear(); openSignIn.mockClear(); window.history.pushState({}, "", "/plans?role=job_seeker"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function stub(checkout: (url: string, init?: RequestInit) => unknown | undefined) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const handled = checkout(String(url), init);
    if (handled) return handled;
    if (String(url).includes("/api/credits/summary")) return ok(freeSummary);
    if (String(url).includes("/api/chargebee/gifts/mine")) return ok({ sent: [], claimable: [] });
    return ok({});
  }));
}

describe("Plans Add credits dialog", () => {
  it("opens the pack grid from the credit pill and pays the selected Kit pack", async () => {
    let postedBody: Record<string, unknown> = {};
    stub((url, init) => url.includes("/api/chargebee/checkout")
      ? (() => { postedBody = JSON.parse(String(init?.body)); return ok({ checkoutUrl: "https://checkout.example/credits" }); })()
      : undefined);
    render(<Plans />);
    await screen.findByRole("heading", { name: "Choose how much help you need." });
    fireEvent.click(document.querySelector(".heading-aside .credit-cta") as HTMLButtonElement);
    const dialog = screen.getByRole("dialog", { name: "Add credits" });
    // USD packs are 5 / 25 / 60 / 150 (§3.2), each a radio in the pack grid.
    const packs = within(dialog).getByRole("radiogroup", { name: "Credit packs" });
    expect(within(packs).getAllByRole("radio")).toHaveLength(4);
    // Pick the 60-credit pack and pay.
    fireEvent.click(within(packs).getByRole("radio", { name: /60\s*credits/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Pay \$48/ }));
    await waitFor(() => expect(openedCheckout).toHaveBeenCalledWith("https://checkout.example/credits"));
    expect(postedBody).toMatchObject({ itemPriceId: "skipwait_pack_60-USD", billingCountry: "INTL", role: "job_seeker" });
    expect(postedBody).not.toHaveProperty("quantity");
  });

  it("announces a failed credits checkout inline and never opens a checkout", async () => {
    stub(url => url.includes("/api/chargebee/checkout") ? { ok: false, status: 502, json: async () => ({ error: "Unable to open the credits checkout" }) } : undefined);
    render(<Plans />);
    await screen.findByRole("heading", { name: "Choose how much help you need." });
    fireEvent.click(document.querySelector(".heading-aside .credit-cta") as HTMLButtonElement);
    const dialog = screen.getByRole("dialog", { name: "Add credits" });
    fireEvent.click(within(dialog).getByRole("button", { name: /^Pay \$/ }));
    expect((await within(screen.getByRole("dialog")).findByRole("alert")).textContent).toContain("Unable to open the credits checkout");
    expect(openedCheckout).not.toHaveBeenCalled();
  });

  it("routes a signed-out visitor through sign-in before any checkout", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn(async (url: string) => String(url).includes("/api/credits/summary") ? ok(freeSummary) : String(url).includes("/api/chargebee/gifts/mine") ? ok({ sent: [], claimable: [] }) : ok({}));
    vi.stubGlobal("fetch", fetchMock);
    render(<Plans />);
    fireEvent.click(document.querySelector(".heading-aside .credit-cta") as HTMLButtonElement);
    const dialog = screen.getByRole("dialog", { name: "Add credits" });
    fireEvent.click(within(dialog).getByRole("button", { name: /sign in to pay/i }));
    expect(openSignIn).toHaveBeenCalledTimes(1);
    expect(openedCheckout).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
