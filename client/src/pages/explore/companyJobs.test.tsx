// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCompany } from "@shared/companies";
import type { CatalogJob, CompanyJobsResponse } from "@shared/jobCatalog";
import type * as CompanyJobsApi from "./companyJobsApi";
import type * as GoalComponents from "@/components/goal";
import ExploreCompany from "../ExploreCompany";
import { CompanyJobs } from "./CompanyJobs";
import type { CompanyJobsProps } from "./CompanyJobs";

const state = vi.hoisted(() => ({ flag: {} as { enabled?: boolean }, selectPost: vi.fn(), event: vi.fn() }));
vi.mock("./companyJobsApi", async importOriginal => {
  const actual = await importOriginal<typeof CompanyJobsApi>();
  return { ...actual, get COMPANY_JOBS_ENABLED() { return state.flag.enabled ?? actual.COMPANY_JOBS_ENABLED; } };
});
vi.mock("@/components/goal", async importOriginal => ({
  ...await importOriginal<typeof GoalComponents>(),
  GoalAppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/demand/CompanyDemandLine", () => ({ CompanyDemandLine: () => null }));
vi.mock("@/lib/companyResponseSignal", () => ({ useCompanyResponseSignal: () => ({ data: undefined }) }));
vi.mock("@/lib/clarity", () => ({ trackClarityEvent: state.event }));
vi.mock("./AskDrawer", () => ({ AskDrawer: () => null }));
vi.mock("./useAskComposer", () => ({ useAskComposer: () => ({ selectPost: state.selectPost, clearAfterClose: vi.fn() }) }));
vi.mock("wouter", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
  useLocation: () => ["/explore/example-works", vi.fn()],
  useRoute: () => [true, { slug: "example-works" }],
}));

const company: PublicCompany = {
  slug: "example-works", name: "Example Works", initials: "EW", industry: "Technology",
  location: "Remote", functions: ["Engineering"], blurb: "Company directory fixture.", domains: ["example.com"],
};
const job: CatalogJob = {
  id: 701, companyId: 7, sourceId: 3, externalId: "engineer-1", title: "Platform Engineer",
  rawLocation: "Remote", locations: ["Remote"], workMode: "remote", department: "Platform",
  jobFunction: "Engineering", level: 5, applyUrl: "https://careers.example.com/jobs/engineer-1",
  snippet: "Build reliable developer infrastructure.", publishedAt: "2026-11-19T09:00:00.000Z",
};
const catalog: CompanyJobsResponse = {
  jobs: [job], nextCursor: null,
  facets: { locations: { Remote: 1 }, levels: { "5": 1 }, functions: { Engineering: 1 } },
  source: { companyId: 7, provider: "greenhouse", boardToken: "example", evidenceUrl: "https://careers.example.com", status: "verified" },
  syncedAt: "2026-11-20T12:00:00.000Z", completeness: "complete",
};
const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function stubCatalog(body: CompanyJobsResponse = catalog, onJobs?: (url: URL) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes("/jobs")) return onJobs ? onJobs(new URL(path, "https://skipwait.me")) : response(body);
    if (path.endsWith("/opportunities")) return response({ opportunities: [{
      id: 91, companyDomain: "example.com", kind: "hiring_now", roleTitle: "Employee-shared role",
      targetRoleUrl: "https://careers.example.com/employee-role", location: "Remote", compensation: null,
      walkInAt: null, walkInEndsAt: null, postedAt: "2026-11-19T09:00:00.000Z", expiresAt: "2026-12-19T09:00:00.000Z", poster: { kind: "anonymous" },
    }] });
    if (path === "/api/companies/example-works") return response({ company });
    throw new Error(`Unexpected request ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
function mount(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...view, rerender: (next: React.ReactElement) => view.rerender(<QueryClientProvider client={client}>{next}</QueryClientProvider>) };
}
beforeEach(() => { delete state.flag.enabled; state.selectPost.mockReset(); state.event.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, "clipboard"); });

describe("Company door catalog boundary", () => {
  it("keeps the actual production switch off without a catalog request or mount", async () => {
    const fetchMock = stubCatalog();
    mount(<ExploreCompany />);
    await screen.findByRole("heading", { name: "Get referred at Example Works." });
    expect(screen.queryByRole("region", { name: "Jobs from the company careers site" })).toBeNull();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("/jobs"))).toEqual([]);
  });
  it("mounts sourced jobs below employee posts when enabled, with a public posting link", async () => {
    state.flag.enabled = true;
    stubCatalog();
    mount(<ExploreCompany />);
    const title = await screen.findByRole("heading", { name: "Platform Engineer" });
    const employee = await screen.findByText("Employee-shared role");
    expect(employee.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    const section = screen.getByRole("region", { name: "Jobs from the company careers site" });
    expect(within(section).getByRole("link", { name: "View posting for Platform Engineer" }).getAttribute("href")).toBe(job.applyUrl);
    expect(within(section).queryByRole("button", { name: "Request a referral" })).toBeNull();
  });
});

const jobsList = () => screen.getByRole("list", { name: "Careers-site jobs" });
const listedTitles = () => within(jobsList()).getAllByRole("heading").map(heading => heading.textContent);
const renderJobs = (props: Partial<CompanyJobsProps> = {}) => mount(<CompanyJobs company={company} {...props} />);
const secondJob: CatalogJob = { ...job, id: 702, externalId: "designer-2", title: "Product Designer", level: 4, locations: ["Bengaluru"], jobFunction: "Design", publishedAt: null };
const facets = { locations: { Remote: 1, Bengaluru: 1 }, levels: { "4": 1, "5": 1 }, functions: { Engineering: 1, Design: 1 } };

describe("Careers jobs browsing", () => {
  it("uses source facets, numeric labels and cursors; changing filters replaces pages", async () => {
    const fetchMock = stubCatalog(catalog, url => response({
      ...catalog, facets,
      jobs: url.searchParams.has("cursor") || url.searchParams.has("location") ? [secondJob] : [job],
      nextCursor: url.search ? null : "50",
    }));
    renderJobs();
    await screen.findByRole("heading", { name: job.title });
    expect(screen.getByRole("option", { name: "Senior" }).getAttribute("value")).toBe("5");
    expect(screen.getByRole("option", { name: "Mid-level" }).getAttribute("value")).toBe("4");
    fireEvent.click(screen.getByRole("button", { name: "Load more jobs" }));
    await screen.findByRole("heading", { name: secondJob.title });
    expect(listedTitles()).toEqual([job.title, secondJob.title]);
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("?cursor=50"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Bengaluru" } });
    await waitFor(() => expect(listedTitles()).toEqual([secondJob.title]));
    fireEvent.change(screen.getByLabelText("Level"), { target: { value: "4" } });
    await screen.findByRole("heading", { name: secondJob.title });
    fireEvent.change(screen.getByLabelText("Job function"), { target: { value: "Design" } });
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("?location=Bengaluru&level=4&function=Design"))).toBe(true));
    const filteredRequests = fetchMock.mock.calls.map(([input]) => String(input)).filter(path => path.includes("location="));
    expect(filteredRequests.every(path => !path.includes("cursor="))).toBe(true);
  });

  it("keeps the newer filtered result when an old request finishes late", async () => {
    const oldRead = Promise.withResolvers<Response>();
    stubCatalog(catalog, url => {
      if (url.searchParams.get("location") === "Remote") return oldRead.promise;
      return response({ ...catalog, facets, jobs: url.searchParams.has("location") ? [secondJob] : [job] });
    });
    renderJobs();
    await screen.findByRole("heading", { name: job.title });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Remote" } });
    await screen.findByRole("status", { name: "Loading careers-site jobs" });
    expect(screen.queryByRole("heading", { name: job.title })).toBeNull();
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Bengaluru" } });
    await screen.findByRole("heading", { name: secondJob.title });
    await act(async () => { oldRead.resolve(response(catalog)); });
    expect(listedTitles()).toEqual([secondJob.title]);
  });

  it("distinguishes filter misses from source inventory and clears the filters", async () => {
    stubCatalog(catalog, url => response({ ...catalog, facets, jobs: url.search ? [] : [job] }));
    renderJobs();
    await screen.findByRole("heading", { name: job.title });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Remote" } });
    await screen.findByText("No listed jobs match these filters.");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await screen.findByRole("heading", { name: job.title });
    expect((screen.getByLabelText("Location") as HTMLSelectElement).value).toBe("");
  });

  it("retains rows and retries only the failed next page", async () => {
    let nextAttempts = 0;
    const fetchMock = stubCatalog(catalog, url => {
      if (!url.searchParams.has("cursor")) return response({ ...catalog, nextCursor: "50" });
      nextAttempts += 1;
      return nextAttempts === 1 ? response({ error: "private backend detail" }, 502) : response({ ...catalog, jobs: [secondJob] });
    });
    renderJobs();
    await screen.findByRole("heading", { name: job.title });
    fireEvent.click(screen.getByRole("button", { name: "Load more jobs" }));
    await screen.findByText("We couldn’t load the next jobs. Your loaded results are still here.");
    expect(listedTitles()).toEqual([job.title]);
    expect(screen.queryByText("private backend detail")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try loading more again" }));
    await screen.findByRole("heading", { name: secondJob.title });
    expect(listedTitles()).toEqual([job.title, secondJob.title]);
    expect(fetchMock.mock.calls.filter(([input]) => !String(input).includes("cursor="))).toHaveLength(1);
  });

  it("renders level, snippet and only known dates without exposing catalog IDs", async () => {
    stubCatalog({ ...catalog, jobs: [job, secondJob] });
    renderJobs();
    await screen.findByRole("heading", { name: secondJob.title });
    const rows = within(jobsList()).getAllByRole("listitem");
    expect(rows[0].textContent).toContain("Remote · Senior");
    expect(rows[0].textContent).toContain(job.snippet);
    expect(rows[0].textContent).toMatch(/Posted/);
    expect(rows[1].textContent).not.toMatch(/Posted/);
    expect(jobsList().textContent).not.toMatch(/701|702|engineer-1|designer-2/);
    const posting = within(rows[0]).getByRole("link");
    expect(posting.getAttribute("target")).toBe("_blank");
    expect(posting.getAttribute("rel")).toContain("noopener");
  });

  it("offers the supplied paste-link handoff without a catalog selection", async () => {
    stubCatalog({ ...catalog, source: null, completeness: "unavailable", jobs: [] });
    const paste = vi.fn();
    renderJobs({ onPasteJobLink: paste });
    await screen.findByText(/We can’t list careers-site jobs right now/);
    fireEvent.click(screen.getByRole("button", { name: "Paste a job link" }));
    expect(paste).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("Company presence is independent of careers inventory", () => {
  it("keeps identical jobs and filters as authoritative presence changes without another jobs read", async () => {
    const fetchMock = stubCatalog({ ...catalog, jobs: [job, secondJob], facets });
    const pick = vi.fn();
    const view = renderJobs({ company: { ...company, referrerPresence: "present" }, onPickJob: pick });
    await screen.findByText("Verified referrers have joined");
    await screen.findByRole("heading", { name: secondJob.title });
    const initialOptions = screen.getAllByRole("option").map(option => option.textContent);
    view.rerender(<CompanyJobs company={{ ...company, referrerPresence: "none" }} onPickJob={pick} />);
    await screen.findByText("No referrers yet");
    expect(listedTitles()).toEqual([job.title, secondJob.title]);
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(initialOptions);
    fireEvent.click(within(jobsList()).getAllByRole("button", { name: "Request a referral" })[0]);
    expect(pick).toHaveBeenCalledExactlyOnceWith(job);
    view.rerender(<CompanyJobs company={company} onPickJob={pick} />);
    expect(screen.queryByText("No referrers yet")).toBeNull();
    expect(screen.queryByText("Verified referrers have joined")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy company link" })).toBeNull();
    expect(listedTitles()).toEqual([job.title, secondJob.title]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not treat false routing availability as evidence of no referrers", async () => {
    const closedCompany: PublicCompany = { ...company, openToReferrals: false };
    stubCatalog();
    renderJobs({ company: closedCompany });
    await screen.findByRole("heading", { name: job.title });
    expect(screen.queryByText("No referrers yet")).toBeNull();
    expect(screen.queryByText("Verified referrers have joined")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy company link" })).toBeNull();
  });

  it("copies only the canonical public company URL", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
    stubCatalog();
    renderJobs({ company: { ...company, referrerPresence: "none" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy company link" }));
    await screen.findByText("Company link copied.");
    expect(copy).toHaveBeenCalledExactlyOnceWith("https://skipwait.me/explore/example-works");
  });

  it("exposes the public link rather than claiming clipboard success on rejection", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    stubCatalog();
    renderJobs({ company: { ...company, referrerPresence: "none" } });
    fireEvent.click(screen.getByRole("button", { name: "Copy company link" }));
    expect((await screen.findByRole("link", { name: "https://skipwait.me/explore/example-works" })).getAttribute("href")).toBe("https://skipwait.me/explore/example-works");
    expect(screen.queryByText("Company link copied.")).toBeNull();
  });

  it("emits flat consent-helper events without company, filter or job payloads", async () => {
    stubCatalog({ ...catalog, facets });
    renderJobs({ onPickJob: vi.fn() });
    await screen.findByRole("heading", { name: job.title });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Remote" } });
    await screen.findByRole("heading", { name: job.title });
    fireEvent.click(screen.getByRole("button", { name: "Request a referral" }));
    expect(state.event.mock.calls).toEqual([["journey_jobs_viewed"], ["journey_jobs_filtered"], ["journey_job_picked"]]);
  });
});

describe("Honest catalog read states", () => {
  it.each(["complete", "partial"] as const)("limits the %s inventory claim to the actual source", async completeness => {
    stubCatalog({ ...catalog, completeness, jobs: [] });
    renderJobs();
    await screen.findByText("No jobs were returned by this careers source.");
    expect(screen.getByText(completeness === "partial" ? "This list is partial and may omit openings." : "This list covers this source only, not every company opening.")).toBeTruthy();
    expect(screen.queryByText(/0 company jobs|no company openings|all company jobs/i)).toBeNull();
    expect(screen.getByRole("link", { name: "Paste a job link" }).getAttribute("href")).toBe("/ask");
  });

  it.each([
    { ...catalog, jobs: [], source: null, completeness: "unavailable" as const },
    { ...catalog, completeness: "unavailable" as const },
    { ...catalog, source: { ...catalog.source!, status: "unverified" as const } },
  ])("does not show inventory from an unavailable or unverified source", async body => {
    stubCatalog(body);
    renderJobs();
    await screen.findByText(/We can’t list careers-site jobs right now/);
    expect(screen.queryByRole("list", { name: "Careers-site jobs" })).toBeNull();
    expect(screen.queryByText("No referrers yet")).toBeNull();
  });

  it("keeps loading distinct from an empty result", () => {
    stubCatalog(catalog, () => Promise.withResolvers<Response>().promise);
    renderJobs();
    expect(screen.getByRole("status", { name: "Loading careers-site jobs" })).toBeTruthy();
    expect(screen.queryByText("No jobs were returned by this careers source.")).toBeNull();
  });

  it("uses a retryable generic error and recovers without exposing raw backend text", async () => {
    let attempts = 0;
    stubCatalog(catalog, () => ++attempts === 1 ? response({ error: "private database text" }, 503) : response(catalog));
    renderJobs();
    await screen.findByText("We couldn’t load jobs from the careers site.");
    expect(screen.queryByText("private database text")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: job.title });
  });

  it("retains filters after a filtered read fails so a different filter can recover", async () => {
    stubCatalog(catalog, url => url.searchParams.get("location") === "Remote" ? response({}, 502) : response({ ...catalog, facets }));
    renderJobs();
    await screen.findByRole("heading", { name: job.title });
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Remote" } });
    await screen.findByText("We couldn’t load jobs from the careers site.");
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: "Bengaluru" } });
    await screen.findByRole("heading", { name: job.title });
  });

  it.each([
    { ...catalog, jobs: [{ ...job, level: 11 }] },
    { ...catalog, jobs: [{ ...job, applyUrl: "javascript:alert('https://example.com')" }] },
    { ...catalog, jobs: [{ ...job, applyUrl: "https://name:secret@example.com/job" }] },
  ])("rejects malformed or unsafe original job data rather than rendering an unsafe link", async body => {
    stubCatalog(catalog, () => response(body));
    renderJobs();
    await screen.findByText("We couldn’t load jobs from the careers site.");
    expect(screen.queryByRole("link", { name: `View posting for ${job.title}` })).toBeNull();
  });

  it("shows offline guidance without a false empty result or request attempt", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchMock = stubCatalog();
    renderJobs();
    expect(screen.getByText("You’re offline. Connect to load careers-site jobs.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByText("No jobs were returned by this careers source.")).toBeNull();
  });
});
