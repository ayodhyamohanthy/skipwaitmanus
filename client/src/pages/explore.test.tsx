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
  routeState.slug = "wipro";
  authState.isSignedIn = true;
  sessionStorage.clear();
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Explore directory", () => {
  it("renders the kit directory from the server directory, reading nothing but GET /api/companies", async () => {
    const fetchMock = stubDirectory();
    renderWithQuery(<Explore />);
    expect(await screen.findByText("5 companies to explore")).toBeTruthy();
    expect(screen.getByText("FIVE OPEN DOORS · MORE TO COME")).toBeTruthy();
    expect(screen.getByText("PEOPLE ARE OPEN TO REQUESTS", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("PEOPLE OPEN TO REFERRALS")).toHaveLength(5);
    const doors = screen.getAllByRole("link", { name: /View open door/ });
    expect(doors.map(link => link.getAttribute("href"))).toEqual(["/explore/skipwait", "/explore/wipro", "/explore/go-neutrinos", "/explore/tcs", "/explore/merkle"]);
    expect(screen.queryByText(/open roles?/i)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(paths(fetchMock)).toEqual(["/api/companies"]);
  });

  it("counts only open companies and offers an alert for a door that is not open yet", async () => {
    stubDirectory(directoryOf([company("skipwait", false), company("wipro"), company("go-neutrinos", false), company("tcs"), company("merkle", false)]));
    renderWithQuery(<Explore />);
    expect(await screen.findByText("TWO OPEN DOORS · MORE TO COME")).toBeTruthy();
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    expect(screen.getAllByText("PEOPLE OPEN TO REFERRALS")).toHaveLength(2);
    const alerts = screen.getAllByRole("link", { name: /Get told when a door opens/ });
    expect(alerts).toHaveLength(3);
    expect(alerts.every(link => link.getAttribute("href") === "/alerts")).toBe(true);
    const skipwait = screen.getByRole("heading", { name: "skipwait.me" }).closest("article") as HTMLElement;
    expect(within(skipwait).queryByText("PEOPLE OPEN TO REFERRALS")).toBeNull();
    expect(within(skipwait).getByRole("link", { name: /View company/ }).getAttribute("href")).toBe("/explore/skipwait");
  });

  it("never claims open doors when no referrer is available", async () => {
    stubDirectory(directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, false))));
    renderWithQuery(<Explore />);
    expect(await screen.findByText("NO OPEN DOORS YET · MORE TO COME")).toBeTruthy();
    expect(screen.queryByText("PEOPLE ARE OPEN TO REQUESTS", { exact: false })).toBeNull();
    expect(screen.queryAllByText("PEOPLE OPEN TO REFERRALS")).toHaveLength(0);
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
  });

  it("shows a loading grid, then an error with Try again that recovers", async () => {
    let fail = true;
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => { await gate; if (fail) throw new TypeError("Failed to fetch"); return json(200, ALL_OPEN); }));
    renderWithQuery(<Explore />);
    expect(screen.getByLabelText("Loading companies").getAttribute("aria-busy")).toBe("true");
    expect(screen.queryByText(/companies to explore/)).toBeNull();
    release?.();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("We couldn’t load companies.");
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("5 companies to explore")).toBeTruthy();
  });

  it("filters by search, function and location, then clears back to every door", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByText("5 companies to explore");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "tcs" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wipro" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Product" } });
    expect(screen.getByText("2 companies to explore")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "India" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Neutrinos" })).toBeTruthy();
  });

  it("shows an honest empty state with live recovery links", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByText("5 companies to explore");
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "zzz-no-such-company" } });
    expect(screen.getByText("No matching doors yet")).toBeTruthy();
    expect(screen.getByText("Try a wider search.")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /View open door/ })).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Request a company/ }).getAttribute("href")).toBe("/invite");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
  });

  it("titles the page with the kit head built from the directory names", async () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    await screen.findByText("5 companies to explore");
    expect(document.title).toBe("Explore companies · skipwait.me");
    await waitFor(() => expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("Find people open to referral requests at skipwait.me, Wipro, Neutrinos, TCS, and Merkle."));
    expect(document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe("https://skipwait.me/explore");
  });

  it("links the employee band to the live referrer page", () => {
    stubDirectory();
    renderWithQuery(<Explore />);
    expect(screen.getByRole("link", { name: /I can refer/ }).getAttribute("href")).toBe("/referrer");
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
