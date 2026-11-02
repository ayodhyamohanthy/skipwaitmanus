// @vitest-environment jsdom
// D-174-seeker-journey-build.search (packet §6.4, ruling 8): the /explore company
// typeahead reads GET /api/companies/search behind COMPANY_TYPEAHEAD_ENABLED.
// With the switch off, /explore behaves exactly as today (client filter only, no
// search request); with it on, the box suggests at most 10 companies as a
// combobox, and a query with no suggestion offers the paste-a-link path first and
// "Request a company" as the quiet link. Events carry no query text.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";

const { go, flag, events } = vi.hoisted(() => ({
  go: vi.fn(),
  flag: { on: false },
  events: [] as string[],
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true, userId: "user-7", getToken: async () => "test-token" }),
  useUser: () => ({ user: { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/explore", go],
  useSearch: () => "",
  useRoute: () => [false, {}],
}));
vi.mock("@/lib/clarity", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/clarity")>()),
  trackClarityEvent: (name: string) => { events.push(name); },
}));
// The switch is a module constant (false on main); the tests read it through a getter so both states run.
vi.mock("./useCompanySearch", async importOriginal => {
  const actual = await importOriginal<typeof import("./useCompanySearch")>();
  return { ...actual, get COMPANY_TYPEAHEAD_ENABLED() { return flag.on; } };
});

import Explore from "../Explore";
import * as companySearchModule from "./useCompanySearch";
import { COMPANY_SEARCH_DEBOUNCE_MS, fetchCompanySearch, useCompanySearch } from "./useCompanySearch";

const company = (slug: string): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true };
};
/** The search route's public shape: no availability key (D-176). */
const searchRow = (slug: string) => { const { openToReferrals: _drop, ...rest } = company(slug); return rest; };
const DIRECTORY: CompanyDirectoryResponse = { companies: LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)), openCount: LAUNCH_COMPANY_SEED.length };
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });

function stub(search: (q: string) => { status: number; body: unknown }) {
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path === "/api/companies") return json(200, DIRECTORY);
    if (path.startsWith("/api/companies/search?")) {
      const q = new URL(path, "http://x").searchParams.get("q") ?? "";
      const answer = search(q);
      return json(answer.status, answer.body);
    }
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, { goal: "", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "", resume: null });
    if (path === "/api/ask-drafts") return json(200, { draft: null });
    return json(404, {});
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const searchCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(call => String(call[0])).filter(path => path.startsWith("/api/companies/search"));
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const renderExplore = () => render(<QueryClientProvider client={client()}><Explore /></QueryClientProvider>);

