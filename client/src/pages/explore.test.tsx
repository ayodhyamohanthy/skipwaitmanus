// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import type { PublicOpportunityPost } from "@shared/companyOpportunities";
import { TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { ASK_PREFILL_KEY } from "@/lib/askPrefill";
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
const post = (over: Partial<PublicOpportunityPost> = {}): PublicOpportunityPost => ({ id: 91, companyDomain: "wipro.com", kind: "hiring_now", roleTitle: "Product Designer", targetRoleUrl: "https://careers.wipro.com/jobs/1", location: "Bengaluru", compensation: null, walkInAt: null, walkInEndsAt: null, postedAt: "2026-10-10T09:00:00.000Z", expiresAt: "2026-11-09T09:00:00.000Z", poster: { kind: "anonymous" }, ...over });

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
// every listed company alphabetically (open ones are not pushed to the top),
// availability is the server's boolean, and selecting a row opens the ask
// drawer. The drawer's own flows live in exploreDrawer.test.tsx.
describe("Find a referral directory", () => {
  const rowNames = ["Merkle, open to requests", "Neutrinos, open to requests", "skipwait.me, open to requests", "TCS, open to requests", "Wipro, open to requests"];

  it("renders the goal directory in alphabetical order from GET /api/companies", async () => {
    const fetchMock = stubDirectory();
    renderWithQuery(<Explore />);
    expect(await screen.findByText("Where do you want a referral?")).toBeTruthy();
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^5 companies\s*·\s*5 open to requests$/);
    expect(screen.getAllByRole("button", { name: /(open to requests|not open yet)$/ }).map(row => row.getAttribute("aria-label"))).toEqual(rowNames);
    expect(screen.getAllByTestId("goal-availability").map(dot => dot.textContent)).toEqual(Array(5).fill("Open to requests"));
    // Never the comp's sample company, and no preview state.
    expect(screen.queryByText("Kestrel Pay")).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(companyPaths(fetchMock)).toEqual(["/api/companies"]);
    expect(document.querySelector("[data-skipwait-screen='find-a-referral']")).toBeTruthy();
  });

  it("counts open companies honestly and opens the drawer for a company that is not open yet", async () => {
    stubDirectory(directoryOf([company("skipwait", false), company("wipro"), company("go-neutrinos", false), company("tcs"), company("merkle", false)]));
    renderWithQuery(<Explore />);
    expect((await screen.findByTestId("goal-directory-summary")).textContent).toMatch(/^5 companies\s*·\s*2 open to requests$/);
    expect(screen.getAllByTestId("goal-availability").map(dot => dot.textContent).filter(text => text === "Not open yet")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Merkle, not open yet" }));
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
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^1 company\s*·\s*1 open to requests$/);
    expect(screen.queryByRole("button", { name: "Wipro, open to requests" })).toBeNull();
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByTestId("goal-filter-chip")).toHaveLength(12);
    const product = screen.getByRole("button", { name: "Product", pressed: false });
    fireEvent.click(product);
    expect(product.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^2 companies\s*·\s*2 open to requests$/);
    expect(screen.getAllByRole("button", { name: /^Product$/ })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "All companies" }));
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^5 companies\s*·\s*5 open to requests$/);
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
    expect(screen.queryAllByRole("button", { name: /open to requests$/ })).toHaveLength(0);
    expect(screen.getByRole("link", { name: "Request a company" }).getAttribute("href")).toBe("/invite");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("goal-directory-summary").textContent).toMatch(/^5 companies\s*·\s*5 open to requests$/);
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

  it("opens the drawer preselected from ?company= and closes back to /explore", async () => {
    searchState.value = "?company=wipro";
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("goal-directory-summary");
    expect(screen.getByRole("button", { name: "Wipro, open to requests" }).getAttribute("aria-current")).toBe("true");
    const drawer = await screen.findByTestId("goal-drawer");
    expect(within(drawer).getByRole("heading", { name: "Ask for a referral" })).toBeTruthy();
    expect(within(drawer).getByText("Wipro")).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());
    expect(go).toHaveBeenCalledWith("/explore", { replace: true });
  });
});

describe("Explore company detail", () => {
  it("renders the app 404 for a company that is not on skipwait.me", async () => {
    routeState.slug = "no-such-company";
    stubDirectory();
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByRole("heading", { name: "This door doesn't lead anywhere." })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Explore companies" }).getAttribute("href")).toBe("/explore");
    expect(screen.queryByRole("button", { name: /Ask for a referral/ })).toBeNull();
  });

  it("renders the kit door from GET /api/companies/:slug with an honest empty open-roles state", async () => {
    const fetchMock = stubDirectory();
    renderWithQuery(<ExploreCompany />);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Wipro.");
    expect(screen.getByText("PEOPLE OPEN TO REFERRAL REQUESTS", { exact: false }).textContent?.trim()).toBe("PEOPLE OPEN TO REFERRAL REQUESTS");
    expect(screen.getByText(/Find a role on the company’s own careers site/)).toBeTruthy();
    expect(screen.getByText("OPEN ROLES FROM VERIFIED EMPLOYEES")).toBeTruthy();
    expect(await screen.findByText("No open roles from employees yet.")).toBeTruthy();
    expect(screen.queryByText("Product Designer")).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(screen.getByRole("link", { name: /All companies/ }).getAttribute("href")).toBe("/explore");
    expect(paths(fetchMock)).toEqual(["/api/companies/wipro", "/api/companies/wipro/opportunities"]);
  });

  it("drops the availability pill when nobody at the company is open", async () => {
    stubDirectory(directoryOf([company("wipro", false)]));
    renderWithQuery(<ExploreCompany />);
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Wipro.");
    expect(screen.queryByText("PEOPLE OPEN TO REFERRAL REQUESTS", { exact: false })).toBeNull();
    expect(screen.getByRole("link", { name: /Get told when a door opens/ }).getAttribute("href")).toBe("/alerts");
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
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Wipro.");
  });

  it("titles the door with the kit head for that company", async () => {
    stubDirectory();
    renderWithQuery(<ExploreCompany />);
    await screen.findByRole("heading", { level: 1 });
    expect(document.title).toBe("Referrals at Wipro · skipwait.me");
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Request a private introduction to someone at Wipro. 3 free credits every month; extra asks use credits.");
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore/wipro");
  });
});

