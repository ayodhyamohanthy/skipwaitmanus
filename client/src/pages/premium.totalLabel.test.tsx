// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Premium from "./Premium";
const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => null), openSignIn: vi.fn() }));
const catalog = vi.hoisted(() => ({ available: false, currency: "USD" }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/components/plans/plansCatalogApi", () => ({ usePlansCatalog: () => ({ data: { currency: catalog.currency, packs: [{ available: catalog.available }] } }) }));
vi.mock("@shared/planCatalog", async original => ({ ...(await original<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
function mount(currency: string, quantity: number, role = "job_seeker") {
  catalog.currency = currency;
  window.history.replaceState({}, "", `/premium?currency=${currency}&quantity=${quantity}&role=${role}`);
  render(<Premium />);
}
function totals(label: string) {
  expect(screen.getByText(`Pay ${label}`).textContent).toBe(`Pay ${label}`);
  expect(screen.getByRole("contentinfo").textContent).toContain(label);
  expect(screen.getByRole("button", { name: `Continue to pay ${label}` })).toBeTruthy();
}
beforeEach(() => {
  catalog.available = false;
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ summary: { totalAvailable: 3 }, checkoutUrl: "https://checkout.test/mock", hostedPageId: "mock-page" }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); window.history.replaceState({}, "", "/"); });
describe("Premium selected total display", () => {
  it.each([
    ["USD", 1, "$1 USD", "Credits for $1 each. Never expire."],
    ["USD", 10, "$10 USD", "Credits for $1 each. Never expire."],
    ["INR", 1, "₹99 INR", "Credits for ₹99 each. Never expire."],
    ["INR", 10, "₹990 INR", "Credits for ₹99 each. Never expire."],
  ] as const)("%s quantity %s", (currency, quantity, label, heading) => {
    mount(currency, quantity); totals(label);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(heading);
  });
  it("updates all totals with quantity controls and billing country", () => {
    mount("USD", 10); fireEvent.click(screen.getByRole("button", { name: "Add one credit" })); totals("$11 USD");
    fireEvent.click(screen.getByRole("button", { name: "Remove one credit" })); totals("$10 USD");
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1" } }); totals("$1 USD");
    fireEvent.click(screen.getByRole("button", { name: /Different billing country/ })); totals("₹99 INR");
  });
  it.each([["USD", "skipwait_token_1-USD", "INTL"], ["INR", "skipwait_token_1-INR", "IN"]])("preserves %s checkout payload without client amounts", async (currency, itemPriceId, billingCountry) => {
    mount(currency, 10); fireEvent.click(screen.getByRole("button", { name: /Continue to pay/ }));
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => url === "/api/chargebee/checkout")).toBe(true));
    const call = vi.mocked(fetch).mock.calls.find(([url]) => url === "/api/chargebee/checkout");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ itemPriceId, billingCountry, role: "job_seeker", quantity: 10 });
  });
  it("keeps the current-catalog retirement guard", () => {
    catalog.available = true; mount("USD", 10);
    expect(screen.getByText("Credit packs replace single credits.")).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });
  it("keeps referrer purchases disabled", () => {
    mount("USD", 10, "referrer"); expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /pay/ })).toBeNull();
  });
});
