// @vitest-environment jsdom
// D-094 item 2 (D-264 (2), packet §4 and §7): behind JOB_LINK_PREFILL_ENABLED
// the ask drawer shows the company and role a pasted job link is for, stays
// silent for a link that was never fetched, and refuses another company's
// posting on a company door before Send. The switch ships false, so nothing
// here runs in production until the release row flips it.
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyDirectoryResponse, PublicCompany } from "@shared/companies";
import { LAUNCH_COMPANY_SEED } from "@shared/companyDirectorySeed";
import ExploreCompany from "../ExploreCompany";
import {
  JOB_LINK_PREFILL_ENABLED,
  jobLinkLine,
  resetJobLinkPreviewForTests,
  setJobLinkPrefillForTests,
  type JobLinkPreview,
} from "./jobLinkPrefill";

const { go, authState, accessState, signIn, routeState } = vi.hoisted(() => ({
  go: vi.fn(),
  authState: { isLoaded: true, isSignedIn: true },
  accessState: { status: "unverified" as "unverified" | "verified" | "signed-out" },
  signIn: vi.fn(),
  routeState: { isDoor: true, slug: "wipro" },
}));

vi.mock("@/_core/auth", () => ({
  useAuth: () => ({ isLoaded: authState.isLoaded, isSignedIn: authState.isSignedIn, userId: authState.isSignedIn ? "user-7" : null, getToken: async () => (authState.isSignedIn ? "test-token" : null) }),
  useUser: () => ({ user: authState.isSignedIn ? { fullName: "Ada Byron", primaryEmailAddress: { emailAddress: "ada@example.com" }, emailAddresses: [] } : null }),
  SignInButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useReferrerAccess", () => ({ useReferrerAccess: () => accessState }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/explore/wipro", go],
  useSearch: () => "",
  useRoute: () => [routeState.isDoor, { slug: routeState.slug }],
}));
vi.mock("./signInHandoff", async importOriginal => ({
  ...await importOriginal<typeof import("./signInHandoff")>(),
  goToSeekerSignIn: signIn,
}));

const company = (slug: string, openToReferrals = true): PublicCompany => {
  const seed = LAUNCH_COMPANY_SEED.find(item => item.slug === slug);
  if (!seed) throw new Error(`unknown seed ${slug}`);
  return { slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals };
};
const WIPRO = company("wipro");
const directoryOf = (companies: PublicCompany[]): CompanyDirectoryResponse => ({ companies, openCount: companies.filter(item => item.openToReferrals).length });
const ALL_OPEN = directoryOf(LAUNCH_COMPANY_SEED.map(seed => company(seed.slug)));
const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, url: "", json: async () => body });
const setup = { goal: "Actively looking", roles: [], level: "", links: [], city: "", countries: "", remote: true, visa: "No sponsorship needed", resume: { id: 77, fileName: "ada-resume.pdf" } };

const preview = (url: string, extra: Partial<JobLinkPreview> = {}): JobLinkPreview => ({
  canonicalUrl: url,
  status: "fresh",
  employerConfidence: "direct-domain",
  companyDomain: "wipro.com",
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
    if (path === "/api/companies") return json(200, ALL_OPEN);
    if (path.endsWith("/opportunities")) return json(200, { opportunities: [] });
    if (path.startsWith("/api/companies/")) return json(200, { company: WIPRO });
    if (path.startsWith("/api/credits/summary")) return json(200, { summary: { totalAvailable: 4 } });
    if (path === "/api/profile/setup") return json(200, setup);
    if (path === "/api/ask-drafts" && method === "GET") return json(200, { draft: null });
    if (path === "/api/ask-drafts" && method === "PUT") return json(200, { draft: { ...(JSON.parse(String(init?.body)) as object), updatedAt: "x" } });
    if (path === "/api/job-link/preview" && method === "POST") {
      const url = String((JSON.parse(String(init?.body)) as { url?: unknown }).url ?? "");
      const reply = options.previewReply?.(url) ?? { status: 200, body: preview(url) };
      if (reply === "network") throw new TypeError("Failed to fetch");
      return json(reply.status, reply.body);
    }
    return json(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const renderDoor = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ExploreCompany /></QueryClientProvider>);
const openDoorDrawer = async () => {
  renderDoor();
  return screen.findByTestId("goal-drawer");
};
const fillLink = (drawer: HTMLElement, value: string) => {
  const input = within(drawer).getByLabelText("Job link");
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
  return input;
};
const previewCalls = (fetchMock: ReturnType<typeof vi.fn>) => fetchMock.mock.calls.filter(([url, init]) => String(url) === "/api/job-link/preview" && (init as RequestInit | undefined)?.method === "POST");
const previewUrl = (fetchMock: ReturnType<typeof vi.fn>, index = 0) => String((JSON.parse(String((previewCalls(fetchMock)[index][1] as RequestInit).body)) as { url: string }).url);
const sendButton = (drawer: HTMLElement) => within(drawer).getByRole("button", { name: "Send ask" });

beforeEach(() => {
  authState.isLoaded = true;
  authState.isSignedIn = true;
  accessState.status = "unverified";
  signIn.mockReset();
  go.mockReset();
  routeState.isDoor = true;
  routeState.slug = "wipro";
  resetJobLinkPreviewForTests();
  setJobLinkPrefillForTests(null);
  window.history.replaceState({}, "", "/explore/wipro?open");
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false }));
});
afterEach(() => {
  setJobLinkPrefillForTests(null);
  cleanup();
  vi.unstubAllGlobals();
});

