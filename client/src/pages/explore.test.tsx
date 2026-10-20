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

const { go, routeState, authState } = vi.hoisted(() => ({
  go: vi.fn(),
  routeState: { slug: "wipro" },
  authState: { isSignedIn: true },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [`/explore/${routeState.slug}`, go],
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

function stubDirectory(directory: CompanyDirectoryResponse = ALL_OPEN, opportunities: PublicOpportunityPost[] = []) {
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path === "/api/companies") return json(200, directory);
    if (path === "/api/ask-drafts") return json(200, { draft: { companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1", note: "Shipped a design system used by 40 teams.", updatedAt: "x" } });
    if (path.endsWith("/opportunities")) return json(200, { opportunities });
    const slug = path.startsWith("/api/companies/") ? decodeURIComponent(path.slice("/api/companies/".length)) : "";
    const found = directory.companies.find(item => item.slug === slug);
    return found ? json(200, { company: found }) : json(404, { error: "This door doesn't lead anywhere" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const paths = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.map(call => String(call[0]));

beforeEach(() => {
  // jsdom has no matchMedia; GoalDrawer's useIsDesktop needs it (desktop = true).
  window.matchMedia = window.matchMedia ?? ((query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList);
  routeState.slug = "wipro";
  authState.isSignedIn = true;
  sessionStorage.clear();
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Explore directory", () => {
  // design/goal-ui/pick/find-a-referral + content.json screenA: rows, one chip
  // toolbar, comp copy verbatim, alphabetical sort, availability ink vs muted.
  it("renders the goal directory from the server directory, reading nothing but GET /api/companies", async () => {
    const fetchMock = stubDirectory();
    renderWithQuery(<Explore />);
    expect(await screen.findByText("Where do you want a referral?")).toBeTruthy();
    expect(screen.getByText("Ask a verified employee. Your name and resume stay private until they accept.")).toBeTruthy();
    expect((await screen.findByTestId("explore-summary")).textContent).toBe("5 companies · 5 open to requests");
    const rows = screen.getAllByTestId("goal-list-row");
    expect(rows).toHaveLength(5);
    // Alphabetical (content.json screenA.sort): open companies are not pushed up.
    const hrefs = rows.map(row => row.querySelector("a")?.getAttribute("href"));
    expect(hrefs).toEqual(["/explore/go-neutrinos", "/explore/merkle", "/explore/skipwait", "/explore/tcs", "/explore/wipro"]);
    expect(screen.getAllByTestId("goal-availability").map(el => el.textContent)).toEqual(Array(5).fill("Open to requests"));
    expect(screen.queryByText(/open roles?/i)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(paths(fetchMock)).toEqual(["/api/companies"]);
  });

  it("marks a closed company Not open yet with no alert action in the row", async () => {
    stubDirectory(directoryOf([company("skipwait", false), company("wipro")]));
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    expect(screen.getByTestId("explore-summary").textContent).toBe("2 companies · 1 open to requests");
    expect(screen.getAllByTestId("goal-availability").map(el => el.textContent).sort()).toEqual(["Not open yet", "Open to requests"]);
    // content.json screenA.notOpenAction: the alert lives on the detail, never in list rows.
    expect(screen.queryByRole("link", { name: /Get told when/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /alerts/ })).toBeNull();
  });

  it("filters with the chip toolbar and resets with All companies", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    const chips = screen.getAllByTestId("goal-filter-chip");
    expect(chips.map(chip => chip.textContent)).toEqual(["All companies", "Open to requests", "Engineering", "Product & design"]);
    fireEvent.click(screen.getByRole("button", { name: "Engineering" }));
    expect(screen.getByTestId("explore-summary").textContent).toBe("4 companies · 4 open to requests");
    expect(screen.queryByText("Merkle")).toBeNull();
    // Chips combine: Engineering ∩ Product & design keeps only companies with both.
    fireEvent.click(screen.getByRole("button", { name: "Product & design" }));
    expect(screen.getByTestId("explore-summary").textContent).toBe("2 companies · 2 open to requests");
    expect(screen.getByText("Go Neutrinos")).toBeTruthy();
    expect(screen.getByText("skipwait.me")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All companies" }));
    expect(screen.getByTestId("explore-summary").textContent).toBe("5 companies · 5 open to requests");
  });

  it("filters by the search box, then clears back to every company", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "wipro" } });
    expect(screen.getByTestId("explore-summary").textContent).toBe("1 company · 1 open to requests");
    expect(screen.queryByText("TCS")).toBeNull();
  });

  it("shows an honest empty state with a clear-filters recovery", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "zzz-no-such-company" } });
    expect(screen.getByTestId("explore-summary").textContent).toBe("0 companies · 0 open to requests");
    expect(screen.getByText("Try a wider search.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByTestId("explore-summary").textContent).toBe("5 companies · 5 open to requests");
  });

  it("shows loading rows, then an error with Try again that recovers", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const path = String(input);
      if (path === "/api/companies") return json(503, { error: "temporarily unavailable" });
      return json(404, { error: "not found" });
    }));
    renderWithQuery(<Explore />);
    expect(screen.getByLabelText("Loading companies").getAttribute("aria-busy")).toBe("true");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load companies.");
    stubDirectory();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByTestId("explore-summary")).toBeTruthy();
  });

  it("opens the ask drawer from a row for an open company, and the alert offer for a closed one", async () => {
    stubDirectory(directoryOf([company("wipro"), company("merkle", false)]));
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    // Open company: the comp's ask drawer with its verified line and cost footer.
    fireEvent.click(screen.getByText("Wipro"));
    expect(await screen.findByText("Ask for a referral")).toBeTruthy();
    expect(screen.getByText(/Goes to verified Wipro employees/)).toBeTruthy();
    expect(screen.getByText(/Comes back if you withdraw before anyone picks it up/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send ask" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    // Closed company: no ask form - the Resy-notify offer (content.json notOpenAction).
    fireEvent.click(screen.getByText("Merkle"));
    expect(await screen.findByText(/Nobody at Merkle can take a new ask right now/)).toBeTruthy();
    // Trust blue never lies: the verified line is suppressed for a closed company.
    expect(screen.queryByText(/Goes to verified Merkle employees/)).toBeNull();
    expect(screen.getByText("An alert is not a referral.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send ask" })).toBeNull();
    // The CTA arms the company alert (POST /api/seeker-alerts), then lands on /alerts.
    const posts: Array<{ url: string; body: string }> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/seeker-alerts" && init?.method === "POST") { posts.push({ url, body: String(init.body) }); return new Response(JSON.stringify({ alert: { id: 1 } }), { status: 201, headers: { "Content-Type": "application/json" } }); }
      return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    fireEvent.click(screen.getByRole("button", { name: /Get told when a referrer joins/ }));
    await vi.waitFor(() => expect(posts.length).toBe(1));
    expect(JSON.parse(posts[0].body).companyDomain).toBe("merkle.com");
  });

  it("keeps a See open roles entry to the live detail page (D-022) inside the drawer", async () => {
    stubDirectory(directoryOf([company("wipro")]));
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    fireEvent.click(screen.getByText("Wipro"));
    await screen.findByText("Ask for a referral");
    const link = screen.getByRole("link", { name: "See open roles" });
    expect(link.getAttribute("href")).toBe("/explore/wipro");
  });

  it("keeps the row href for the live company detail page", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    const row = screen.getAllByTestId("goal-list-row")[0].querySelector("a");
    expect(row?.getAttribute("href")).toBe("/explore/go-neutrinos");
  });

  it("titles the page with the kit head built from the directory names", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByTestId("explore-summary");
    expect(document.title).toBe("Explore companies · skipwait.me");
    await waitFor(() => expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Find people open to referral requests at skipwait.me, Wipro, Go Neutrinos, TCS, and Merkle."));
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore");
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
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Request a private introduction to someone at Wipro. 3 asks free every month; more use credits.");
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
