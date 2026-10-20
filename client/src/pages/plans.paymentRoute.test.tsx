// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Plans from "./Plans";

const { openSignIn } = vi.hoisted(() => ({ openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: false, userId: null, getToken: vi.fn(), openSignIn }) }));
// The browser's locale no longer picks the currency on /plans (GO-LIVE-1 C2): the
// edge decides through the catalog. The locale mock stays to prove it is ignored.
const mockBrowserRoute = vi.hoisted(() => ({ current: "USD" as "USD" | "INR" }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => mockBrowserRoute.current }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** The catalog endpoint: ?region= wins, otherwise the edge region the test names. */
function serveCatalog(edge: "IN" | "INTL") {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), "https://skipwait.test");
    const region = url.searchParams.get("region");
    return json(catalogFixture(region === "IN" || region === "INTL" ? region : edge));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// /plans prices the Free plan and the credit packs in the catalog's currency
// (the payload doubles every catalog amount, so each price can only come from
// it). Signed out, no route ever reaches a dialog or sign-in without a press.
describe("Plans automatic payment route", () => {
  afterEach(() => { cleanup(); openSignIn.mockClear(); vi.unstubAllGlobals(); });

  it("shows one international price list first and reveals India prices only as a user correction", async () => {
    mockBrowserRoute.current = "USD";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    const fetchMock = serveCatalog("INTL");
    render(<Plans />);
    expect(await screen.findByText("$0")).toBeTruthy();
    expect(screen.getByText("$44")).toBeTruthy();
    expect(screen.getByText(/PayPal \(USD\) · Secure hosted checkout via Chargebee/)).toBeTruthy();
    expect(screen.queryByText("India · INR")).toBeNull();
    expect(screen.queryByText("Outside India · USD")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use india payment/i }));
    expect(await screen.findByText("₹0")).toBeTruthy();
    expect(screen.getByText("₹2,398")).toBeTruthy();
    expect(screen.getByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.queryByText("$44")).toBeNull();
    expect(screen.queryByText(/Global equivalent/)).toBeNull();
    expect(screen.queryByText(/India regional price/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /upgrade|sign in to pay/i })).toBeNull();
    expect(openSignIn).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(["/api/plans/catalog", "/api/plans/catalog?region=IN"]);
  });

  it("shows India prices first when the edge says India, with a quiet international correction", async () => {
    mockBrowserRoute.current = "USD";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    serveCatalog("IN");
    render(<Plans />);
    expect(await screen.findByText(/Razorpay \(INR\)/)).toBeTruthy();
    expect(screen.getByText("₹2,398")).toBeTruthy();
    expect(screen.queryByText(/PayPal/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /different billing country.*use international payment/i }));
    expect(await screen.findByText("$44")).toBeTruthy();
    expect(screen.getAllByText(/PayPal/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an India browser locale does not override the edge: the catalog's currency is the one shown", async () => {
    mockBrowserRoute.current = "INR";
    window.history.pushState({}, "", "/plans?role=job_seeker");
    serveCatalog("INTL");
    render(<Plans />);
    expect(await screen.findByText("$44")).toBeTruthy();
    expect(screen.getByText(/PayPal \(USD\)/)).toBeTruthy();
    expect(screen.queryByText(/Razorpay/)).toBeNull();
    expect(screen.queryByText(/₹/)).toBeNull();
  });
});
