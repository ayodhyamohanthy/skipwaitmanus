// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

const JOBS = [
  { id: 1, title: "Product Designer", company: "Wipro", location: "Bengaluru", seniority: "Mid-level", workMode: "Hybrid", targetRoleUrl: "https://careers.wipro.com/jobs/1" },
  { id: 2, title: "Data Analyst", company: "wipro.com", location: "Remote", seniority: "Early career", workMode: "Remote", targetRoleUrl: "javascript:alert(1)" },
  { id: 3, title: "Staff Engineer", company: "TCS", location: "Pune", seniority: "Senior", workMode: "Onsite", targetRoleUrl: null },
];

type MockResponse = { ok: boolean; status?: number; json: () => Promise<unknown> };
const ok = (body: unknown): MockResponse => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number): MockResponse => ({ ok: false, status, json: async () => ({ error: "We could not load the job list right now" }) });

function renderWithQuery(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

beforeEach(() => {
  routeState.slug = "wipro";
  authState.isSignedIn = true;
  sessionStorage.clear();
  go.mockReset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Explore directory", () => {
  it("renders the kit directory from the launch set without any network counts", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<Explore />);
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    expect(screen.getByText("FIVE OPEN DOORS · MORE TO COME")).toBeTruthy();
    expect(screen.getAllByText("PEOPLE OPEN TO REFERRALS")).toHaveLength(5);
    const doors = screen.getAllByRole("link", { name: /View open door/ });
    expect(doors.map(link => link.getAttribute("href"))).toEqual(["/explore/skipwait", "/explore/wipro", "/explore/go-neutrinos", "/explore/tcs", "/explore/merkle"]);
    expect(screen.queryByText(/open roles?/i)).toBeNull();
    expect(screen.queryByText(/DESIGN PREVIEW|Preview state/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("filters by search, function and location, then clears back to every door", () => {
    render(<Explore />);
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "tcs" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Wipro" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Function"), { target: { value: "Product" } });
    expect(screen.getByText("2 companies to explore")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "India" } });
    expect(screen.getByText("1 company to explore")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Go Neutrinos" })).toBeTruthy();
  });

  it("shows an honest empty state with live recovery links", () => {
    render(<Explore />);
    fireEvent.change(screen.getByLabelText("Search companies"), { target: { value: "zzz-no-such-company" } });
    expect(screen.getByText("No matching doors yet")).toBeTruthy();
    expect(screen.getByText("Try a wider search.")).toBeTruthy();
    expect(screen.queryAllByRole("link", { name: /View open door/ })).toHaveLength(0);
    expect(screen.getByRole("link", { name: /Request a company/ }).getAttribute("href")).toBe("/suggest-company");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("5 companies to explore")).toBeTruthy();
  });

  it("links the employee band to the live referrer page", () => {
    render(<Explore />);
    expect(screen.getByRole("link", { name: /I can refer/ }).getAttribute("href")).toBe("/referrer");
  });
});

describe("Explore company detail", () => {
  it("states plainly when a company door is not open", () => {
    routeState.slug = "no-such-company";
    vi.stubGlobal("fetch", vi.fn());
    renderWithQuery(<ExploreCompany />);
    expect(screen.getByText("This door isn't open yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /All companies/ }).getAttribute("href")).toBe("/explore");
  });

  it("lists only this company's real roles and saves them through the saved-roles endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/saved-roles") return ok({ saved: [] });
      if (/\/api\/saved-roles\/\d+$/.test(url)) return ok({ saved: init?.method === "PUT" });
      return ok({ jobs: JOBS });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.getByText("Data Analyst")).toBeTruthy();
    expect(screen.queryByText("Staff Engineer")).toBeNull();
    expect(screen.getByText(/PEOPLE OPEN TO REFERRAL REQUESTS · 2 OPEN ROLES LISTED/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2 open roles" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Product Designer posting" }).getAttribute("href")).toBe("https://careers.wipro.com/jobs/1");
    expect(screen.queryByRole("link", { name: "Open Data Analyst posting" })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Save Product Designer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/saved-roles/1", expect.objectContaining({ method: "PUT" })));
    fireEvent.click(await screen.findByRole("button", { name: "Unsave Product Designer" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/saved-roles/1", expect.objectContaining({ method: "DELETE" })));
    expect(await screen.findByRole("button", { name: "Save Product Designer" })).toBeTruthy();
  });

  it("keeps a role unsaved and says so when saving fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/saved-roles") return ok({ saved: [] });
      if (/\/api\/saved-roles\/\d+$/.test(url)) return fail(503);
      return ok({ jobs: JOBS });
    }));
    renderWithQuery(<ExploreCompany />);
    fireEvent.click(await screen.findByRole("button", { name: "Save Product Designer" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save Product Designer" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("hides save toggles from signed-out visitors and never reads saved roles", async () => {
    authState.isSignedIn = false;
    const fetchMock = vi.fn(async (_url: string) => ok({ jobs: JOBS }));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByText("Product Designer")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save Product Designer/ })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("saved-roles"))).toBe(false);
  });

  it("stays honest when a company has no listed roles", async () => {
    const fetchMock = vi.fn(async (url: string) => (url === "/api/saved-roles" ? ok({ saved: [] }) : ok({ jobs: [] })));
    vi.stubGlobal("fetch", fetchMock);
    renderWithQuery(<ExploreCompany />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/api/jobs?query=Wipro"), expect.anything()));
    await waitFor(() => expect(screen.queryByLabelText("Open roles at Wipro")).toBeNull());
    expect(screen.queryByText(/OPEN ROLES? LISTED/)).toBeNull();
    expect(screen.getByText("PEOPLE OPEN TO REFERRAL REQUESTS")).toBeTruthy();
    expect(screen.getByText(/Find a role on the company’s own careers site/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ask for a referral/ })).toBeTruthy();
  });

  it("states a roles failure and recovers on retry", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/saved-roles") return ok({ saved: [] });
      calls += 1;
      return calls <= 2 ? fail(500) : ok({ jobs: JOBS });
    }));
    renderWithQuery(<ExploreCompany />);
    expect(await screen.findByText(/We could not load listed roles right now\./, undefined, { timeout: 4000 })).toBeTruthy();
    expect(screen.queryByText(/OPEN ROLES? LISTED/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Product Designer")).toBeTruthy();
  });
});

describe("Explore company request dialog", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/saved-roles" ? ok({ saved: [] }) : ok({ jobs: [] })))); });

  it("walks the kit steps and hands the draft to the real ask composer without sending", async () => {
    renderWithQuery(<ExploreCompany />);
    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
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
    expect(go).toHaveBeenCalledWith("/ask");
    const saved = JSON.parse(sessionStorage.getItem(ASK_PREFILL_KEY) ?? "null");
    expect(saved).toMatchObject({ companySlug: "wipro", targetRoleUrl: "https://careers.wipro.com/jobs/1", note: "Shipped a design system used by 40 teams." });
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("does not call a draft without a fit note ready", async () => {
    renderWithQuery(<ExploreCompany />);
    fireEvent.click(screen.getByRole("button", { name: /Ask for a referral/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Job posting link"), { target: { value: "https://careers.wipro.com/jobs/1" } });
    for (let step = 0; step < 3; step += 1) fireEvent.click(within(dialog).getByRole("button", { name: /Continue/ }));
    expect(within(dialog).getByText("Draft")).toBeTruthy();
    expect(within(dialog).queryByText("Ready")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close request" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(go).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ASK_PREFILL_KEY)).toBeNull();
  });
});