describe("the switch (packet T0)", () => {
  it("ships false: no preview request, no line, and the drawer keeps today's link check", async () => {
    expect(JOB_LINK_PREFILL_ENABLED).toBe(false);
    const fetchMock = stub();
    const drawer = await openDoorDrawer();
    fillLink(drawer, "https://boards.greenhouse.io/wipro/jobs/42");
    await new Promise(resolve => setTimeout(resolve, 800));
    expect(previewCalls(fetchMock)).toHaveLength(0);
    expect(within(drawer).queryByTestId("job-link-from-posting")).toBeNull();
    expect(sendButton(drawer).getAttribute("aria-disabled")).toBeNull();
  });
});

describe("the line builder (packet T3)", () => {
  it("names the company and the role from a safe preview", () => {
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/wipro/jobs/42", preview: preview("https://boards.greenhouse.io/wipro/jobs/42", { roleTitle: "Analyst" }), company: WIPRO })).toBe("From the posting: Analyst at Wipro");
  });

  it("falls back to 'a role' when the posting has no readable title", () => {
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/wipro/jobs/42", preview: preview("https://boards.greenhouse.io/wipro/jobs/42"), company: WIPRO })).toBe("From the posting: a role at Wipro");
  });

  it("names another company's posting when the door is a different company", () => {
    const other = preview("https://boards.greenhouse.io/infosys/jobs/42", { companyDomain: "infosys.com", companyName: "Infosys" });
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/infosys/jobs/42", preview: other, company: WIPRO })).toBe("This posting looks like Infosys’, not Wipro’s.");
  });

  it("uses the domain when the other company has no display name", () => {
    const other = preview("https://boards.greenhouse.io/infosys/jobs/42", { companyDomain: "infosys.com" });
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/infosys/jobs/42", preview: other, company: WIPRO })).toBe("This posting looks like infosys.com’s, not Wipro’s.");
  });

  it("says the plan for an ambiguous or unreachable preview it did fetch", () => {
    const ambiguous = preview("https://boards.greenhouse.io/wipro/jobs/42", { employerConfidence: "ambiguous", companyDomain: undefined, reason: "We could not safely identify one company from this hosted job link." });
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/wipro/jobs/42", preview: ambiguous, company: WIPRO })).toBe("We could not safely identify one company from this hosted job link. You can still send it; we check the company when you send.");
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/wipro/jobs/42", preview: null, company: WIPRO })).toBe("You can still send it; we check the company when you send.");
  });

  it("shows nothing for an empty or invalid field, or a link it never fetched", () => {
    expect(jobLinkLine({ url: "", preview: null, company: WIPRO })).toBeNull();
    expect(jobLinkLine({ url: "not a link", preview: null, company: WIPRO })).toBeNull();
    const neverFetched = preview("https://jobs.lever.co/wipro/abc", { employerConfidence: "unreachable", companyDomain: undefined, reason: "We could not reach this job link.", fetched: false });
    expect(jobLinkLine({ url: "https://jobs.lever.co/wipro/abc", preview: neverFetched, company: WIPRO })).toBeNull();
  });

  it("names the posting on /ask with no door, from the directory or the domain", () => {
    const companyDirectory = LAUNCH_COMPANY_SEED.map(seed => company(seed.slug));
    const infosys = preview("https://boards.greenhouse.io/infosys/jobs/42", { companyDomain: "infosys.com", roleTitle: "Analyst" });
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/infosys/jobs/42", preview: infosys, company: null, companies: companyDirectory })).toBe("From the posting: Analyst at infosys.com");
    expect(jobLinkLine({ url: "https://boards.greenhouse.io/infosys/jobs/42", preview: infosys, company: null })).toBe("From the posting: Analyst at infosys.com");
  });
});

