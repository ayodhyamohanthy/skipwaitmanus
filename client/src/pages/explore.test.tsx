// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import type { PublicOpportunityPost } from "@shared/companyOpportunities";


import Explore from "./Explore";
import ExploreCompany from "./ExploreCompany";

const { go, routeState, searchState, authState, accessState } = vi.hoisted(() => ({
  go: vi.fn(),
  routeState: { path: "/explore", slug: "wipro" },
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
  accessState: { status: "unverified" as "unverified" | "verified" | "signed-out" },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => accessState }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [routeState.path, go],
  useSearch: () => searchState.value,
  useRoute: () => [true, { slug: routeState.slug }],
}));

// The server directory (GET /api/companies) in its reference state: the five
// launch companies, each with a verified referrer open to requests.
const company = (slug: string, openToReferrals = true): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals };
};
const directoryOf = (companies: PublicCompany[]): CompanyDirectoryResponse => ({ companies, openCount: companies.filter(item => item.openToReferrals).length });
const ALL_OPEN = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)));
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
// D-022: one posted role as the public contract serves it. The company page's
// openings section reads /api/companies/:slug/opportunities, so the stub must
// answer that before the generic slug branch treats it as a company.
const post = (over: Partial<PublicOpportunityPost> = {}): PublicOpportunityPost => ({ id: 91, companyDomain: "wipro.com", kind: "hiring_now" as const, roleTitle: "Product Designer", targetRoleUrl: "https://careers.wipro.com/jobs/1", location: "Bengaluru", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-10T09:00:00.000Z", expiresAt: "2026-11-09T09:00:00.000Z", poster: { kind: "anonymous" as const }, ...over });

/** The goal shell reads the balance and the seeker's setup beside the directory. */
const setup = (resume: { id: number; fileName: string } | null = null) => ({ goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume });

function stubDirectory(directory: CompanyDirectoryResponse = ALL_OPEN, opportunities: PublicOpportunityPost[] = [], options: { credits?: number; resume?: { id: number; fileName: string } | null } = {}) {
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path === "/api/companies") return json(200, directory);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: options.credits ?? 4 } });
    if (path === "/api/profile/setup") return json(200, setup(options.resume ?? null));
    if (path === "/api/ask-drafts") return json(200, { draft: { companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1", note: "Shipped a design system used by 40 teams.", updatedAt: "x" } });
    if (path.endsWith("/opportunities")) return json(200, { opportunities });
    const slug = path.startsWith("/api/companies/") ? decodeURIComponent(path.slice("/api/companies/".length)) : "";
    const found = directory.companies.find(item => item.slug === slug);
    return found ? json(200, { company: found }) : json(404, { error: "This door doesn't lead anywhere" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const stubMatchMedia = (desktop = true) => vi.stubGlobal("matchMedia", (query: string) => ({
  matches: desktop, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false,
}));

const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const paths = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(call => String(call[0]));

beforeEach(() => {
  routeState.path = "/explore";
  routeState.slug = "wipro";
  searchState.value = "";
  authState.isLoaded = true;
  authState.isSignedIn = true;
  accessState.status = "unverified";
  sessionStorage.clear();
  stubMatchMedia();
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const companyPaths = (fetchMock: ReturnType<typeof vi.fn>) => paths(fetchMock).filter(path => path.startsWith("/api/companies"));

// Find a referral (design/goal-ui/pick/find-a-referral.*): the directory lists
// every listed company alphabetically with NO availability framing (D-176,
// owner Oct 24 - availability only routes the sent ask), and selecting a row
// opens the ask drawer. The drawer's own flows live in exploreDrawer.test.tsx.
describe("Find a referral directory", () => {
  const rowNames = ["Merkle", "Neutrinos", "skipwait.me", "TCS", "Wipro"];

  it("renders the goal directory in alphabetical order from GET /api/companies", async () => {
    const fetchMock = stubDirectory();
    renderWithQuery(<Explore />);
    expect(await screen.findByText("Where do you want a referral?")).toBeTruthy();
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^5 companies$/);
    const list = screen.getByRole("list", { name: "Companies" });
    expect(within(list).getAllByRole("link").map(row => row.getAttribute("aria-label"))).toEqual(rowNames);
    expect(screen.queryAllByTestId("goal-availability")).toHaveLength(0);
    // Never the comp's sample company, and no preview state.
    expect(screen.queryByText("Kestrel Pay")).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(companyPaths(fetchMock)).toEqual(["/api/companies"]);
    expect(document.querySelector("[data-skipwait-screen='find-a-referral']")).toBeTruthy();
  });

  it("shows no availability count for a mixed directory and still opens the drawer with the honest company state (D-176)", async () => {
    stubDirectory(directoryOf([company("skipwait", false), company("wipro"), company("go-neutrinos", false), company("tcs"), company("merkle", false)]));
    renderWithQuery(<Explore />);
    expect((await screen.findByTestId("goal-directory-summary")).textContent).toMatch(/^5 companies$/);
    expect(screen.queryAllByTestId("goal-availability")).toHaveLength(0);
    fireEvent.click(screen.getByRole("link", { name: "Merkle" }));
    const drawer = await screen.findByTestId("goal-drawer");
    expect(within(drawer).getByText("No verified employee at Merkle can take a new ask right now.")).toBeTruthy();
    expect(within(drawer).getByText("An alert is not a referral.")).toBeTruthy();
    expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe("No credit used until a verified employee can see it");
    expect(within(drawer).queryByTestId("goal-verified-mark")).toBeNull();
  });

  it("filters by search and job-function chips, then clears back to every company", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    const search = screen.getByRole("searchbox", { name: "Search companies" });
    fireEvent.change(search, { target: { value: "tcs" } });
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^1 company$/);
    expect(screen.queryByRole("link", { name: "Wipro" })).toBeNull();
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByTestId("goal-filter-chip")).toHaveLength(11);
    const product = screen.getByRole("button", { name: "Product", pressed: false });
    fireEvent.click(product);
    expect(product.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^2 companies$/);
    expect(screen.getAllByRole("button", { name: /^Product$/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "All companies" }));
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^5 companies$/);
  });

  it("shows a loading skeleton, then an honest error with Try again that recovers", async () => {
    let fail = true;
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; if (fail) throw new TypeError("Failed to fetch"); return json(200, ALL_OPEN); }));
    renderWithQuery(<Explore />);
    expect(screen.getByTestId("goal-skeleton-rows").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByTestId("goal-directory-summary")).toBeNull();
    release?.();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load companies.");
    expect(screen.queryByTestId("goal-directory-summary")).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByTestId("goal-directory-summary")).toBeTruthy();
  });

  it("shows an honest empty state with live recovery", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search companies" }), { target: { value: "zzz-no-such-company" } });
    expect(screen.getByText("No matching companies yet")).toBeTruthy();
    expect(screen.getByText("Try a wider search. If your company is missing, request it and we’ll open the door.")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /open to requests|not open yet/ })).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Request a company" }).getAttribute("href")).toBe("/invite");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^5 companies$/);
  });

  it("titles the page from the directory and keeps its canonical URL", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    await waitFor(() => expect(document.title).toBe("Find a referral · skipwait.me"));
    await waitFor(() => expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Find people open to referral requests at skipwait.me, Wipro, Neutrinos, TCS, and Merkle."));
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore");
  });

  it("keeps the referrer door on the goal shell", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    const give = screen.getAllByTestId("goal-give-referral");
    expect(give.length).toBeGreaterThan(0);
    expect(give[0].getAttribute("href")).toBe("/sign-in?intent=referrer&returnTo=%2Freferrer-setup");
  });

  it("says the balance failed to load instead of drawing 0 credits", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const path = String(input);
      if (path === "/api/companies") return json(200, ALL_OPEN);
      if (path.startsWith("/api/credits/summary")) return json(500, { error: "down" });
      if (path === "/api/profile/setup") return json(200, setup());
      return json(404, { error: "not found" });
    }));
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    await waitFor(() => expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).toContain("Balance didn't load"), { timeout: 3000 });
    expect(screen.getAllByTestId("goal-credits-pill")[0].textContent).not.toMatch(/\b0\b/);
  });

  it("never shows the credits pill to a verified referrer", async () => {
    accessState.status = "verified";
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    expect(screen.queryByTestId("goal-credits-pill")).toBeNull();
  });

  it("opens the drawer preselected from ?company= and closes back to /explore", async () => {
    searchState.value = "?company=wipro";
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    expect(screen.getByRole("link", { name: "Wipro" }).getAttribute("aria-current")).toBe("true");
    const drawer = await screen.findByTestId("goal-drawer");
    expect(within(drawer).getByRole("heading", { name: "Ask for a referral" })).toBeTruthy();
    expect(within(drawer).getByText("Wipro")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());
    expect(go).toHaveBeenCalledWith("/explore", { replace: true });
  });
});
const heroName = async () => {
  await waitFor(() => expect(document.querySelector('[data-skipwait-screen="explore-company"]')).toBeTruthy());
  return within(document.querySelector('[data-skipwait-screen="explore-company"]') as HTMLElement).getByRole("heading", { name: "Wipro" });
};

