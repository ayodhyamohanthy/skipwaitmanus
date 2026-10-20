// @vitest-environment jsdom
// GO-LIVE-1 C9 (ruling 4.6, D-036, D-084 (6)): once the catalog for /premium's
// currency sells a credit pack, /premium points at the packs on /plans instead
// of the single-credit picker. While that catalog loads or fails the legacy
// picker stays (the server is the gate), and a 410 single_credit_retired shows
// the server's sentence with the same link and is never retried. The pending
// return stays first and the referrer refusal second.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SINGLE_CREDIT_RETIRED_CODE, SINGLE_CREDIT_RETIRED_ERROR } from "@shared/planCatalog";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Premium from "./Premium";

const { auth, openedCheckout } = vi.hoisted(() => ({ auth: { isLoaded: true, isSignedIn: true, getToken: vi.fn(async () => "test-token"), openSignIn: vi.fn() }, openedCheckout: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: (url: string) => openedCheckout(url) }));
vi.mock("@/lib/paymentRoute", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/paymentRoute")>()), browserPaymentRoute: () => "USD" as const }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const REPLACED = "Credit packs replace single credits.";

type Serve = { catalog?: (region: string | null) => Response | Promise<Response>; checkout?: () => Response };
function serve({ catalog = region => json(catalogFixture(region === "IN" ? "IN" : "INTL")), checkout }: Serve = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/plans/catalog")) return catalog(new URL(url, "https://skipwait.test").searchParams.get("region"));
    if (url === "/api/chargebee/checkout" && checkout) return checkout();
    if (url === "/api/chargebee/credit-recovery") return json({ status: "pending" });
    return json({ summary: { totalAvailable: 3 } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const catalogReads = (fetchMock: ReturnType<typeof serve>) => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/plans/catalog")).map(([url]) => String(url));
const posts = (fetchMock: ReturnType<typeof serve>) => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");

beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; auth.openSignIn.mockClear(); openedCheckout.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.sessionStorage.clear(); window.history.pushState({}, "", "/"); });

describe("/premium once a credit pack is on sale (C9)", () => {
  it("replaces the single-credit picker with a link to the packs, in the page's currency", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    const fetchMock = serve();
    render(<Premium />);
    expect(await screen.findByRole("heading", { name: REPLACED })).toBeTruthy();
    expect(screen.getByRole("link", { name: /See credit packs/ }).getAttribute("href")).toBe("/plans?role=job_seeker&currency=USD#credits");
    expect(catalogReads(fetchMock)).toEqual(["/api/plans/catalog?region=INTL"]);
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.queryByRole("button", { name: /to pay/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(/\$1(?![\d.,])|₹99(?![\d.,])/);
    expect(posts(fetchMock)).toEqual([]);
  });

  it("asks the India catalog for rupees, and the billing-country switch keeps working", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker&currency=INR");
    const fetchMock = serve({ catalog: region => json(catalogFixture(region === "IN" ? "IN" : "INTL", { packs: region === "IN" })) });
    render(<Premium />);
    expect(await screen.findByRole("heading", { name: REPLACED })).toBeTruthy();
    expect(screen.getByRole("link", { name: /See credit packs/ }).getAttribute("href")).toBe("/plans?role=job_seeker&currency=INR#credits");
    fireEvent.click(screen.getByRole("button", { name: /different billing country/i }));
    // No USD pack on sale: the USD single credit still sells.
    expect(await screen.findByRole("spinbutton")).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("heading", { name: REPLACED })).toBeNull());
    expect(catalogReads(fetchMock)).toEqual(["/api/plans/catalog?region=IN", "/api/plans/catalog?region=INTL"]);
  });

  it("keeps the legacy picker when no pack is on sale in that currency", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    const fetchMock = serve({ catalog: () => json(catalogFixture("INTL", { packs: false })) });
    render(<Premium />);
    await waitFor(() => expect(catalogReads(fetchMock)).toHaveLength(1));
    expect(await screen.findByRole("spinbutton")).toBeTruthy();
    expect(screen.getByRole("button", { name: /continue to pay/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: REPLACED })).toBeNull();
  });

  it("keeps the legacy picker while the catalog loads, and when it fails", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    serve({ catalog: () => new Promise<Response>(() => undefined) });
    render(<Premium />);
    expect(screen.getByRole("spinbutton")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: REPLACED })).toBeNull();
    cleanup();

    const fetchMock = serve({ catalog: () => json({ error: "Prices are unavailable right now. Try again in a moment." }, 503) });
    render(<Premium />);
    await waitFor(() => expect(catalogReads(fetchMock)).toHaveLength(1));
    expect(await screen.findByRole("button", { name: /continue to pay/i })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: REPLACED })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a 410 single_credit_retired shows the server's sentence and the packs link, and is never retried", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    const fetchMock = serve({ catalog: () => json({ error: "Prices are unavailable right now. Try again in a moment." }, 503), checkout: () => json({ error: SINGLE_CREDIT_RETIRED_ERROR, code: SINGLE_CREDIT_RETIRED_CODE }, 410) });
    render(<Premium />);
    fireEvent.click(await screen.findByRole("button", { name: /continue to pay/i }));
    expect((await screen.findByRole("alert")).textContent).toBe(SINGLE_CREDIT_RETIRED_ERROR);
    expect(screen.getByRole("link", { name: /See credit packs/ }).getAttribute("href")).toBe("/plans?role=job_seeker&currency=USD#credits");
    // No pay button to press again, and nothing retried on its own.
    expect(screen.queryByRole("button", { name: /to pay/i })).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(posts(fetchMock).filter(([url]) => url === "/api/chargebee/checkout")).toHaveLength(1);
    expect(openedCheckout).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("skipwait.pending-chargebee-checkout")).toBeNull();
  });

  it("any other checkout refusal keeps the picker and the server's words", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker");
    serve({ catalog: () => json(catalogFixture("INTL", { packs: false })), checkout: () => json({ error: "Payments are not available right now. Please try again in a moment." }, 503) });
    render(<Premium />);
    await screen.findByRole("spinbutton");
    fireEvent.click(screen.getByRole("button", { name: /continue to pay/i }));
    expect((await screen.findByRole("alert")).textContent).toBe("Payments are not available right now. Please try again in a moment.");
    expect(screen.getByRole("spinbutton")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /See credit packs/ })).toBeNull();
  });
});

describe("/premium branch order stays: pending first, referrer second (C9)", () => {
  it("the pending return shows before the packs link and asks for no catalog", async () => {
    window.history.pushState({}, "", "/premium?role=job_seeker&payment=pending");
    window.sessionStorage.setItem("skipwait.pending-chargebee-checkout", JSON.stringify({ hostedPageId: "hp_old", role: "job_seeker" }));
    const fetchMock = serve();
    render(<Premium />);
    expect(await screen.findByRole("heading", { name: "We’re confirming your payment." })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: REPLACED })).toBeNull();
    expect(catalogReads(fetchMock)).toEqual([]);
  });

  it("the referrer refusal shows before the packs link and asks for no catalog", async () => {
    window.history.pushState({}, "", "/premium?role=referrer");
    const fetchMock = serve();
    render(<Premium />);
    expect(await screen.findByText("Referrers never pay on SkipWait.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: REPLACED })).toBeNull();
    expect(document.querySelector("a[href^='/plans']")).toBeNull();
    expect(catalogReads(fetchMock)).toEqual([]);
  });
});
