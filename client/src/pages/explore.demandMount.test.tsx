// @vitest-environment jsdom
// D-086.mount packet §5.3: the demand line and list are mounted behind the same
// switch as their components. Off (the shipped state) both pages render exactly
// as before and nothing reads /api/company-demand; on, the line sits outside any
// next-step block on the company page, adds no black commit, and the list shows
// only in the browse state without touching the directory's order.
//
// assertGoalPage is not called here: both pages satisfy it only after
// D-048-p3-live-review-find lands (this row's dependency), so this test pins the
// invariants the mount can break today and the row does not land before it.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { GOAL_NEXT_STEP_HEADING_ID } from "@/components/goal/GoalNextStep";

const { routeState, searchState, authState, accessState, flag } = vi.hoisted(() => ({
  routeState: { path: "/explore", slug: "wipro" },
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
  accessState: { status: "unverified" as "unverified" | "verified" | "signed-out" },
  flag: { publicOn: false },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => accessState }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [routeState.path, vi.fn()],
  useSearch: () => searchState.value,
  useRoute: () => [true, { slug: routeState.slug }],
}));
// The switch lives in the shared contract; the pages must not read more state.
vi.mock("@shared/companyDemand", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@shared/companyDemand")>();
  return { ...actual, get COMPANY_DEMAND_PUBLIC_ENABLED() { return flag.publicOn; } };
});

import Explore from "./Explore";
import ExploreCompany from "./ExploreCompany";

const company = (slug: string): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true };
};
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });

function stubFetch(demand: { list?: unknown; detail?: unknown } = {}) {
  const directory: CompanyDirectoryResponse = { companies: LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)), openCount: LAUNCH_COMPANY_SEED.length };
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path === "/api/company-demand") return json(200, demand.list ?? { companies: [] });
    if (path.startsWith("/api/company-demand/")) return json(200, demand.detail ?? { demand: { state: "none" } });
    if (path === "/api/companies") return json(200, directory);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: null });
    if (path === "/api/ask-drafts") return json(200, { draft: null });
    if (path.endsWith("/opportunities")) return json(200, { opportunities: [] });
    const slug = path.startsWith("/api/companies/") ? decodeURIComponent(path.slice("/api/companies/".length)) : "";
    const found = directory.companies.find(item => item.slug === slug);
    return found ? json(200, { company: found }) : json(404, { error: "This door doesn't lead anywhere" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const stubMatchMedia = () => vi.stubGlobal("matchMedia", (query: string) => ({
  matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
}));

const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const paths = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(call => String(call[0]));
const demandPaths = (fetchMock: ReturnType<typeof vi.fn>) => paths(fetchMock).filter(path => path.startsWith("/api/company-demand"));

beforeEach(() => {
  routeState.path = "/explore";
  routeState.slug = "wipro";
  searchState.value = "";
  authState.isLoaded = true;
  authState.isSignedIn = true;
  accessState.status = "unverified";
  flag.publicOn = false;
  sessionStorage.clear();
  stubMatchMedia();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("switch off (shipped state)", () => {
  it("the directory renders as before, with no demand read and no list", async () => {
    const fetchMock = stubFetch();
    renderWithQuery(<Explore />);
    expect(await screen.findByText("Where do you want a referral?")).toBeTruthy();
    expect(await screen.findByTestId("goal-directory-summary")).toBeTruthy();
    await waitFor(() => expect(paths(fetchMock)).toContain("/api/companies"));
    expect(demandPaths(fetchMock)).toEqual([]);
    expect(screen.queryByTestId("company-demand-list")).toBeNull();
  });

  it("the company page renders as before, with no demand read and no line", async () => {
    const fetchMock = stubFetch();
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByText("Ask a verified employee. Your name and resume stay private until they accept.")).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(demandPaths(fetchMock)).toEqual([]);
    expect(screen.queryByTestId("company-demand-line")).toBeNull();
  });
});

describe("switch on (mocked payload)", () => {
  it("the line renders below the hero and outside any next-step block, adding no black commit", async () => {
    flag.publicOn = true;
    stubFetch({ detail: { demand: { state: "count", people: 7 } } });
    const { container } = renderWithQuery(<ExploreCompany />);
    expect(await screen.findByText("Ask a verified employee. Your name and resume stay private until they accept.")).toBeTruthy();
    const line = await screen.findByTestId("company-demand-line");
    const nextStep = container.querySelector(`section[aria-labelledby="${GOAL_NEXT_STEP_HEADING_ID}"]`);
    if (nextStep) expect(nextStep.contains(line)).toBe(false);
    // The mount never adds a commit: the page's own primary count is unchanged.
    expect(container.querySelectorAll("[data-g-primary]").length).toBe(1);
  });

  it("the list renders in the browse state and is absent once a query is typed", async () => {
    flag.publicOn = true;
    stubFetch({ list: { companies: [{ slug: "wipro", name: "Wipro", demand: { state: "count", people: 4 } }] } });
    const first = renderWithQuery(<Explore />);
    expect(await screen.findByTestId("company-demand-list")).toBeTruthy();
    first.unmount();

    searchState.value = "q=wip";
    renderWithQuery(<Explore />);
    expect(await screen.findByText("Where do you want a referral?")).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(screen.queryByTestId("company-demand-list")).toBeNull();
  });

  it("the directory's order is unchanged and no extra black commit appears", async () => {
    flag.publicOn = true;
    stubFetch({ list: { companies: [{ slug: "wipro", name: "Wipro", demand: { state: "count", people: 4 } }] } });
    const { container } = renderWithQuery(<Explore />);
    const list = await screen.findByRole("list", { name: "Companies" });
    const before = Array.from(list.querySelectorAll("a")).map(row => row.getAttribute("aria-label"));
    await screen.findByTestId("company-demand-list");
    const after = Array.from(list.querySelectorAll("a")).map(row => row.getAttribute("aria-label"));
    expect(after).toEqual(before);
    expect(container.querySelectorAll("[data-g-primary]").length).toBe(0);
  });
});
