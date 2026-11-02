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

const { go, flag, events, eventArgs } = vi.hoisted(() => ({
  go: vi.fn(),
  flag: { on: false },
  events: [] as string[],
  /** Every argument every event was sent with, serialised: the no-query-text check reads this. */
  eventArgs: [] as string[],
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
  trackClarityEvent: (...args: unknown[]) => { events.push(String(args[0])); eventArgs.push(JSON.stringify(args)); },
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

type SearchAnswer = { status: number; body: unknown };
function stub(search: (q: string) => SearchAnswer | Promise<SearchAnswer>) {
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path === "/api/companies") return json(200, DIRECTORY);
    if (path.startsWith("/api/companies/search?")) {
      const q = new URL(path, "http://x").searchParams.get("q") ?? "";
      const answer = await search(q);
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
/** D-176: before sending, no company reads as open or not open, in any typeahead state. */
const AVAILABILITY = /availab|open to referrals|not open|\bopen now\b|\d+\s+open\b|referrers? (?:is |are )?(?:online|ready|free)|no one (?:is )?(?:here|available)/i;
const expectNoAvailabilityText = () => expect(document.body.textContent ?? "").not.toMatch(AVAILABILITY);
/** Events carry names only: no argument may hold the typed query, in any case. */
const expectNoQueryInEvents = (query: string) => {
  for (const args of eventArgs) expect(args.toLowerCase()).not.toContain(query.trim().toLowerCase());
  for (const args of eventArgs) expect(JSON.parse(args)).toHaveLength(1);
};

beforeEach(() => {
  flag.on = false;
  events.length = 0;
  eventArgs.length = 0;
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
    expectNoAvailabilityText();
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
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[1].id);
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "ArrowUp" });
    expect(box.getAttribute("aria-activedescendant")).toBe(options[0].id);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(go).toHaveBeenCalledWith("/explore/wipro");
    expect(events).toEqual(["journey_company_suggested"]);
    expectNoAvailabilityText();
    expectNoQueryInEvents("w");
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
    expectNoAvailabilityText();
    expectNoQueryInEvents("Zeta Labs");
  });

  it("loading: while the settled query is in flight a Searching line renders (busy), with no availability text and no event", async () => {
    let release: (answer: SearchAnswer) => void = () => {};
    const fetchMock = stub(() => new Promise<SearchAnswer>(resolve => { release = resolve; }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "tata" } });
    const loading = await screen.findByTestId("company-search-loading");
    expect(loading.getAttribute("aria-busy")).toBe("true");
    expect(loading.textContent).toContain("Searching companies");
    await waitFor(() => expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=tata"]));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expectNoAvailabilityText();
    expect(events).toEqual([]);
    await act(async () => { release({ status: 200, body: { companies: [searchRow("tcs")] } }); });
    await screen.findByRole("option", { name: "TCS" });
    expect(screen.queryByTestId("company-search-loading")).toBeNull();
    expectNoAvailabilityText();
    expectNoQueryInEvents("tata");
  });

  it("error: a failed search shows a retry line, the client filter still works, no event fires, and Try again re-runs the search", async () => {
    let fail = true;
    const fetchMock = stub(() => (fail ? { status: 500, body: { error: "boom" } } : { status: 200, body: { companies: [searchRow("tcs")] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "tcs" } });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t search companies.");
    const retry = within(alert).getByRole("button", { name: "Try again" });
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^1 company$/);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByRole("link", { name: /job link to request a referral/ })).toBeNull();
    expect(screen.queryByTestId("company-search-loading")).toBeNull();
    expect(events).toEqual([]);
    expectNoAvailabilityText();
    expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=tcs"]);
    fail = false;
    fireEvent.click(retry);
    await screen.findByRole("option", { name: "TCS" });
    expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=tcs", "/api/companies/search?q=tcs"]);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(events).toEqual(["journey_company_suggested"]);
    expectNoAvailabilityText();
    expectNoQueryInEvents("tcs");
  });

  it("empty: a blank box asks nothing and shows no search state; an answer with no company shows the no-match path, with no availability text", async () => {
    const fetchMock = stub(() => ({ status: 200, body: { companies: [] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    const box = screen.getByRole("combobox", { name: "Search companies" });
    fireEvent.change(box, { target: { value: "   " } });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 100)); });
    expect(searchCalls(fetchMock)).toEqual([]);
    expect(screen.queryByTestId("company-search-loading")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.queryByTestId("company-search-no-match")).toBeNull();
    expect(events).toEqual([]);
    fireEvent.change(box, { target: { value: "Qwerty Works" } });
    const empty = await screen.findByTestId("company-search-no-match");
    expect(within(empty).getByRole("link", { name: "Paste a Qwerty Works job link to request a referral" }).getAttribute("href")).toBe("/ask");
    expect(screen.queryByTestId("company-search-loading")).toBeNull();
    expect(events).toEqual(["journey_company_no_match"]);
    expectNoAvailabilityText();
    expectNoQueryInEvents("Qwerty Works");
  });
});

