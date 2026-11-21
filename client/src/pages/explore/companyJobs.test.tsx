// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicCompany } from "@shared/companies";
import type { CatalogJob, CompanyJobsResponse } from "@shared/jobCatalog";
import type * as CompanyJobsApi from "./companyJobsApi";
import type * as GoalComponents from "@/components/goal";
import ExploreCompany from "../ExploreCompany";

const state = vi.hoisted(() => ({ flag: {} as { enabled?: boolean }, selectPost: vi.fn() }));
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
function stubCatalog(body: CompanyJobsResponse = catalog) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes("/jobs")) return response(body);
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
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
beforeEach(() => { delete state.flag.enabled; state.selectPost.mockReset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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
