// @vitest-environment jsdom
// D-174-seeker-journey-build.door-neutral (packet §6.1, rulings 1, 3 and 4;
// D-176): availability only routes a sent request, so the company door, the ask
// drawer and /ask must show the same state for a company the directory marks
// open and one it does not, before anything is sent. Nothing here may name
// availability: no "Not open yet", no "Ask anyway", no "No verified employee",
// no "Get told when a referrer joins".
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import ExploreCompany from "../ExploreCompany";
import Ask from "../Ask";

const { go, routeState, searchState, authState } = vi.hoisted(() => ({
  go: vi.fn(),
  routeState: { path: "/explore/wipro", slug: "wipro" },
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [routeState.path, go],
  useSearch: () => searchState.value,
  useRoute: () => [true, { slug: routeState.slug }],
}));

const company = (openToReferrals: boolean): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === "wipro")!;
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals };
};
const directoryOf = (openToReferrals: boolean): CompanyDirectoryResponse => ({ companies: [company(openToReferrals)], openCount: openToReferrals ? 1 : 0 });
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };

function stub(openToReferrals: boolean) {
  const directory = directoryOf(openToReferrals);
  const fetchMock = vi.fn(async (input: string) => {
    const path = String(input);
    if (path === "/api/companies") return json(200, directory);
    if (path.startsWith("/api/companies/") && path.endsWith("/opportunities")) return json(200, { opportunities: [] });
    if (path.startsWith("/api/companies/")) return json(200, { company: directory.companies[0] });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/ask-drafts") return json(200, { draft: null });
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderWithQuery = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const text = (element: Element | null) => (element?.textContent ?? "").replace(/\s+/g, " ").trim();
const FORBIDDEN = [/Not open yet/, /People open to referral requests/i, /Ask anyway/, /No verified employee/i, /Get told when a referrer joins/i];

beforeEach(() => {
  routeState.path = "/explore/wipro";
  routeState.slug = "wipro";
  searchState.value = "";
  authState.isLoaded = true;
  authState.isSignedIn = true;
  window.history.replaceState({}, "", "/explore/wipro");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function doorBody(openToReferrals: boolean): Promise<string> {
  stub(openToReferrals);
  renderWithQuery(<ExploreCompany />);
  await waitFor(() => expect(text(document.querySelector('[data-skipwait-screen="explore-company"]'))).toContain("Ask a verified employee"));
  return text(document.querySelector('[data-skipwait-screen="explore-company"]'));
}

async function drawerBody(openToReferrals: boolean): Promise<string> {
  stub(openToReferrals);
  renderWithQuery(<ExploreCompany />);
  await waitFor(() => expect(text(document.querySelector('[data-skipwait-screen="explore-company"]'))).toContain("Ask a verified employee"));
  fireEvent.click(screen.getByRole("button", { name: /referral/i }));
  const drawer = await screen.findByTestId("goal-drawer");
  return text(drawer);
}

async function askBody(openToReferrals: boolean): Promise<string> {
  searchState.value = "";
  stub(openToReferrals);
  renderWithQuery(<Ask />);
  const input = await screen.findByLabelText("Job link");
  fireEvent.change(input, { target: { value: "https://careers.wipro.com/jobs/1234567-product-designer" } });
  fireEvent.blur(input);
  await waitFor(() => expect(text(document.querySelector('[data-skipwait-screen="ask"]'))).toContain("Wipro"));
  return text(document.querySelector('[data-skipwait-screen="ask"]'));
}

describe("the same pre-send state for every company (D-176)", () => {
  it("renders the company door identically whether or not the directory marks the company open", async () => {
    const open = await doorBody(true);
    cleanup();
    const shut = await doorBody(false);
    expect(shut).toBe(open);
    for (const phrase of FORBIDDEN) expect(open, String(phrase)).not.toMatch(phrase);
  });

  it("renders the ask drawer identically, with one primary commit, for either company state", async () => {
    const open = await drawerBody(true);
    cleanup();
    const shut = await drawerBody(false);
    expect(shut).toBe(open);
    for (const phrase of FORBIDDEN) expect(open, String(phrase)).not.toMatch(phrase);
    expect(open).toContain("Goes to verified Wipro employees");
  });

  it("renders /ask identically for either company state", async () => {
    const open = await askBody(true);
    cleanup();
    const shut = await askBody(false);
    expect(shut).toBe(open);
    for (const phrase of FORBIDDEN) expect(open, String(phrase)).not.toMatch(phrase);
    expect(open).toContain("Goes to verified Wipro employees");
  });
});