describe("the drawer on a company door (packet T4/T5/T6/T6b)", () => {
  beforeEach(() => setJobLinkPrefillForTests(true));

  it("shows the role line for the door company and keeps Send enabled (T4)", async () => {
    const fetchMock = stub({ previewReply: url => ({ status: 200, body: preview(url, { roleTitle: "Analyst" }) }) });
    const drawer = await openDoorDrawer();
    fillLink(drawer, "https://boards.greenhouse.io/wipro/jobs/42");
    expect(await within(drawer).findByText("From the posting: Analyst at Wipro")).toBeTruthy();
    expect(previewUrl(fetchMock)).toBe("https://boards.greenhouse.io/wipro/jobs/42");
    expect(sendButton(drawer).getAttribute("aria-disabled")).toBeNull();
  });

  it("keeps Send enabled when the preview never arrives (T4 control)", async () => {
    stub({ previewReply: () => ({ status: 503, body: { error: "unavailable" } }) });
    const drawer = await openDoorDrawer();
    fillLink(drawer, "https://boards.greenhouse.io/wipro/jobs/42");
    expect(await within(drawer).findByText("You can still send it; we check the company when you send.")).toBeTruthy();
    expect(sendButton(drawer).getAttribute("aria-disabled")).toBeNull();
  });

  it("catches another company's posting before Send, until the link changes (T5)", async () => {
    stub({
      previewReply: url => ({
        status: 200,
        body: url.includes("infosys")
          ? preview(url, { employerConfidence: "verified", companyDomain: "infosys.com", companyName: "Infosys", roleTitle: "Analyst" })
          : preview(url, { roleTitle: "Analyst" }),
      }),
    });
    const drawer = await openDoorDrawer();
    fillLink(drawer, "https://boards.greenhouse.io/infosys/jobs/42");
    await waitFor(() => expect(within(drawer).getByTestId("job-link-from-posting").textContent).toBe("This posting looks like Infosys’, not Wipro’s."));
    await waitFor(() => expect(sendButton(drawer).getAttribute("aria-disabled")).toBe("true"));
    fillLink(drawer, "https://boards.greenhouse.io/wipro/jobs/42");
    await waitFor(() => expect(within(drawer).getByTestId("job-link-from-posting").textContent).toBe("From the posting: Analyst at Wipro"));
    await waitFor(() => expect(sendButton(drawer).getAttribute("aria-disabled")).toBeNull());
  });

  it("shows a plain line on a rate limit, with no error banner, and debounces typing (T6)", async () => {
    const fetchMock = stub({ previewReply: () => ({ status: 429, body: { error: "Too many previews. Wait a minute and try again." } }) });
    const drawer = await openDoorDrawer();
    const input = within(drawer).getByLabelText("Job link");
    fireEvent.change(input, { target: { value: "https://boards.greenhouse.io/wipro/jobs/41" } });
    await new Promise(resolve => setTimeout(resolve, 50));
    fireEvent.change(input, { target: { value: "https://boards.greenhouse.io/wipro/jobs/42" } });
    expect(await within(drawer).findByText("You can still send it; we check the company when you send.")).toBeTruthy();
    expect(previewCalls(fetchMock)).toHaveLength(1);
    expect(previewUrl(fetchMock)).toBe("https://boards.greenhouse.io/wipro/jobs/42");
    expect(within(drawer).queryAllByRole("alert")).toHaveLength(0);
    expect(within(drawer).queryByText(/Too many previews/)).toBeNull();
  });

  it("never claims a link it did not fetch could not be reached (T6b)", async () => {
    const fetchMock = stub({
      previewReply: url => ({ status: 200, body: preview(url, { status: "unreachable", employerConfidence: "unreachable", companyDomain: undefined, roleTitle: undefined, reason: "We could not reach this job link.", fetched: false }) }),
    });
    const drawer = await openDoorDrawer();
    fillLink(drawer, "https://jobs.lever.co/wipro/abc");
    await waitFor(() => expect(previewCalls(fetchMock).length).toBeGreaterThan(0));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(within(drawer).queryByText(/could not reach/i)).toBeNull();
    expect(within(drawer).queryByText(/You can still send it/)).toBeNull();
  });
});
