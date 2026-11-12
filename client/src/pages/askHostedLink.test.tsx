// @vitest-environment jsdom
// D-094 item 2 (packet §4.5 and T4b): with JOB_LINK_PREFILL_ENABLED on, /ask
// never binds a hosted link to the first directory company; a hosted link
// takes its company only from a safe preview whose domain a directory company
// owns, and a direct careers link keeps its own company. Switch off, the page
// is byte-for-byte today's code (T0 covers the no-request half there).
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import { setJobLinkPrefillForTests, type JobLinkPreview } from "./explore/jobLinkPrefill";
import Ask from "./Ask";

const { go, searchState, authState, signIn } = vi.hoisted(() => ({
  go: vi.fn(),
  searchState: { value: "" },
  authState: { isLoaded: true, isSignedIn: true },
  signIn: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/ask", go],
  useSearch: () => searchState.value,
  useRoute: () => [true, {}],
}));
vi.mock("./explore/signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("./explore/signInHandoff")>(),
  goToSeekerSignIn: signIn,
}));

const company = (slug: string): PublicCompany => {
  if (slug === "infosys") return { slug: "infosys", name: "Infosys", initials: "I", industry: "Technology services", location: "India", functions: ["Engineering"], blurb: "Apply for a role at Infosys.", domains: ["infosys.com"], openToReferrals: true };
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals: true };
};
const DIRECTORY: CompanyDirectoryResponse = { companies: [...LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)), company("infosys")], openCount: LAUNCH_COMPANY_SEED.length + 1 };
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const CREATED = { requestId: 501, companyDomain: "infosys.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } };

const preview = (url: string, extra: Partial<JobLinkPreview> = {}): JobLinkPreview => ({
  canonicalUrl: url,
  status: "fresh",
  employerConfidence: "direct-domain",
  companyDomain: "infosys.com",
  reason: "Company identified from the job link.",
  recoveryAction: "Continue to your resume.",
  fetched: true,
  ...extra,
});

type PreviewReply = { status: number; body: unknown } | "network";

function stub(options: { previewReply?: (url: string) => PreviewReply } = {}) {
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies") return json(200, DIRECTORY);
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...(JSON.parse(String(init?.body)) as object), updatedAt: "x" } });
    if (path === "/api/ask-drafts" && method === "DELETE") return json(200, { ok: true });
    if (path === "/api/job-link/preview" && method === "POST") {
      const url = String((JSON.parse(String(init?.body)) as { url?: unknown }).url ?? "");
      const reply = options.previewReply?.(url) ?? { status: 200, body: preview(url) };
      if (reply === "network") throw new TypeError("Failed to fetch");
      return json(reply.status, reply.body);
    }
    if (path === "/api/company-referrals" && method === "POST") return json(200, CREATED);
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderPage = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Ask /></QueryClientProvider>);
const fillLink = (value: string) => {
  const input = screen.getByLabelText("Job link");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};
const fillReasons = () => {
  fireEvent.change(screen.getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off 18%." } });
  fireEvent.change(screen.getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by 40 teams." } });
  fireEvent.change(screen.getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
};
const posts = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/company-referrals" && (init as RequestInit | undefined)?.method === "POST");
const send = async (fetchMock: ReturnType<typeof vi.fn>) => {
  await screen.findByText("ada-resume.pdf");
  fireEvent.click(screen.getByRole("button", { name: "Send ask" }));
  await waitFor(() => expect(posts(fetchMock)).toHaveLength(1));
  return JSON.parse(String((posts(fetchMock)[0][1] as RequestInit).body)) as Record<string, unknown>;
};

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  searchState.value = "";
  sessionStorage.clear();
  signIn.mockReset();
  go.mockReset();
  setJobLinkPrefillForTests(true);
  window.history.replaceState(null, "", "/ask");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => {
  setJobLinkPrefillForTests(null);
  cleanup();
  vi.unstubAllGlobals();
});

describe("/ask hosted link (packet T4b)", () => {
  it("never binds a hosted link to the first directory company", async () => {
    const fetchMock = stub({ previewReply: () => ({ status: 400, body: {} }) });
    renderPage();
    fillLink("https://boards.greenhouse.io/infosys/jobs/42");
    fillReasons();
    expect(await screen.findByText("You can still send it; we check the company when you send.")).toBeTruthy();
    const body = await send(fetchMock);
    expect(body).not.toHaveProperty("companySlug");
  });

  it("takes a hosted link's company only from a safe preview a directory company owns", async () => {
    const fetchMock = stub();
    renderPage();
    fillLink("https://boards.greenhouse.io/infosys/jobs/42");
    fillReasons();
    expect(await screen.findByText("From the posting: a role at Infosys")).toBeTruthy();
    const body = await send(fetchMock);
    expect(body).toMatchObject({ companySlug: "infosys", targetRoleUrl: "https://boards.greenhouse.io/infosys/jobs/42" });
  });

  it("keeps a direct careers link's own company (control)", async () => {
    const fetchMock = stub({ previewReply: () => ({ status: 400, body: {} }) });
    renderPage();
    fillLink("https://careers.wipro.com/jobs/1234567-product-designer");
    fillReasons();
    expect(await screen.findByText("You can still send it; we check the company when you send.")).toBeTruthy();
    const body = await send(fetchMock);
    expect(body).toMatchObject({ companySlug: "wipro" });
  });
});
