// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Plans from "./Plans";

const { openSignIn, openedCheckout } = vi.hoisted(() => ({ openSignIn: vi.fn(), openedCheckout: vi.fn() }));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn }),
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));

const summaryFree = { summary: { plan: "free", monthlyAllowance: 3, monthlyCreditsRemaining: 3, totalAvailable: 3, subscriptionStatus: null, subscriptionCurrentTermEnd: null } };

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => handler(url, init)));
}

const emptyGifts = { sent: [], claimable: [] };

beforeEach(() => {
  vi.stubEnv("VITE_GIFT_CHECKOUT_ENABLED", "true");
  window.history.pushState({}, "", "/plans?role=job_seeker");
  openedCheckout.mockClear();
  openSignIn.mockClear();
  stubFetch(url => {
    if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => summaryFree };
    if (String(url).includes("/api/chargebee/gifts/mine")) return { ok: true, json: async () => emptyGifts };
    return { ok: true, json: async () => ({}) };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.pushState({}, "", "/"); });

describe("Plans gift subscriptions", () => {
  it("hides the gift button unless VITE_GIFT_CHECKOUT_ENABLED is true", async () => {
    vi.stubEnv("VITE_GIFT_CHECKOUT_ENABLED", "");
    stubFetch(url => String(url).includes("/api/chargebee/gifts/mine") ? { ok: true, json: async () => emptyGifts } : String(url).includes("/api/credits/summary") ? { ok: true, json: async () => summaryFree } : { ok: true, json: async () => ({}) });
    render(<Plans />);
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(screen.queryByRole("button", { name: /^Gift / })).toBeNull();
  });

  it("opens a gift checkout for the selected plan without touching the buyer plan", async () => {
    stubFetch((url, init) => {
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => summaryFree };
      if (String(url).includes("/api/chargebee/gifts/mine")) return { ok: true, json: async () => emptyGifts };
      if (String(url).includes("/api/chargebee/gift-checkout")) {
        const body = JSON.parse(String(init?.body));
        expect(body).toMatchObject({ plan: "pro", currency: "USD", billingCountry: "INTL" });
        expect(body).not.toHaveProperty("receiverEmail");
        return { ok: true, json: async () => ({ checkoutUrl: "https://checkout.example/gift", hostedPageId: "hp_g" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<Plans />);
    const giftButton = await screen.findByRole("button", { name: "Gift Pro · $7/month" });
    fireEvent.click(giftButton);
    await waitFor(() => expect(openedCheckout).toHaveBeenCalledWith("https://checkout.example/gift"));
  });

  it("claims a received gift and announces the active plan", async () => {
    let claimed = false;
    stubFetch(url => {
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => summaryFree };
      if (String(url).includes("/api/chargebee/gifts/mine")) {
        return { ok: true, json: async () => ({ sent: [], claimable: claimed ? [] : [{ giftId: "gift_1", plan: "pro", receiverEmail: "me@example.com" }] }) };
      }
      if (String(url).includes("/api/chargebee/gifts/claim")) {
        claimed = true;
        return { ok: true, json: async () => ({ status: "credited" }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<Plans />);
    expect((await screen.findByRole("alert")).textContent).toContain("You received a gift");
    fireEvent.click(screen.getByRole("button", { name: "Claim gift" }));
    expect(await screen.findByText("Your gifted Pro plan is active. Monthly credits are on your balance.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim gift" })).toBeNull();
  });

  it("shows an inline announced error when the gift checkout fails", async () => {
    stubFetch(url => {
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => summaryFree };
      if (String(url).includes("/api/chargebee/gifts/mine")) return { ok: true, json: async () => emptyGifts };
      return { ok: false, status: 502, json: async () => ({ error: "Unable to open the gift checkout" }) };
    });
    render(<Plans />);
    fireEvent.click(await screen.findByRole("button", { name: "Gift Pro · $7/month" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Unable to open the gift checkout");
    expect(openedCheckout).not.toHaveBeenCalled();
  });

  it("confirms a completed or cancelled buyer return without provider details", async () => {
    window.history.pushState({}, "", "/plans?role=job_seeker&gift=done");
    render(<Plans />);
    expect(await screen.findByText("Gift checkout complete. Your recipient gets an email to claim their plan.")).toBeTruthy();
    cleanup();
    window.history.pushState({}, "", "/plans?role=job_seeker&gift=cancelled");
    render(<Plans />);
    expect(await screen.findByText("Gift checkout was cancelled. Nothing was charged.")).toBeTruthy();
  });

  it("lists sent gift receipts with honest claim states", async () => {
    stubFetch(url => {
      if (String(url).includes("/api/credits/summary")) return { ok: true, json: async () => summaryFree };
      if (String(url).includes("/api/chargebee/gifts/mine")) {
        return { ok: true, json: async () => ({ sent: [{ giftId: "g1", plan: "max", receiverEmail: "friend@example.com", providerStatus: "claimed", fulfillmentStatus: "credited" }], claimable: [] }) };
      }
      return { ok: true, json: async () => ({}) };
    });
    render(<Plans />);
    expect(await screen.findByText("Gifts you have sent (1)")).toBeTruthy();
  });
});
