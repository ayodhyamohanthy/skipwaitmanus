// @vitest-environment jsdom
// D-174-seeker-journey-build.door-neutral (packet §6.1, rulings 1, 3 and 4;
// D-176): availability only routes a sent request, so the company door, the ask
// drawer and /ask must show the same state for a company the directory marks
// open and one it does not, before anything is sent. Nothing here may name
// availability: no "Not open yet", no "Ask anyway", no "No verified employee",
// no "Get told when a referrer joins".
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import ExploreCompany from "../ExploreCompany";
import Ask from "../Ask";
import { useAskComposer } from "./useAskComposer";

const { go, routeState, searchState, authState, trackEvent } = vi.hoisted(() => ({
  go: vi.fn(),
  trackEvent: vi.fn(),
  routeState: { path: "/explore/wipro", slug: "wipro" },
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/clarity", () => ({ trackClarityEvent: trackEvent }));
vi.mock("@/lib/goalFlags", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/goalFlags")>(),
  get ASK_LEVEL_COST_CLIENT() { return import.meta.env.VITE_ASK_LEVEL_COST === "true"; },
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

function stub(openToReferrals: boolean, options: { balance?: number; sendStatus?: number; sendBody?: object; quoteStatus?: "ready" | "pending" | "error" } = {}) {
  const directory = directoryOf(openToReferrals);
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    if (path.startsWith("/api/company-referrals/quote")) {
      if (options.quoteStatus === "pending") return new Promise<Response>(() => {});
      return json(options.quoteStatus === "error" ? 500 : 200, { cost: 1, totalAvailable: options.balance ?? 3, shortfall: options.balance === 0 ? 1 : 0 });
    }
    if (path === "/api/company-referrals" && init?.method === "POST") return json(options.sendStatus ?? 201, options.sendBody ?? { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible" });
    if (path === "/api/work-items") return json(200, { items: [] });
    if (path === "/api/companies") return json(200, directory);
    if (path.startsWith("/api/companies/") && path.endsWith("/opportunities")) return json(200, { opportunities: [] });
    if (path.startsWith("/api/companies/")) return json(200, { company: directory.companies[0] });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: options.balance ?? 4 } });
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
  sessionStorage.clear();
  localStorage.clear();
  trackEvent.mockReset();
  vi.stubEnv("VITE_ASK_LEVEL_COST", "false");
  window.history.replaceState({}, "", "/explore/wipro");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

async function doorBody(openToReferrals: boolean): Promise<string> {
  stub(openToReferrals);
  renderWithQuery(<ExploreCompany />);
  await waitFor(() => expect(text(document.querySelector('[data-skipwait-screen="explore-company"]'))).toContain("One request to a verified employee"));
  return text(document.querySelector('[data-skipwait-screen="explore-company"]'));
}

async function drawerBody(openToReferrals: boolean): Promise<string> {
  stub(openToReferrals);
  renderWithQuery(<ExploreCompany />);
  await waitFor(() => expect(text(document.querySelector('[data-skipwait-screen="explore-company"]'))).toContain("One request to a verified employee"));
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

function renderComposer(openToReferrals: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useAskComposer(company(openToReferrals)), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

async function fillComposer(result: ReturnType<typeof renderComposer>["result"]) {
  await waitFor(() => expect(result.current.resumeView?.name).toBe("ada-resume.pdf"));
  act(() => {
    result.current.onUrlChange("https://careers.wipro.com/jobs/1234567-product-designer");
    result.current.onReasonChange(0, "Led a checkout redesign that cut drop-off by eighteen percent.");
    result.current.onReasonChange(1, "Shipped a design system used by forty product teams.");
  });
}

const sentPosts = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([path, init]) => String(path) === "/api/company-referrals" && init?.method === "POST");

describe("composer routing presentation (D-176, D-180)", () => {
  it.each([0, 3])("uses identical cost, Send state and body for both availability values at balance %s", async balance => {
    const states: { line: string; blocked: string | undefined; body: string }[] = [];
    for (const open of [true, false]) {
      const fetchMock = stub(open, { balance });
      const { result } = renderComposer(open);
      await fillComposer(result);
      expect(result.current.cost.line).toBe("Uses 1 from your balance when a verified employee can see it");
      expect(result.current.sendBlocked).toBeUndefined();
      expect(result.current.topUp).toBeNull();
      expect(result.current.watch).toBeNull();
      act(() => result.current.send());
      await waitFor(() => expect(result.current.sent).not.toBeNull());
      const post = sentPosts(fetchMock)[0];
      expect(post).toBeDefined();
      const body = post?.[1]?.body;
      expect(typeof body).toBe("string");
      expect(String(body)).not.toContain("expectedCoverage");
      states.push({ line: result.current.cost.line, blocked: result.current.sendBlocked, body: String(body) });
      cleanup();
    }
    expect(states[1]).toEqual(states[0]);
  });

  it.each(["pending", "error"] as const)("keeps %s quote refusal for a no-referrer company, including keyboard submit", async quoteStatus => {
    vi.stubEnv("VITE_ASK_LEVEL_COST", "true");
    const fetchMock = stub(false, { balance: 0, quoteStatus });
    renderWithQuery(<ExploreCompany />);
    fireEvent.click(await screen.findByRole("button", { name: "Ask for a referral" }));
    const field = await screen.findByLabelText("Job link");
    fireEvent.change(field, { target: { value: "https://careers.wipro.com/jobs/1234567-product-designer" } });
    await waitFor(() => expect(screen.getByTestId("goal-ask-cost").textContent).toBe(quoteStatus === "pending" ? "Pricing this ask…" : "We could not price this ask"));
    fireEvent.keyDown(field, { key: "Enter", metaKey: true });
    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });
    expect(sentPosts(fetchMock)).toHaveLength(0);
    expect(screen.getByRole("button", { name: /send (ask|referral request)/i }).getAttribute("aria-disabled")).toBe("true");
  });

  it.each([
    { coverageStatus: "visible", event: "journey_request_sent_delivered", clause: "It reached verified wipro.com employees." },
    { coverageStatus: "waiting_for_company_coverage", event: "journey_request_sent_pool", clause: "It's waiting in Wipro's pool for verified employees who join, so nothing was spent." },
  ])("reports $coverageStatus from the parsed response with one matching event", async ({ coverageStatus, event, clause }) => {
    stub(false, { sendBody: { requestId: 501, companyDomain: "wipro.com", coverageStatus } });
    const { result } = renderComposer(false);
    await fillComposer(result);
    act(() => result.current.send());
    await waitFor(() => expect(result.current.sent?.detail).toContain(clause));
    expect(result.current.sent?.trackHref).toBe("/conversation/501");
    expect(trackEvent.mock.calls).toEqual([[event]]);
  });

  it.each([
    { sendStatus: 500, sendBody: { error: "Request failed" } },
    { sendStatus: 200, sendBody: { requestId: 0, companyDomain: "wipro.com" } },
  ])("keeps the draft and emits no success event for $sendStatus with an invalid send result", async options => {
    stub(true, options);
    const { result } = renderComposer(true);
    await fillComposer(result);
    act(() => result.current.send());
    await waitFor(() => expect(result.current.sendError).not.toBeNull());
    expect(result.current.sent).toBeNull();
    expect(result.current.url).toBe("https://careers.wipro.com/jobs/1234567-product-designer");
    expect(result.current.reasons[0]).toContain("checkout redesign");
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe("the same pre-send state for every company (D-176)", () => {
  it("renders the company door identically whether or not the directory marks the company open", async () => {
    const open = await doorBody(true);
    cleanup();
    const shut = await doorBody(false);
    expect(shut).toBe(open);
    for (const phrase of FORBIDDEN) expect(open, String(phrase)).not.toMatch(phrase);
  });

  it.each([true, false])("states who can see the drawer request without promising delivery when availability is %s (D-176)", async openToReferrals => {
    const body = await drawerBody(openToReferrals);
    // This row owns the privacy mark and the removed availability block. The
    // cost line below them remains useAskComposer's until packet §6.2.
    expect(body).toContain("Only verified Wipro employees can see it");
    expect(body).not.toContain("Goes to verified Wipro employees");
    for (const phrase of FORBIDDEN) expect(body, String(phrase)).not.toMatch(phrase);
    expect(body).toContain("Your name and resume are shared only if one accepts.");
  });

  it.each([true, false])("states who can see the /ask request without promising delivery when availability is %s (D-176)", async openToReferrals => {
    const body = await askBody(openToReferrals);
    // Same bound as the drawer: the cost line under the mark is §6.2's.
    expect(body).toContain("Only verified Wipro employees can see it");
    expect(body).not.toContain("Goes to verified Wipro employees");
    for (const phrase of FORBIDDEN) expect(body, String(phrase)).not.toMatch(phrase);
  });
});
