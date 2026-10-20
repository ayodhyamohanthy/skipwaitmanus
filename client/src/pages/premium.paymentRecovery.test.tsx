// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Premium from "./Premium";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, getToken: vi.fn().mockResolvedValue("test-token"), openSignIn: vi.fn() }));
// Packs-on-sale paths: the flag is mocked on here; creditPacksOffSale.test.tsx pins the shipped (off) state.
vi.mock("@shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("@shared/planCatalog")>()), CREDIT_PACKS_ON_SALE: true }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));
beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); });

// GO-LIVE-1 C9: /premium reads the catalog for its currency. These tests pin the legacy
// single-credit picker, so the catalog sells no pack; the read is a public GET, never a purchase.
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={queryClient()}>{ui}</QueryClientProvider>);
const isCatalogRead = (url: unknown) => String(url).startsWith("/api/plans/catalog");
function accountFetch(summary: Record<string, unknown>) {
  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => isCatalogRead(input)
    ? new Response(JSON.stringify(catalogFixture(new URL(String(input), "https://skipwait.test").searchParams.get("region") === "IN" ? "IN" : "INTL", { packs: false })), { status: 200 })
    : new Response(JSON.stringify({ summary }), { status: 200 }));
}

describe("Premium payment return recovery", () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); });

  // The legacy single-credit checkout's own guarantees (it sells while no pack is on sale in the
  // page's currency, C9); the kit packs on /plans have theirs in plans.buy.test.tsx.
  it("waits for cookie auth before allowing checkout", async () => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/premium?role=job_seeker");
    const fetchMock = accountFetch({ totalAvailable: 3 });
    vi.stubGlobal("fetch", fetchMock);
    const client = queryClient();
    const view = rtlRender(<QueryClientProvider client={client}><Premium /></QueryClientProvider>);
    const loading = screen.getByRole("button", { name: /checking sign-in/i }) as HTMLButtonElement;
    expect(loading.disabled).toBe(true);
    fireEvent.click(loading);
    expect(auth.openSignIn).not.toHaveBeenCalled();
    // "No fetch at all" became "nothing but the public catalog read": no account read, no POST.
    expect(fetchMock.mock.calls.every(([url, init]) => isCatalogRead(url) && (init?.method ?? "GET") === "GET")).toBe(true);
    auth.isLoaded = true;
    auth.isSignedIn = true;
    view.rerender(<QueryClientProvider client={client}><Premium /></QueryClientProvider>);
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/credits/summary"))).toBe(true));
    expect(fetchMock.mock.calls.every(([url, init]) => (String(url).includes("/api/credits/summary") || isCatalogRead(url)) && (init?.method ?? "GET") === "GET")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /continue to pay/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/checkout", expect.objectContaining({ method: "POST" })));
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("preserves role and selected purchase without auto-checkout", async () => {
    auth.isSignedIn = false;
    window.history.pushState({}, "", "/premium?role=job_seeker&currency=USD&source=credits");
    const fetchMock = accountFetch({ totalAvailable: 3 });
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<Premium />);
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: /different billing country/i }));
    fireEvent.click(screen.getByRole("button", { name: /sign in to pay/i }));
    const destination = auth.openSignIn.mock.calls[0][0].returnTo;
    const query = new URL(destination, window.location.origin).searchParams;
    expect(query.get("role")).toBe("job_seeker");
    expect(query.get("source")).toBe("credits");
    expect(query.get("currency")).toBe("INR");
    expect(query.get("quantity")).toBe("7");
    expect(fetchMock.mock.calls.every(([url, init]) => isCatalogRead(url) && (init?.method ?? "GET") === "GET")).toBe(true);
    view.unmount();
    auth.isSignedIn = true;
    window.history.pushState({}, "", destination);
    render(<Premium />);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("7");
    expect(screen.getByText(/Razorpay/)).toBeTruthy();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/credits/summary"))).toBe(true));
    expect(fetchMock.mock.calls.every(([url, init]) => (String(url).includes("/api/credits/summary") || isCatalogRead(url)) && (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("shows credits only after the signed-in server recovery confirms a matching provider payment", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker&payment=pending");
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_recovery", role: "job_seeker" }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("credit-recovery")) return new Response(JSON.stringify({ status: "credited", tokenCount: 5, summary: { totalAvailable: 8 } }), { status: 200 });
      return new Response(JSON.stringify({ summary: { totalAvailable: 3 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    expect(await screen.findByText("5 referral credits are ready.")).toBeTruthy();
    expect(await screen.findByText("Your verified payment is complete and your available credits are updated.")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith("/api/chargebee/credit-recovery", expect.objectContaining({ method: "POST" }));
  });

});

describe("Premium for the referrer role (D-055: referrers never pay)", () => {
  afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.unstubAllGlobals(); });

  it.each([true, false])("shows no pay button and starts no checkout (signed in: %s)", async signedIn => {
    auth.isSignedIn = signedIn;
    window.history.pushState({}, "", "/premium?role=referrer&currency=USD&quantity=7");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ summary: { totalAvailable: 0 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    expect(await screen.findByText("Referrers never pay on SkipWait.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /continue to pay|sign in to pay/i })).toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("link", { name: /Pro and Max/i })).toBeNull();
    expect(document.querySelector("a[href^='/plans']")).toBeNull();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
    expect(fetchMock.mock.calls.some(([url]) => isCatalogRead(url))).toBe(false);
    expect(auth.openSignIn).not.toHaveBeenCalled();
  });

  it("still recovers a referrer checkout started before the switch-off", async () => {
    window.history.pushState({}, "", "/premium?role=referrer&payment=pending");
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_referrer", role: "referrer" }));
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes("credit-recovery")) return new Response(JSON.stringify({ status: "credited", tokenCount: 2, summary: { totalAvailable: 5 } }), { status: 200 });
      return new Response(JSON.stringify({ summary: { totalAvailable: 3 } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Premium />);
    expect(await screen.findByText("2 referral credits are ready.")).toBeTruthy();
    const recovery = fetchMock.mock.calls.find(([url]) => String(url).includes("credit-recovery"));
    expect(JSON.parse(String(recovery?.[1]?.body))).toEqual({ hostedPageId: "hp_referrer", role: "referrer" });
    expect(fetchMock.mock.calls.some(([url]) => String(url) === "/api/chargebee/checkout")).toBe(false);
  });
});
