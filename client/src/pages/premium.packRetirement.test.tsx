// @vitest-environment jsdom
// GO-LIVE-1 / D-036: once any credit pack is on sale in a currency, /premium
// retires the per-credit UI for that currency and points at the packs on
// /plans; the legacy per-credit checkout is never started.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Premium from "./Premium";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "INR" as const }));

beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; window.history.pushState({}, "", "/premium?role=job_seeker&currency=INR"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

const catalog = (packsAvailable: boolean) => ({
  region: "IN", currency: "INR", priceNote: null,
  free: { openRequests: 2, creditsPerMonth: 2 },
  plans: [],
  packs: [{ id: "pack_2", credits: 2, amount: 9900, available: packsAvailable, firstPack: true, recommended: false }],
  sessions: [], creditCosts: [],
  fairness: { maxOpenAsksPerCompany: 2, planVisibleToReferrers: false },
});

function setup(packsAvailable: boolean) {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (String(url).startsWith("/api/plans/catalog")) return { ok: true, status: 200, json: async () => catalog(packsAvailable) } as Response;
    return { ok: true, status: 200, json: async () => ({ summary: { totalAvailable: 3 } }) } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  rtlRender(<QueryClientProvider client={client}><Premium /></QueryClientProvider>);
  return fetchMock;
}

describe("/premium retires the single credit per currency (D-036)", () => {
  it("shows the packs pointer and never offers the per-credit checkout when a pack is on sale", async () => {
    const fetchMock = setup(true);
    expect(await screen.findByText("Credit packs replace single credits.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "See credit packs" }).getAttribute("href")).toBe("/plans#packs");
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toEqual([]);
  });

  it("keeps the per-credit UI while no pack is on sale in the currency", async () => {
    setup(false);
    expect(await screen.findByRole("spinbutton")).toBeTruthy();
    expect(screen.queryByText("Credit packs replace single credits.")).toBeNull();
  });
});