describe("Explore company open roles", () => {
  it("renders the posted roles from the company openings route with honest posters and ask links", async () => {
    const fetchMock = stubDirectory(ALL_OPEN, [
      post({ id: 91, poster: { kind: "firstName", firstName: "Asha" } }),
      post({ id: 92, kind: "walk_in", roleTitle: "Store Associate", targetRoleUrl: null, location: "Pune", walkInAt: "2026-10-22T05:30:00.000Z", walkInEndsAt: "2026-10-22T09:30:00.000Z", postedAt: "2026-10-12T09:00:00.000Z" }),
    ]);
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByRole("heading", { name: "Product Designer" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Store Associate" })).toBeTruthy();
    expect(screen.getByText("Posted by Asha")).toBeTruthy();
    expect(screen.getByText("Posted by a verified employee")).toBeTruthy();
    expect(screen.getByText(/^Walk-in · /)).toBeTruthy();
    expect(screen.getByText("Posted Oct 10")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: /Ask for a referral/ });
    expect(links.map(link => link.getAttribute("href"))).toEqual([
      "/ask?post=91&job=https%3A%2F%2Fcareers.wipro.com%2Fjobs%2F1",
      "/ask?post=92",
    ]);
    expect(paths(fetchMock)).toEqual(["/api/companies/wipro", "/api/companies/wipro/opportunities"]);
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
    expect((await screen.findByRole("heading", { level: 1 })).textContent).toBe("Wipro.");
    const alert = await screen.findByRole("alert", undefined, { timeout: 5000 });
    expect(alert.textContent).toContain("We couldn’t load open roles.");
    expect(screen.getByText(/Find a role on the company’s own careers site/)).toBeTruthy();
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByRole("heading", { name: "Product Designer" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Explore company request dialog", () => {
  let fetchMock: ReturnType<typeof stubDirectory>;
  beforeEach(() => { fetchMock = stubDirectory(); });
  const openDoor = async () => { renderWithQuery(<ExploreCompany />); fireEvent.click(await screen.findByRole("button", { name: /Ask for a referral/ })); };

  it("walks the kit steps and hands the draft to the real ask composer without sending", async () => {
    await openDoor();
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("REQUEST TO WIPRO")).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "Role" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Step 1 of 4")).toBeTruthy();
    expect(within(dialog).queryByText(/DESIGN PREVIEW/)).toBeNull();

    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("alert").textContent).toBe(TARGET_ROLE_URL_ERROR);
    expect(within(dialog).getByRole("heading", { name: "Role" })).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: " https://careers.wipro.com/jobs/1 " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Your fit" })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText("Why are you a strong fit?"), { target: { value: "Shipped a design system used by 40 teams." } });
    expect(within(dialog).getByText(`${"Shipped a design system used by 40 teams.".length} / 600`)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Privacy" })).toBeTruthy();
    expect(within(dialog).getByText("You stay in control.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Back/ }));
    expect(within(dialog).getByRole("heading", { name: "Your fit" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Review" })).toBeTruthy();
    expect(within(dialog).getByText("Job link + fit note + privacy choices")).toBeTruthy();
    expect(within(dialog).getByText("Ready")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: /Preview request/ }));
    expect(await within(dialog).findByRole("heading", { name: "Your request is ready." })).toBeTruthy();
    expect(go).not.toHaveBeenCalled();
    const saved = JSON.parse(sessionStorage.getItem(ASK_PREFILL_KEY) ?? "null");
    expect(saved).toMatchObject({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1", note: "Shipped a design system used by 40 teams." });
    // Nothing is sent as an ask: the door read, the openings read and the draft save, nothing else.
    expect(paths(fetchMock)).toEqual(["/api/companies/wipro", "/api/companies/wipro/opportunities", "/api/ask-drafts"]);
    fireEvent.click(within(dialog).getByRole("link", { name: /Write a full ask/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("holds Your fit until there is a note, so Review is always complete", async () => {
    await openDoor();
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    const fit = within(dialog).getByLabelText("Why are you a strong fit?");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.change(fit, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Your fit" })).toBeTruthy();
    expect(within(dialog).getByRole("alert").textContent).toBe("Add a short note on why you’re a strong fit.");
    expect(fit.getAttribute("aria-invalid")).toBe("true");
    fireEvent.change(fit, { target: { value: "Led checkout redesign." } });
    expect(within(dialog).queryByRole("alert")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByRole("heading", { name: "Review" })).toBeTruthy();
    expect(within(dialog).getByText("Job link + fit note + privacy choices")).toBeTruthy();
    expect(within(dialog).queryByText("Draft")).toBeNull();
    expect(go).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ASK_PREFILL_KEY)).toBeNull();
  });

  it("starts every new ask empty at Role", async () => {
    await openDoor();
    let dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/1" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    fireEvent.change(within(dialog).getByLabelText("Why are you a strong fit?"), { target: { value: "Led checkout redesign." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close request" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
    dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Role" })).toBeTruthy();
    expect((within(dialog).getByLabelText("Job posting link") as HTMLInputElement).value).toBe("");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/2" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect((within(dialog).getByLabelText("Why are you a strong fit?") as HTMLTextAreaElement).value).toBe("");
  });
});
