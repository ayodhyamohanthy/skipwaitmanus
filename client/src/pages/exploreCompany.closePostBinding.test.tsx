// @vitest-environment jsdom
// The ask drawer on Find a referral (design/goal-ui/pick/find-a-referral.*):
// the job-link hint, the resume, three 140-character reasons (D-077(4)), the
// cost line from the first moment, the live send contract and every refusal
// the server can answer with. Nothing here invents money copy: the assertions
// read the shared strings the server and /ask already use.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import type { PublicOpportunityPost } from "@shared/companyOpportunities";
import { ASK_TTL_DAYS, COVERAGE_WAIT_DAYS } from "@shared/referral";
import { OPPORTUNITY_FIRST_LOOK_HOURS } from "@shared/companyOpportunities";
import { CREDIT_ENDED_CAVEAT, MONEY_SENTENCE } from "@shared/moneyCopy";
import { COMPANY_CAP_REACHED, companyCapCopy, SLOT_CAP_REACHED } from "@shared/openAskSlots";
import { ASK_PREFILL_KEY } from "@/lib/askPrefill";
import { ASK_NETWORK_ERROR } from "@/components/ask/askApi";
import Explore from "./Explore";
import ExploreCompany from "./ExploreCompany";

const { go, authState, accessState, signIn, routeState, searchState } = vi.hoisted(() => ({
  go: vi.fn(),
  authState: { isLoaded: true, isSignedIn: true },
  accessState: { status: "unverified" as "unverified" | "verified" | "signed-out" },
  signIn: vi.fn(),
  routeState: { path: "/explore", slug: "wipro", isDoor: false },
  searchState: { value: "" },
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
  useRoute: () => [routeState.isDoor, { slug: routeState.slug }],
}));
vi.mock("./explore/signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("./explore/signInHandoff")>(),
  goToSeekerSignIn: signIn,
}));

const company = (slug: string, openToReferrals = true): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals };
};
const directoryOf = (companies: PublicCompany[]): CompanyDirectoryResponse => ({ companies, openCount: companies.filter(item => item.openToReferrals).length });
const ALL_OPEN = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)));
const WIPRO_CLOSED = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug, seed.slug !== "wipro")));
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const CREATED = { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } };

type Reply = { status: number; body: unknown };

function stub(options: { directory?: CompanyDirectoryResponse; opportunities?: PublicOpportunityPost[]; company?: PublicCompany; credits?: number; send?: () => Reply; alert?: () => Reply } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, options.directory ?? ALL_OPEN);
    if (path.endsWith("/opportunities")) return json(200, { opportunities: options.opportunities ?? [] });
    if (path.startsWith("/api/companies/")) return json(200, { company: options.company ?? company("wipro") });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: options.credits ?? 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...(JSON.parse(String(init?.body)) as object), updatedAt: "x" } });
    if (path === "/api/ask-drafts" && method === "DELETE") return json(200, { ok: true });
    if (path === "/api/company-referrals" && method === "POST") { const reply = options.send?.() ?? { status: 200, body: CREATED }; return json(reply.status, reply.body); }
    if (path === "/api/seeker-alerts" && method === "POST") { const reply = options.alert?.() ?? { status: 200, body: { ok: true } }; return json(reply.status, reply.body); }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Explore /></QueryClientProvider>);
const renderCompanyDoor = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ExploreCompany /></QueryClientProvider>);
const openWipro = async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("link", { name: "Wipro" }));
  return screen.findByTestId("goal-drawer");
};
const fillLink = (drawer: HTMLElement, value = "https://careers.wipro.com/jobs/1234567-product-designer") => {
  const input = within(drawer).getByLabelText("Job link");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};
const fillReasons = (drawer: HTMLElement) => {
  fireEvent.change(within(drawer).getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
};
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/company-referrals" && (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  accessState.status = "unverified";
  sessionStorage.clear();
  signIn.mockReset();
  go.mockReset();
  routeState.isDoor = false;
  routeState.path = "/explore";
  routeState.slug = "wipro";
  searchState.value = "";
  window.history.replaceState({}, "", "/explore");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("posted-role Close binding regression",()=>{
  it("pick a post, close the drawer, open the hero ask, send → no opportunityId", async () => {
    routeState.isDoor = true;
    routeState.path = "/explore/wipro";
    window.history.replaceState({}, "", "/explore/wipro");
    const testPost: PublicOpportunityPost = {
      id: 88,
      companyDomain: "wipro.com",
      kind: "hiring_now",
      roleTitle: "Frontend Lead",
      targetRoleUrl: "https://careers.wipro.com/jobs/lead",
      location: "Remote",
      compensation: null,
      walkInAt: null,
      walkInEndsAt: null,
      postedAt: "2026-10-20T00:00:00.000Z",
      expiresAt: "2026-11-20T00:00:00.000Z",
      poster: { kind: "anonymous" },
    };
    const fetchMock = stub({ opportunities: [testPost] });
    renderCompanyDoor();
    const row = (await screen.findByText("Frontend Lead")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: /Ask for a referral/ }));
    let drawer = await screen.findByTestId("goal-drawer");
    expect(within(drawer).getByLabelText("Job link")).toBeTruthy();

    // Close the drawer
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());

    // Open hero ask
    const heroButton = screen.getAllByRole("button", { name: "Ask for a referral" })[0];
    fireEvent.click(heroButton);
    drawer = await screen.findByTestId("goal-drawer");

    const linkInput = within(drawer).getByLabelText("Job link") as HTMLInputElement;
    expect(linkInput.readOnly).toBe(false);
    expect(within(drawer).queryByRole("button", { name: "Change role" })).toBeNull();

    fillLink(drawer, "https://careers.wipro.com/jobs/custom-hero");
    fillReasons(drawer);
    await within(drawer).findByText("ada-resume.pdf");
    fireEvent.click(within(drawer).getByRole("button", { name: "Send ask" }));

    await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
    const sentBody = JSON.parse(String(posts(fetchMock)[0][1]?.body));
    expect(sentBody.opportunityId).toBeUndefined();
  });

});
