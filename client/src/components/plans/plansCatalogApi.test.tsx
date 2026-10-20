// @vitest-environment jsdom
// GO-LIVE-1 C1: GET /api/plans/catalog through React Query. The server owns
// every amount and availability; the client asks the edge region by default or
// one explicit region, never trusts a payload the shared contract rejects, and
// asks with cache "no-cache" so a refetch after a 409 is not served stale.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { planCatalogResponse } from "@shared/billingCatalog";
import { NETWORK_ERROR } from "./billingApi";
import { CATALOG_ERROR, plansCatalogKeys, usePlansCatalog } from "./plansCatalogApi";

const catalog = (region: "IN" | "INTL") => planCatalogResponse({ region, available: () => true, usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(region?: "IN" | "INTL") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook(() => usePlansCatalog(region), { wrapper }) };
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("usePlansCatalog", () => {
  it("asks the edge region with no parameter, without the browser cache, and returns the parsed payload", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(catalog("INTL")));
    vi.stubGlobal("fetch", fetchMock);
    const { result, client } = setup();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(catalog("INTL"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/plans/catalog");
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-cache" });
    expect(fetchMock.mock.calls[0][1]?.method ?? "GET").toBe("GET");
    expect(client.getQueryData(["plans-catalog", "edge"])).toEqual(catalog("INTL"));
  });

  it("asks one region explicitly when given, under its own key", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(catalog("IN")));
    vi.stubGlobal("fetch", fetchMock);
    const { result, client } = setup("IN");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/plans/catalog?region=IN");
    expect(result.current.data?.currency).toBe("INR");
    expect(plansCatalogKeys.region("IN")).toEqual(["plans-catalog", "IN"]);
    expect(plansCatalogKeys.region()).toEqual(["plans-catalog", "edge"]);
    expect(client.getQueryData(["plans-catalog", "IN"])).toEqual(catalog("IN"));
  });

  it("treats a payload the shared contract rejects as an error, never as a catalog", async () => {
    // The contract is strict: an unknown field (here a client-side price) fails the parse.
    const fetchMock = vi.fn(async () => json({ ...catalog("INTL"), creditPrice: 100 }));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = setup();
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 4000 });
    expect(result.current.error?.message).toBe(CATALOG_ERROR);
    expect(result.current.data).toBeUndefined();
    // retry: 1 — one transient retry, then the error.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the server's sentence for a refused read and the shared network copy offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "Prices are unavailable right now. Try again in a moment." }, 503)));
    const refused = setup();
    await waitFor(() => expect(refused.result.current.isError).toBe(true), { timeout: 4000 });
    expect(refused.result.current.error?.message).toBe("Prices are unavailable right now. Try again in a moment.");

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const offline = setup("INTL");
    await waitFor(() => expect(offline.result.current.isError).toBe(true), { timeout: 4000 });
    expect(offline.result.current.error?.message).toBe(NETWORK_ERROR);
  });
});