describe("Explore company door (goal, W2)", () => {
  it("renders the app 404 for a company that is not on skipwait.me", async () => {
    routeState.slug = "no-such-company";
    stubDirectory();
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByRole("heading", { name: "This door doesn't lead anywhere." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
    expect(screen.queryByRole("button", { name: /Ask for a referral/ })).toBeNull();
  });

  it("clicking a posted role opens the ask drawer in place with its job link prefilled (D-174)", async () => {
    const posts = [
      { id: 11, companyDomain: "wipro.com", kind: "hiring_now" as const, roleTitle: "Product Designer", targetRoleUrl: "https://careers.wipro.com/jobs/design", location: "Bengaluru", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-20T00:00:00.000Z", expiresAt: "2026-11-20T00:00:00.000Z", poster: { kind: "anonymous" as const } },
      { id: 12, companyDomain: "wipro.com", kind: "hiring_now" as const, roleTitle: "Backend Engineer", targetRoleUrl: "https://careers.wipro.com/jobs/backend", location: "Hyderabad", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-20T00:00:00.000Z", expiresAt: "2026-11-20T00:00:00.000Z", poster: { kind: "anonymous" as const } },
    ];
    stubDirectory(ALL_OPEN, posts);
    renderWithQuery(<ExploreCompany />);
    await heroName();
    const row = (await screen.findByText("Backend Engineer")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /Ask for a referral/ }));
    const drawer = await screen.findByTestId("goal-drawer");
    expect((within(drawer).getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.wipro.com/jobs/backend");
    // In place: the door never navigates to /ask.
    expect(go).not.toHaveBeenCalledWith(expect.stringContaining("/ask"), expect.anything());
  });

  it("a linkless post after a linked one never keeps the stale link or pass check, and carries no post identity (D-174 sequence)", async () => {
    const posts = [
      { id: 21, companyDomain: "wipro.com", kind: "hiring_now" as const, roleTitle: "Product Designer", targetRoleUrl: "https://careers.wipro.com/jobs/design", location: "Bengaluru", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-20T00:00:00.000Z", expiresAt: "2026-11-20T00:00:00.000Z", poster: { kind: "anonymous" as const } },
      { id: 22, companyDomain: "wipro.com", kind: "walk_in" as const, roleTitle: "Store Associate", targetRoleUrl: null, location: "Pune", compensation: null, walkInAt: "2026-10-26T05:30:00.000Z", walkInEndsAt: "2026-10-26T09:30:00.000Z", postedAt: "2026-10-20T00:00:00.000Z", expiresAt: "2026-11-20T00:00:00.000Z", poster: { kind: "anonymous" as const } },
    ];
    stubDirectory(ALL_OPEN, posts);
    renderWithQuery(<ExploreCompany />);
    await heroName();
    // Linked post first: its verified link fills the composer and passes the check.
    const linkedRow = (await screen.findByText("Product Designer")).closest("li") as HTMLElement;
    fireEvent.click(within(linkedRow).getByRole("button", { name: /Ask for a referral/ }));
    let drawer = await screen.findByTestId("goal-drawer");
    expect((within(drawer).getByLabelText("Job link") as HTMLInputElement).value).toBe("https://careers.wipro.com/jobs/design");
    expect(within(drawer).getByText(/Matches Wipro.{0,3}s careers site/)).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());
    // Then the linkless walk-in: the stale link and its pass check must be gone.
    const walkInRow = (await screen.findByText("Store Associate")).closest("li") as HTMLElement;
    fireEvent.click(within(walkInRow).getByRole("button", { name: /Ask for a referral/ }));
    drawer = await screen.findByTestId("goal-drawer");
    expect((within(drawer).getByLabelText("Job link") as HTMLInputElement).value).toBe("");
    expect(within(drawer).queryByText(/Matches Wipro.{0,3}s careers site/)).toBeNull();
  });

  it("filters the company's posted roles by role or location text, then clears (D-174)", async () => {
    const posts = [
      { id: 11, companyDomain: "wipro.com", kind: "hiring_now" as const, roleTitle: "Product Designer", targetRoleUrl: null, location: "Bengaluru", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-20T00:00:00.000Z", expiresAt: "2026-11-20T00:00:00.000Z", poster: { kind: "anonymous" as const } },
      { id: 12, companyDomain: "wipro.com", kind: "hiring_now" as const, roleTitle: "Backend Engineer", targetRoleUrl: null, location: "Hyderabad", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-20T00:00:00.000Z", expiresAt: "2026-11-20T00:00:00.000Z", poster: { kind: "anonymous" as const } },
    ];
    stubDirectory(ALL_OPEN, posts);
    renderWithQuery(<ExploreCompany />);
    await heroName();
    await screen.findByText("Product Designer");
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter roles" }), { target: { value: "hyder" } });
    expect(screen.queryByText("Product Designer")).toBeNull();
    expect(screen.getByText("Backend Engineer")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Filter roles" }), { target: { value: "zzz" } });
    expect(screen.getByText("No roles match that filter.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));
    expect(screen.getByText("Product Designer")).toBeTruthy();
    expect(screen.getByText("Backend Engineer")).toBeTruthy();
  });

  it("renders the goal door from GET /api/companies/:slug: availability, goal line, one black commit, cost sentence", async () => {
    const fetchMock = stubDirectory();
    renderWithQuery(<ExploreCompany />);
    expect(await heroName()).toBeTruthy();
    expect(screen.getByText("People open to referral requests")).toBeTruthy();
    expect(screen.getByText("Ask a verified employee. Your name and resume stay private until they accept.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask for a referral" }).getAttribute("data-g-primary")).toBe("true");
    expect(screen.getByText("3 free referrals every month; extra asks use credits.")).toBeTruthy();
    // Company mark is initials, never a logo; functions join the hero, not the old kit meta.
    expect(screen.getByText("W", { exact: true })).toBeTruthy();
    expect(screen.getByText(/Find a role on the company’s own careers site/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Open roles from verified employees" })).toBeTruthy();
    expect(await screen.findByText(/No open roles from employees yet/)).toBeTruthy();
    expect(screen.getByText("What is shared, and when?")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Read safety guide/ }).getAttribute("href")).toBe("/safety");
    expect(screen.getByRole("link", { name: /All companies/ }).getAttribute("href")).toBe("/explore");
    // Numbered ask-quality points, mono, verbatim copy.
    expect(screen.getByText("01")).toBeTruthy();
    expect(screen.getByText("Use the exact job link")).toBeTruthy();
    expect(screen.getByText("Make your fit easy to see")).toBeTruthy();
    expect(screen.getByText("Respect the decision")).toBeTruthy();
    // No kit chrome survives.
    expect(document.querySelector(".company-page, .company-hero, .privacy-preview")).toBeNull();
    expect(companyPaths(fetchMock)).toEqual(["/api/companies/wipro", "/api/companies/wipro/opportunities"]);
  });

  it("not open: ring dot with Not open yet, a quiet Alert me link, and a ghost Ask anyway that states the wait honestly", async () => {
    stubDirectory(directoryOf([company("wipro", false)]));
    renderWithQuery(<ExploreCompany />);
    expect(await heroName()).toBeTruthy();
    expect(screen.queryByText("People open to referral requests")).toBeNull();
    expect(screen.getByText("Not open yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Alert me" }).getAttribute("href")).toBe("/alerts");
    const commit = screen.getByRole("button", { name: "Ask anyway" });
    expect(commit.getAttribute("data-g-primary")).toBeNull();
    expect(screen.getByText(/waits free until one can/)).toBeTruthy();
    expect(screen.queryByText(/3 free referrals every month/)).toBeNull();
  });

  it("explains a failed load with Try again instead of a 404", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => { if (fail) throw new TypeError("Failed to fetch"); if (String(input).endsWith("/opportunities")) return json(200, { opportunities: [] }); return json(200, { company: company("wipro") }); }));
    renderWithQuery(<ExploreCompany />);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load this company.");
    expect(screen.queryByRole("heading", { name: "This door doesn't lead anywhere." })).toBeNull();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await heroName()).toBeTruthy();
  });

  it("titles the door with the company name for SEO", async () => {
    stubDirectory();
    renderWithQuery(<ExploreCompany />);
    await screen.findByRole("heading", { level: 1 });
    expect(document.title).toBe("Referrals at Wipro · skipwait.me");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Request a private introduction to someone at Wipro. 3 free referrals every month; extra asks use credits.");
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore/wipro");
  });

  it("renders open roles as rows with mono posted dates, honest posters and in-place ask actions (D-174)", async () => {
    stubDirectory(ALL_OPEN, [
      post({ id: 91, poster: { kind: "firstName", firstName: "Asha" } }),
      post({ id: 92, kind: "walk_in", roleTitle: "Store Associate", targetRoleUrl: null, location: "Pune", walkInAt: "2026-10-22T05:30:00.000Z", walkInEndsAt: "2026-10-22T09:30:00.000Z", postedAt: "2026-10-12T09:00:00.000Z" }),
    ]);
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.getByText("Store Associate")).toBeTruthy();
    expect(screen.getByText(/Posted by Asha/)).toBeTruthy();
    expect(screen.getByText(/Posted by a verified employee/)).toBeTruthy();
    expect(screen.getByText(/Walk-in · /)).toBeTruthy();
    expect(screen.getByText(/Posted Oct 10/)).toBeTruthy();
    // D-174: picking a role asks in place on the door - buttons, not /ask links.
    const asks = screen.getAllByRole("button", { name: /Ask for a referral/ });
    expect(asks).toHaveLength(3); // one door commit + one per role row
    expect(screen.queryByRole("link", { name: /Ask for a referral/ })).toBeNull();
  });

  it("shows a failed openings read as retryable and never blocks the rest of the door", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const path = String(input);
      if (path === "/api/companies/wipro/opportunities") { if (fail) throw new TypeError("Failed to fetch"); return json(200, { opportunities: [post()] }); }
      if (path === "/api/companies/wipro") return json(200, { company: company("wipro") });
      return json(404, { error: "not found" });
    }));
    renderWithQuery(<ExploreCompany />);
    expect(await heroName()).toBeTruthy();
    const alert = await screen.findByRole("alert", undefined, { timeout: 5000 });
    expect(alert.textContent).toContain("We couldn’t load open roles.");
    expect(screen.getByText(/Find a role on the company’s own careers site/)).toBeTruthy();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("the black commit opens the W1 ask drawer in place with the saved draft prefilled", async () => {
    stubDirectory();
    renderWithQuery(<ExploreCompany />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask for a referral" }));
    const drawer = await screen.findByTestId("goal-drawer");
    expect(within(drawer).getByText("Wipro")).toBeTruthy();
    // The remote draft for wipro fills the job link; nothing is sent.
    await waitFor(() => expect((within(drawer).getByLabelText(/Job link/) as HTMLInputElement).value).toBe("https://careers.wipro.com/jobs/1"));
  });
});