describe("switch on: search and directory filter stay distinct and truthful", () => {
  beforeEach(() => { flag.on = true; });
  const EMPTY_CLAIM = /No matching companies yet|If your company is missing/;
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 150)); });

  it("a function or industry query with matching directory rows is not 'unlisted': no paste-a-link path and no no-match event", async () => {
    stub(() => ({ status: 200, body: { companies: [] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "Engineering" } });
    await settle();
    await settle();
    expect(screen.getByTestId("goal-directory-summary").textContent).not.toMatch(/^0 /);
    expect(screen.queryByRole("link", { name: /job link to request a referral/ })).toBeNull();
    expect(screen.queryByTestId("company-search-no-match")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(EMPTY_CLAIM);
    expect(events).toEqual([]);
    expectNoAvailabilityText();
  });

  it("an alias suggestion (tata -> TCS) with an empty directory filter never shows the empty-directory claim", async () => {
    stub(() => ({ status: 200, body: { companies: [searchRow("tcs")] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "tata" } });
    await screen.findByRole("option", { name: "TCS" });
    expect(document.body.textContent ?? "").not.toMatch(EMPTY_CLAIM);
    expect(screen.queryByTestId("company-search-no-match")).toBeNull();
    expect(events).toEqual(["journey_company_suggested"]);
    expectNoQueryInEvents("tata");
  });

  it("while the search is in flight the directory makes no empty claim", async () => {
    stub(() => new Promise<SearchAnswer>(() => {}));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "zzqx" } });
    await screen.findByTestId("company-search-loading");
    await settle();
    expect(screen.getByTestId("company-search-loading")).toBeTruthy();
    expect(document.body.textContent ?? "").not.toMatch(EMPTY_CLAIM);
    expect(screen.queryByTestId("company-search-no-match")).toBeNull();
    expect(events).toEqual([]);
  });

  it("after a failed search the directory makes no empty claim; only the retry line speaks", async () => {
    stub(() => ({ status: 500, body: {} }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "zzqx" } });
    await screen.findByRole("alert");
    expect(document.body.textContent ?? "").not.toMatch(EMPTY_CLAIM);
    expect(screen.queryByTestId("company-search-no-match")).toBeNull();
    expect(events).toEqual([]);
  });

  it("a real no-match (server empty and directory empty) still offers the paste-a-link path with the directory empty state", async () => {
    stub(() => ({ status: 200, body: { companies: [] } }));
    renderExplore();
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("combobox", { name: "Search companies" }), { target: { value: "zzqx" } });
    await screen.findByTestId("company-search-no-match");
    expect(screen.getByText("No matching companies yet")).toBeTruthy();
    expect(events).toEqual(["journey_company_no_match"]);
  });
});

describe("useCompanySearch states", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client()}>{children}</QueryClientProvider>;

  it("idle for a blank box, loading while settling and in flight, then ready", async () => {
    let release: (answer: SearchAnswer) => void = () => {};
    const fetchMock = stub(() => new Promise<SearchAnswer>(resolve => { release = resolve; }));
    const { result, rerender } = renderHook(({ q }) => useCompanySearch(q, true), { wrapper, initialProps: { q: "" } });
    expect(result.current.status).toBe("idle");
    rerender({ q: "wip" });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=wip"]));
    expect(result.current.query).toBe("wip");
    expect(result.current.status).toBe("loading");
    await act(async () => { release({ status: 200, body: { companies: [searchRow("wipro")] } }); });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.suggestions.map(item => item.slug)).toEqual(["wipro"]);
  });

  it("error on a failed request; retry re-runs the same query", async () => {
    let fail = true;
    const fetchMock = stub(() => (fail ? { status: 503, body: {} } : { status: 200, body: { companies: [] } }));
    const { result } = renderHook(() => useCompanySearch("zeta", true), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.noMatch).toBe(false);
    fail = false;
    act(() => { result.current.retry(); });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.noMatch).toBe(true);
    expect(searchCalls(fetchMock)).toEqual(["/api/companies/search?q=zeta", "/api/companies/search?q=zeta"]);
  });

  it("idle and sends nothing when the switch is off", async () => {
    const fetchMock = stub(() => ({ status: 200, body: { companies: [] } }));
    const { result } = renderHook(() => useCompanySearch("zeta", false), { wrapper });
    await new Promise(resolve => setTimeout(resolve, COMPANY_SEARCH_DEBOUNCE_MS + 50));
    expect(result.current.status).toBe("idle");
    expect(searchCalls(fetchMock)).toEqual([]);
  });
});
