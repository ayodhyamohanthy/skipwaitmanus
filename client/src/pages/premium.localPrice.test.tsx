// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Premium from "./Premium";

function render(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return rtlRender(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
}
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false, getToken: vi.fn(async () => null), openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));

describe("Premium headline shows the buyer's local price", () => {
  afterEach(() => { cleanup(); window.history.replaceState({}, "", "/"); });
  it.each([["INR", "Credits for ₹99 each. Never expire."], ["USD", "Credits for $1 each. Never expire."]])("%s", async (currency, heading) => {
    window.history.pushState({}, "", `/premium?currency=${currency}`);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    render(<Premium />);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe(heading);
  });
});