beforeEach(() => {
  flag.on = false;
  events.length = 0;
  go.mockReset();
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the switch (ruling 8, release row turns it on)", () => {
  it("ships off", async () => {
    const actual = await vi.importActual<typeof import("./useCompanySearch")>("./useCompanySearch");
    expect(actual.COMPANY_TYPEAHEAD_ENABLED).toBe(false);
    expect(companySearchModule.COMPANY_SEARCH_DEBOUNCE_MS).toBe(150);
  });

  it("off: /explore keeps today's searchbox and client filter, and never calls the search route", async () => {
    const fetchMock = stub(() => ({ status: 200, body: { companies: [searchRow("wipro")] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    const box = screen.getByRole("searchbox", { name: "Search companies" });
    expect(screen.queryByRole("combobox")).toBeNull();
    fireEvent.change(box, { target: { value: "tcs" } });
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^1 company$/);
    await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 100));
    expect(searchCalls(fetchMock)).toEqual([]);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(events).toEqual([]);
  });
});

describe("fetchCompanySearch", () => {
  it("asks the route with one q and parses the strict response", async () => {
    const fetchMock = stub(() => ({ status: 200, body: { companies: [searchRow("wipro")] } }));
    const companies = await fetchCompanySearch("  wip ");
    expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=wip"]);
    expect(companies.map(item => item.slug)).toEqual(["wipro"]);
  });

  it("refuses a response that carries availability (D-176) or more than 10 companies", async () => {
    stub(() => ({ status: 200, body: { companies: [company("wipro")] } }));
    await expect(fetchCompanySearch("wip")).rejects.toThrow();
    stub(() => ({ status: 200, body: { companies: Array.from({ length: 11 }, () => searchRow("wipro")) } }));
    await expect(fetchCompanySearch("wip")).rejects.toThrow();
  });

  it("throws on a failed request", async () => {
    stub(() => ({ status: 500, body: { error: "boom" } }));
    await expect(fetchCompanySearch("wip")).rejects.toThrow();
  });
});

describe("useCompanySearch", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;

  it("waits 150 ms, needs one non-space character, and sends only the settled query", async () => {
    const fetchMock = stub(q => ({ status: 200, body: { companies: q.startsWith("w") ? [searchRow("wipro")] : [] } }));
    const { result, rerender } = renderHook(({ q }) => useCompanySearch(q, true), { wrapper, initialProps: { q: "   " } });
    await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 50));
    expect(searchCalls(fetchMock)).toEqual([]);
    expect(result.current.suggestions).toEqual([]);
    rerender({ q: "w" });
    rerender({ q: "wi" });
    rerender({ q: "wip" });
    expect(searchCalls(fetchMock)).toEqual([]);
    await waitFor(() => expect(result.current.suggestions.map(item => item.slug)).toEqual(["wipro"]));
    expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=wip"]);
    expect(result.current.noMatch).toBe(false);
  });

  it("does nothing when disabled", async () => {
    const fetchMock = stub(() => ({ status: 200, body: { companies: [] } }));
    renderHook(() => useCompanySearch("wipro", false), { wrapper });
    await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 50));
    expect(searchCalls(fetchMock)).toEqual([]);
  });
});

describe("switch on: typeahead on /explore", () => {
  beforeEach(() => { flag.on = true; });

  it("suggests companies as a combobox; arrow keys move, Enter opens /explore/:slug", async () => {
    stub(() => ({ status: 200, body: { companies: [searchRow("tcs"), searchRow("wipro")] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    const box = screen.getByRole("combobox", { name: "Search companies" });
    expect(box.getAttribute("aria-expanded")).toBe("false");
    fireEvent.change(box, { target: { value: "w" } });
    const listbox = await screen.findByRole("listbox", { name: "Company suggestions" });
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(box.getAttribute("aria-controls")).toBe(listbox.id);
    const options = within(listbox).getAllByRole("option");
    expect(options.map(option => option.textContent)).toEqual(["TCS", "Wipro"]);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(go).toHaveBeenCalledWith("/explore/wipro");
    expect(events).toEqual(["journey_company_suggested"]);
  });

  it("a click on a suggestion opens the company door; Escape closes the list", async () => {
    stub(() => ({ status: 200, body: { companies: [searchRow("merkle")] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    const box = screen.getByRole("combobox", { name: "Search companies" });
    fireEvent.change(box, { target: { value: "mer" } });
    const option = await screen.findByRole("option", { name: "Merkle" });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.change(box, { target: { value: "merk" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: "Merkle" }));
    expect(go).toHaveBeenCalledWith("/explore/merkle");
    expect(option).toBeTruthy();
  });

  it("no suggestion: the paste-a-link path comes first, Request a company stays the quiet link, and the event has no query text", async () => {
    stub(() => ({ status: 200, body: { companies: [] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "Zeta Labs" } });
    const primary = await screen.findByRole("link", { name: "Paste a Zeta Labs job link to request a referral" });
    expect(primary.getAttribute("href")).toBe("/ask");
    const quiet = screen.getAllByRole("link", { name: "Request a company" });
    expect(quiet).toHaveLength(1);
    expect(quiet[0].getAttribute("href")).toBe("/invite");
    expect(primary.compareDocumentPosition(quiet[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(events).toEqual(["journey_company_no_match"]);
    expect(events.join(" ")).not.toMatch(/zeta/i);
  });

  it("a failed search adds nothing: the client filter still works and no event fires", async () => {
    stub(() => ({ status: 500, body: { error: "boom" } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "tcs" } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 100)); });
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^1 company$/);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("link", { name: /job link to request a referral/ })).toBeNull();
    expect(events).toEqual([]);
  });
});
