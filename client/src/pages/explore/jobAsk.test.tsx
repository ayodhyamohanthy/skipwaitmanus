// @vitest-environment jsdom
// D-174-seeker-journey-build.job-ask: a careers-source selection is the job
// identity for both the banded quote and the send, never a free-text override.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import type { CatalogJob } from "@shared/jobCatalog";
import type { BandedAskQuote } from "@shared/acceptedAskCost";
import type { PublicOpportunityPost } from "@shared/companyOpportunities";
import ExploreCompany from "../ExploreCompany";

const { catalogJob, authState, routeState, trackEvent } = vi.hoisted(() => ({
  catalogJob: {
    id: 701, companyId: 7, sourceId: 3, externalId: "designer-701", title: "Senior Product Designer",
    rawLocation: "Remote", locations: ["Remote"], workMode: "remote", department: "Design",
    jobFunction: "Design", level: 5, applyUrl: "https://careers.wipro.com/jobs/701-product-designer",
    snippet: "Design a simpler checkout.", publishedAt: "2026-11-20T09:00:00.000Z",
  } as CatalogJob,
  authState: { isLoaded: true, isSignedIn: true },
  routeState: { path: "/explore/wipro" },
  trackEvent: vi.fn(),
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => "test-token" }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => ({ status: "unverified" }) }));
vi.mock("@/lib/clarity", () => ({ trackClarityEvent: trackEvent }));
vi.mock("@/lib/goalFlags", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/goalFlags")>(),
  get ASK_LEVEL_COST_CLIENT() { return import.meta.env.VITE_ASK_LEVEL_COST === "true"; },
}));
vi.mock("@/components/goal", async importOriginal => ({
  ...await importOriginal<typeof import("@/components/goal")>(),
  GoalAppShell: ({ children, drawer }: { children: React.ReactNode; drawer?: React.ReactNode }) => <main>{children}{drawer}</main>,
}));
vi.mock("@/components/demand/CompanyDemandLine", () => ({ CompanyDemandLine: () => null }));
vi.mock("@/lib/companyResponseSignal", () => ({ useCompanyResponseSignal: () => ({ data: undefined }) }));
vi.mock("./explore/companyJobsApi", async importOriginal => ({
  ...await importOriginal<typeof import("./explore/companyJobsApi")>(),
  COMPANY_JOBS_ENABLED: true,
}));
vi.mock("./explore/CompanyJobs", () => ({
  CompanyJobs: ({ onPickJob, onPasteJobLink }: { onPickJob?: (job: CatalogJob) => void; onPasteJobLink?: () => void }) => (
    <section aria-label="Jobs from the company careers site">
      <button type="button" onClick={() => onPickJob?.(catalogJob)}>Pick catalog job</button>
      <button type="button" onClick={onPasteJobLink}>Paste a job link</button>
    </section>
  ),
}));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => [routeState.path, vi.fn()],
  useRoute: () => [true, { slug: "wipro" }],
}));

