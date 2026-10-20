// @vitest-environment jsdom
// GO-LIVE-1 C5 (ruling 4.5, D-084 (7); §0.4 test 3): before paying, a signed-in
// seeker sees who can see their asks, from their own pending asks and the
// public directory's availability boolean, never a count of people. A failed
// read hides the block; the purchase sections never depend on it.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { catalogFixture } from "@/components/plans/catalogFixture";
import Plans from "./Plans";

const auth = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, userId: null, getToken: vi.fn(async () => "test-token"), openSignIn: vi.fn() }));
vi.mock("@/_core/auth", () => ({ useAuth: () => auth }));
vi.mock("wouter", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));

const render = (ui: React.ReactElement) => rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const FALLBACK = "Credits are used when a verified employee can see your ask.";
const open = (company: string) => `A verified employee at ${company} can see asks now.`;
const waiting = (company: string) => `No verified employee at ${company} yet. Asks there wait for free for up to 90 days.`;

type Ask = { id: number; companyDomain: string; companyName?: string | null; status?: string; referrerId?: number | null; queueStatus?: "available_for_review" | "waiting_for_coverage" | "held_for_credit" | null; waitingForCoverage?: boolean; createdAt?: string };
let nextId = 1;
const ask = (patch: Ask) => ({ title: "Engineer", targetRoleUrl: null, compensation: null, status: "pending", referrerId: null, queueStatus: null, waitingForCoverage: false, coverageVisibleAt: null, referrerMessage: null, unreadMessageCount: 0, createdAt: "2026-10-10T00:00:00.000Z", updatedAt: "2026-10-10T00:00:00.000Z", attachmentCount: 1, expiresAt: null, companyName: null, companyInitials: null, ...patch });
const company = (slug: string, name: string, domains: string[], openToReferrals: boolean) => ({ slug, name, initials: name.slice(0, 2).toUpperCase(), industry: "Software", location: "Global", functions: ["Engineering"], blurb: `${name} on SkipWait.`, domains, openToReferrals });
const directory = (companies: ReturnType<typeof company>[]) => ({ companies, openCount: companies.filter(entry => entry.openToReferrals).length });

type Serve = { mine?: () => Response; companies?: () => Response };
function serve({ mine = () => json({ requests: [] }), companies = () => json(directory([])) }: Serve = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith("/api/plans/catalog")) return json(catalogFixture("INTL"));
    if (url.startsWith("/api/credits/summary")) return json({ summary: null });
    if (url.startsWith("/api/company-referrals/mine")) return mine();
    if (url.startsWith("/api/companies")) return companies();
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const coverage = () => screen.findByRole("region", { name: "Who can see your asks" });
const lines = (region: HTMLElement) => within(region).getAllByRole("listitem").map(item => item.textContent);

