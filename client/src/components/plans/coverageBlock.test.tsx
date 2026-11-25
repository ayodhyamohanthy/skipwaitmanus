// @vitest-environment jsdom
// D-174 public-payload (packet §6.3, D-176): the legacy /plans coverage block
// reads only the seeker's own requests. It never fetches the company directory,
// never lists directory companies and never infers "waiting" from a directory
// availability flag the server no longer sends.
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CoverageBlock } from "./PlansKitSections";

vi.mock("@/_core/auth", () => ({ useAuth: () => ({ isLoaded: true, isSignedIn: true, getToken: async () => "test-token", openSignIn: vi.fn() }) }));
vi.mock("@/lib/chargebeeCheckout", () => ({ openChargebeeCheckout: vi.fn() }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** An older server's directory, still carrying availability: the old block listed these companies as "waiting". */
const directory = {
  companies: [
    { slug: "acme", name: "Acme", initials: "AC", industry: "Tech", location: "Bengaluru", functions: ["Engineering"], blurb: "x", domains: ["acme.com"], openToReferrals: false },
    { slug: "globex", name: "Globex", initials: "GL", industry: "Tech", location: "Bengaluru", functions: ["Engineering"], blurb: "x", domains: ["globex.com"], openToReferrals: false },
  ],
  openCount: 0,
};

function stubFetch(requests: unknown[]) {
  const urls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(String(url));
    if (String(url).startsWith("/api/company-referrals/mine")) return { ok: true, status: 200, json: async () => ({ requests }) } as Response;
    if (String(url).startsWith("/api/companies")) return { ok: true, status: 200, json: async () => directory } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }));
  return urls;
}

function renderBlock() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CoverageBlock isSignedIn getToken={async () => "test-token"} /></QueryClientProvider>);
}

const WAITING = "Waits at no cost until a verified employee is available.";
const HELD = "On hold until you add a credit.";
const VISIBLE = "A verified employee can see this ask.";

describe("CoverageBlock reads only the seeker's own requests", () => {
  it("never requests the company directory", async () => {
    const urls = stubFetch([{ id: 1, companyDomain: "acme.com", companyName: "Acme", status: "pending", waitingForCoverage: true, queueStatus: "waiting_for_coverage" }]);
    renderBlock();
    expect(await screen.findByText(/Where your asks stand/)).toBeTruthy();
    expect(urls.some(url => url.startsWith("/api/company-referrals/mine"))).toBe(true);
    expect(urls.filter(url => url.startsWith("/api/companies"))).toEqual([]);
  });

  it("shows no block for a seeker with no pending request, and lists no directory company", async () => {
    const urls = stubFetch([{ id: 9, companyDomain: "acme.com", companyName: "Acme", status: "referred", waitingForCoverage: false, queueStatus: null }]);
    const { container } = renderBlock();
    await waitFor(() => expect(urls.some(url => url.startsWith("/api/company-referrals/mine"))).toBe(true));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(container.textContent).toBe("");
    expect(screen.queryByText("Globex")).toBeNull();
  });

  it("renders held, visible and waiting rows from queueStatus", async () => {
    stubFetch([
      { id: 1, companyDomain: "acme.com", companyName: "Acme", status: "pending", waitingForCoverage: true, queueStatus: "waiting_for_coverage" },
      { id: 2, companyDomain: "globex.com", companyName: "Globex", status: "pending", waitingForCoverage: true, queueStatus: "held_for_credit" },
      { id: 3, companyDomain: "initech.com", companyName: "Initech", status: "pending", waitingForCoverage: false, queueStatus: "available_for_review" },
    ]);
    renderBlock();
    expect(await screen.findByText(/Where your asks stand/)).toBeTruthy();
    const rows = screen.getAllByRole("listitem").map(item => item.textContent);
    expect(rows).toEqual([`AAcme${WAITING}`, `GGlobex${HELD}`, `IInitech${VISIBLE}`]);
  });

  it("a pending request no longer waiting for coverage is visible, not waiting, with no directory flag to read", async () => {
    stubFetch([
      { id: 4, companyDomain: "acme.com", companyName: "Acme", status: "pending", waitingForCoverage: false, queueStatus: null },
      { id: 5, companyDomain: "globex.com", companyName: "Globex", status: "pending", waitingForCoverage: true, queueStatus: null },
    ]);
    renderBlock();
    expect(await screen.findByText(/Where your asks stand/)).toBeTruthy();
    const rows = screen.getAllByRole("listitem").map(item => item.textContent);
    expect(rows).toEqual([`AAcme${VISIBLE}`, `GGlobex${WAITING}`]);
  });

  it("skips a pending request whose state the server did not say, rather than guessing", async () => {
    stubFetch([
      { id: 6, companyDomain: "acme.com", companyName: "Acme", status: "pending" },
      { id: 7, companyDomain: "globex.com", companyName: "Globex", status: "pending", waitingForCoverage: true, queueStatus: "waiting_for_coverage" },
    ]);
    renderBlock();
    expect(await screen.findByText(/Where your asks stand/)).toBeTruthy();
    expect(screen.getAllByRole("listitem").map(item => item.textContent)).toEqual([`GGlobex${WAITING}`]);
  });
});