const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === "wipro")!;
const company: PublicCompany = {
  slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry,
  location: seed.location, functions: [...seed.functions], blurb: seed.blurb,
  domains: [...seed.domains], openToReferrals: true,
};
const acceptedCost: BandedAskQuote["acceptedCost"] = {
  units: 1, band: "senior", source: [{ bucket: "included", units: 1, cycleKey: "paid-cycle-2026-11" }],
};
const quote: BandedAskQuote = { level: 5, cost: 1, totalAvailable: 3, shortfall: 0, coverageStatus: "covered", acceptedCost };
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };
const created = { requestId: 501, companyDomain: "wipro.com", coverageStatus: "visible", fastTrack: false, slots: { plan: "free", planLabel: "Free", open: 1, cap: 3, full: false, nextPlan: null } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

type QuoteMode = "ready" | "pending" | "error" | "invalid-cost";
function stub(options: { quote?: QuoteMode; opportunities?: PublicOpportunityPost[] } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? "GET";
    if (path === "/api/companies/wipro") return json(200, { company });
    if (path === "/api/companies/wipro/opportunities") return json(200, { opportunities: options.opportunities ?? [] });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 3 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/work-items") return json(200, { items: [] });
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...JSON.parse(String(init?.body)), updatedAt: "2026-11-24T00:00:00.000Z" } });
    if (path === "/api/ask-drafts" && method === "DELETE") return json(200, { ok: true });
    if (path.startsWith("/api/company-referrals/quote")) {
      if (options.quote === "pending") return new Promise<Response>(() => {});
      if (options.quote === "error") return json(500, { error: "pricing unavailable" });
      if (options.quote === "invalid-cost") return json(200, { ...quote, acceptedCost: { ...acceptedCost, units: 3 } });
      return json(200, quote);
    }
    if (path === "/api/company-referrals" && method === "POST") return json(201, created);
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderDoor = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><ExploreCompany /></QueryClientProvider>);
const quotes = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([path]) => String(path).startsWith("/api/company-referrals/quote"));
const posts = (fetchMock: ReturnType<typeof stub>) => fetchMock.mock.calls.filter(([path, init]) => String(path) === "/api/company-referrals" && init?.method === "POST");
const sentBody = (fetchMock: ReturnType<typeof stub>): Record<string, unknown> => JSON.parse(String(posts(fetchMock)[0]?.[1]?.body)) as Record<string, unknown>;
const fillReasons = (drawer: HTMLElement) => {
  fireEvent.change(within(drawer).getByPlaceholderText(/One result/), { target: { value: "Led a checkout redesign that cut drop-off by eighteen percent." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/Another result/), { target: { value: "Shipped a design system used by forty product teams." } });
  fireEvent.change(within(drawer).getByPlaceholderText(/A third reason/), { target: { value: "Built the onboarding flow end to end." } });
};
const fillLink = (drawer: HTMLElement, value = "https://careers.wipro.com/jobs/custom-role") => {
  const field = within(drawer).getByLabelText("Job link");
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
};
async function pickJob() {
  fireEvent.click(await screen.findByRole("button", { name: "Pick catalog job" }));
  return screen.findByTestId("goal-drawer");
}
async function sendFrom(drawer: HTMLElement) {
  fillReasons(drawer);
  await within(drawer).findByText("ada-resume.pdf");
  fireEvent.click(within(drawer).getByRole("button", { name: "Send referral request" }));
  await screen.findByText("Referral request sent to Wipro.");
}

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  routeState.path = "/explore/wipro";
  sessionStorage.clear();
  localStorage.clear();
  trackEvent.mockReset();
  vi.stubEnv("VITE_ASK_LEVEL_COST", "false");
  window.history.replaceState({}, "", "/explore/wipro");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("catalog job ask binding (D-174 §6.6)", () => {
  it("quotes and sends the picked catalog row with its accepted cost and no URL override", async () => {
    const fetchMock = stub();
    renderDoor();
    const drawer = await pickJob();
    await waitFor(() => expect(quotes(fetchMock).some(([path]) => new URL(String(path), "https://skipwait.me").searchParams.get("catalogJobId") === "701")).toBe(true));
    await waitFor(() => expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe("Uses 1 from your balance when a verified employee can see it"));
    await sendFrom(drawer);
    expect(sentBody(fetchMock)).toEqual({
      catalogJobId: 701,
      expectedCost: acceptedCost,
      attachmentIds: [77],
      candidateMessage: "Led a checkout redesign that cut drop-off by eighteen percent.\nShipped a design system used by forty product teams.\nBuilt the onboarding flow end to end.",
      companySlug: "wipro",
    });
    expect(sentBody(fetchMock)).not.toHaveProperty("targetRoleUrl");
    expect(trackEvent).toHaveBeenCalledWith("journey_request_sent_delivered");
  });

  it("closing the drawer and opening the hero clears the catalog job before send", async () => {
    const fetchMock = stub();
    renderDoor();
    const drawer = await pickJob();
    await waitFor(() => expect(quotes(fetchMock)).toHaveLength(1));
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByTestId("goal-drawer")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Ask for a referral" }));
    const heroDrawer = await screen.findByTestId("goal-drawer");
    fillLink(heroDrawer);
    await sendFrom(heroDrawer);
    expect(sentBody(fetchMock)).toHaveProperty("targetRoleUrl", "https://careers.wipro.com/jobs/custom-role");
    expect(sentBody(fetchMock)).not.toHaveProperty("catalogJobId");
    expect(sentBody(fetchMock)).not.toHaveProperty("expectedCost");
    expect(quotes(fetchMock)).toHaveLength(1);
  });

  it("Change job clears the locked selection and returns an editable link", async () => {
    const fetchMock = stub();
    renderDoor();
    const drawer = await pickJob();
    await waitFor(() => expect(quotes(fetchMock)).toHaveLength(1));
    fireEvent.click(within(drawer).getByRole("button", { name: "Change job" }));
    const field = within(drawer).getByLabelText("Job link") as HTMLInputElement;
    expect(field.readOnly).toBe(false);
    expect(field.value).toBe("");
    fillLink(drawer);
    await sendFrom(drawer);
    expect(sentBody(fetchMock)).not.toHaveProperty("catalogJobId");
    expect(sentBody(fetchMock)).not.toHaveProperty("expectedCost");
  });

  it("picking an employee post after a job replaces the catalog selection", async () => {
    const post: PublicOpportunityPost = {
      id: 88, companyDomain: "wipro.com", kind: "hiring_now", roleTitle: "Frontend Lead",
      targetRoleUrl: "https://careers.wipro.com/jobs/lead", location: "Remote", compensation: null,
      walkInAt: null, walkInEndsAt: null, postedAt: "2026-11-20T00:00:00.000Z", expiresAt: "2026-12-20T00:00:00.000Z", poster: { kind: "anonymous" },
    };
    const fetchMock = stub({ opportunities: [post] });
    renderDoor();
    const drawer = await pickJob();
    await waitFor(() => expect(quotes(fetchMock)).toHaveLength(1));
    const row = (await screen.findByText("Frontend Lead")).closest("li") as HTMLElement;
    fireEvent.click(within(row).getByRole("button", { name: "Ask for a referral" }));
    await waitFor(() => expect(within(drawer).queryByRole("button", { name: "Change job" })).toBeNull());
    await sendFrom(drawer);
    expect(sentBody(fetchMock)).toHaveProperty("opportunityId", 88);
    expect(sentBody(fetchMock)).toHaveProperty("targetRoleUrl", post.targetRoleUrl);
    expect(sentBody(fetchMock)).not.toHaveProperty("catalogJobId");
    expect(sentBody(fetchMock)).not.toHaveProperty("expectedCost");
  });

  it("locks the picked job details and apply link in the drawer", async () => {
    stub();
    renderDoor();
    const drawer = await pickJob();
    expect(within(drawer).getByText("Senior Product Designer")).toBeTruthy();
    expect(within(drawer).getByText("Remote")).toBeTruthy();
    expect(within(drawer).getByText("Senior")).toBeTruthy();
    expect(within(drawer).getByRole("link", { name: "View posting for Senior Product Designer" }).getAttribute("href")).toBe(catalogJob.applyUrl);
    expect(within(drawer).queryByLabelText("Job link")).toBeNull();
  });

  it.each(["pending", "error", "invalid-cost"] as const)("blocks a job send while its quote is %s", async mode => {
    const fetchMock = stub({ quote: mode });
    renderDoor();
    const drawer = await pickJob();
    await waitFor(() => expect(quotes(fetchMock).length).toBeGreaterThan(0));
    await waitFor(() => expect(within(drawer).getByTestId("goal-ask-cost").textContent).toBe(mode === "pending" ? "Pricing this ask…" : "We could not price this ask"));
    fillReasons(drawer);
    fireEvent.keyDown(within(drawer).getByPlaceholderText(/One result/), { key: "Enter", metaKey: true });
    expect(posts(fetchMock)).toHaveLength(0);
    expect(within(drawer).getByRole("button", { name: "Send referral request" }).getAttribute("aria-disabled")).toBe("true");
  });
});