beforeEach(() => { auth.isLoaded = true; auth.isSignedIn = true; nextId = 1; window.history.pushState({}, "", "/plans?role=job_seeker"); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

describe("/plans coverage before payment (C5)", () => {
  it("says for each company whether a verified employee can see asks there, newest first", async () => {
    const requests = [
      ask({ id: nextId++, companyDomain: "acme.com", companyName: "Acme", referrerId: 7, queueStatus: "available_for_review", createdAt: "2026-10-19T00:00:00.000Z" }),
      ask({ id: nextId++, companyDomain: "wipro.com", companyName: "Wipro", queueStatus: "waiting_for_coverage", waitingForCoverage: true, createdAt: "2026-10-18T00:00:00.000Z" }),
      ask({ id: nextId++, companyDomain: "tcs.com", companyName: "TCS", queueStatus: "held_for_credit", waitingForCoverage: true, createdAt: "2026-10-17T00:00:00.000Z" }),
      ask({ id: nextId++, companyDomain: "zed.io", companyName: "Zed Corp", queueStatus: "held_for_credit", waitingForCoverage: true, createdAt: "2026-10-16T00:00:00.000Z" }),
      ask({ id: nextId++, companyDomain: "gamma.io", queueStatus: "waiting_for_coverage", waitingForCoverage: true, createdAt: "2026-10-15T00:00:00.000Z" }),
      // Not pending: never counted.
      ask({ id: nextId++, companyDomain: "closed.io", companyName: "Closed Co", status: "declined", createdAt: "2026-10-20T00:00:00.000Z" }),
    ];
    const fetchMock = serve({
      mine: () => json({ requests }),
      companies: () => json(directory([company("wipro", "Wipro", ["wipro.com"], true), company("tcs", "TCS", ["tcs.com"], false)])),
    });
    render(<Plans />);
    const region = await coverage();
    await waitFor(() => expect(lines(region)).toEqual([
      open("Acme"),
      // A waiting ask at a listed company: the directory's boolean picks the sentence.
      open("Wipro"),
      waiting("TCS"),
      // An unlisted company: its own state (held means an employee can see asks there).
      open("Zed Corp"),
      waiting("gamma.io"),
    ]));
    expect(region.textContent).not.toContain("Closed Co");
    // Never a count of people.
    expect(region.textContent).not.toMatch(/\d+\s+(verified\s+)?(employees?|referrers?|people)/i);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toEqual([]);
    // It sits above the purchase sections.
    const packs = screen.getByRole("region", { name: "Credit packs" });
    expect(region.compareDocumentPosition(packs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("an ask in the company's open queue reads as visible, and one company is one line", async () => {
    const requests = [
      ask({ id: nextId++, companyDomain: "acme.com", companyName: "Acme", queueStatus: null, waitingForCoverage: false, createdAt: "2026-10-19T00:00:00.000Z" }),
      ask({ id: nextId++, companyDomain: "acme.com", companyName: "Acme", queueStatus: "waiting_for_coverage", waitingForCoverage: true, createdAt: "2026-10-18T00:00:00.000Z" }),
    ];
    const fetchMock = serve({ mine: () => json({ requests }) });
    render(<Plans />);
    const region = await coverage();
    await waitFor(() => expect(lines(region)).toEqual([open("Acme")]));
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/company-referrals/mine"))).toBe(true);
  });

  it("names at most 5 companies", async () => {
    const requests = ["a1.io", "a2.io", "a3.io", "a4.io", "a5.io", "a6.io", "a7.io"].map((domain, index) => ask({ id: nextId++, companyDomain: domain, referrerId: 3, queueStatus: "available_for_review", createdAt: `2026-10-${String(19 - index).padStart(2, "0")}T00:00:00.000Z` }));
    const fetchMock = serve({ mine: () => json({ requests }) });
    render(<Plans />);
    const region = await coverage();
    await waitFor(() => expect(lines(region)).toEqual(["a1.io", "a2.io", "a3.io", "a4.io", "a5.io"].map(open)));
    // Every ask is already visible to a referrer: the directory is never asked.
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/companies"))).toBe(false);
  });

  it("with no pending asks says when credits are used and links Explore", async () => {
    serve({ mine: () => json({ requests: [ask({ id: nextId++, companyDomain: "acme.com", status: "withdrawn" })] }) });
    render(<Plans />);
    const region = await coverage();
    expect(await within(region).findByText(FALLBACK)).toBeTruthy();
    expect(within(region).getByRole("link", { name: /Explore companies/ }).getAttribute("href")).toBe("/explore");
  });

  it("signed out shows the fallback without reading anyone's asks", async () => {
    auth.isSignedIn = false;
    const fetchMock = serve();
    render(<Plans />);
    const region = await coverage();
    expect(within(region).getByText(FALLBACK)).toBeTruthy();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/company-referrals/mine"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/companies"))).toBe(false);
  });

  it("while sign-in is still loading shows nothing and reads no asks", async () => {
    auth.isLoaded = false;
    auth.isSignedIn = false;
    const fetchMock = serve();
    render(<Plans />);
    expect(await screen.findByRole("region", { name: "Credit packs" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Who can see your asks" })).toBeNull();
    expect(screen.queryByText(FALLBACK)).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/company-referrals/mine"))).toBe(false);
  });

  it("a failed asks read hides the block and the packs still sell", async () => {
    serve({ mine: () => json({ error: "We could not load your referral requests" }, 500) });
    render(<Plans />);
    expect(await screen.findByRole("region", { name: "Credit packs" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText(FALLBACK)).toBeNull());
    expect(screen.queryByRole("region", { name: "Who can see your asks" })).toBeNull();
  });

  it("a failed directory read hides the block when a waiting ask needs it", async () => {
    const fetchMock = serve({
      mine: () => json({ requests: [ask({ id: nextId++, companyDomain: "tcs.com", companyName: "TCS", queueStatus: "waiting_for_coverage", waitingForCoverage: true })] }),
      companies: () => json({ error: "Company directory unavailable" }, 503),
    });
    render(<Plans />);
    expect(await screen.findByRole("region", { name: "Credit packs" })).toBeTruthy();
    // The directory hook retries a transient failure once; wait for both reads to fail.
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/companies"))).toHaveLength(2), { timeout: 4000 });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Who can see your asks" })).toBeNull());
    expect(screen.queryByText(/TCS/)).toBeNull();
  });
});
