// SEARCH-universal (D-394): one search box takes a job title, a job link, a
// company name or a company website. These tests pin the classification, the
// title ranking (exact phrase first, open jobs only), the URL/website
// resolution (directory first, work-domain rules), the presence label and the
// public route (signed out, length cap, rate limit).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AdminCompany, DiscoveredCompany } from "../shared/companies";
import { SEARCH_JOB_LIMIT, SEARCH_QUERY_MAX, searchResponseSchema } from "../shared/search";
import { classifySearchInput, rankJobTitle, runUniversalSearch, searchCatalogJobs, type CatalogJobRow, type DirectorySnapshot, type UniversalSearchDeps } from "./search";
import { registerSearchRoutes } from "./searchRoutes";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import type { DiscoveryOutcome } from "./companyDiscovery";
import type { JobLinkPreview } from "./jobLinkPreview";

const company = (over: Partial<AdminCompany> & Pick<AdminCompany, "id" | "slug" | "name">): AdminCompany => ({
  initials: over.name.slice(0, 2).toUpperCase(),
  industry: "Technology",
  location: "Global",
  functions: ["Engineering"],
  blurb: "A company.",
  domains: [`${over.slug}.com`],
  openToReferrals: false,
  status: "listed",
  sortOrder: 0,
  primaryDomain: `${over.slug}.com`,
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

const acme = company({ id: 1, slug: "acme", name: "Acme", domains: ["acme.com"] });
const stripe = company({ id: 2, slug: "stripe", name: "Stripe", domains: ["stripe.com"] });
const google = company({ id: 3, slug: "google", name: "Google", domains: ["google.com"] });
const neutrinos = company({ id: 4, slug: "neutrinos", name: "Neutrinos", domains: ["neutrinos.ai"] });

const snapshot = (present: number[] = []): DirectorySnapshot => ({
  companies: [acme, stripe, google, neutrinos],
  presentIds: new Set(present),
});

const job = (over: Partial<CatalogJobRow> & Pick<CatalogJobRow, "id" | "title">): CatalogJobRow => ({
  companyId: acme.id,
  companySlug: "acme",
  companyName: "Acme",
  locations: ["Remote"],
  applyUrl: `https://acme.com/careers/${over.id}`,
  publishedAt: "2026-11-20T00:00:00.000Z",
  level: 5,
  closedAt: null,
  ...over,
});

const preview = (over: Partial<JobLinkPreview> = {}): JobLinkPreview => ({
  canonicalUrl: "https://boards.greenhouse.io/acme/jobs/123",
  status: "fresh",
  employerConfidence: "direct-domain",
  companyDomain: "acme.com",
  roleTitle: "Product Designer",
  fetched: true,
  reason: "Company identified from the job link.",
  recoveryAction: "Continue to your resume.",
  ...over,
});

function deps(over: Partial<UniversalSearchDeps> = {}): UniversalSearchDeps {
  return {
    loadDirectory: async () => snapshot([acme.id]),
    discover: async () => ({ companies: [], degraded: false }),
    preview: async () => preview(),
    searchJobs: async () => [],
    catalogEnabled: () => true,
    ...over,
  };
}

describe("classifySearchInput", () => {
  it.each([
    ["https://boards.greenhouse.io/acme/jobs/123", "job-link"],
    ["https://jobs.lever.co/acme/1234", "job-link"],
    ["https://stripe.com/careers/123", "job-link"],
    ["https://www.stripe.com", "company-website"],
    ["stripe.com", "company-website"],
    ["www.stripe.com/careers", "job-link"],
    ["Neutrinos", "text"],
    ["product designer", "text"],
    ["  ", "text"],
  ] as const)("classifies %j as %s", (input, kind) => {
    expect(classifySearchInput(input)).toBe(kind);
  });
});

describe("rankJobTitle and searchCatalogJobs", () => {
  it("ranks the exact phrase first, then a title prefix, then a title match, then a location match", () => {
    const exact = rankJobTitle("Product Designer", ["Remote"], "product designer");
    const prefix = rankJobTitle("Product Designer II", ["Remote"], "product designer");
    const contains = rankJobTitle("Senior Product Designer", ["Remote"], "product designer");
    const location = rankJobTitle("Designer", ["Product Designer Hub"], "product designer");
    expect(exact).toBe(0);
    expect(prefix).toBe(1);
    expect(contains).toBe(2);
    expect(location).toBe(3);
    expect(rankJobTitle("Accountant", ["Remote"], "product designer")).toBeUndefined();
  });

  it("returns open jobs only, exact phrase first, newest first inside a rank", () => {
    const rows = [
      job({ id: 1, title: "Senior Product Designer", publishedAt: "2026-11-22T00:00:00.000Z" }),
      job({ id: 2, title: "Product Designer", publishedAt: "2026-11-10T00:00:00.000Z" }),
      job({ id: 3, title: "Product Designer", publishedAt: "2026-11-21T00:00:00.000Z" }),
      job({ id: 4, title: "Product Designer", closedAt: "2026-11-01T00:00:00.000Z" }),
      job({ id: 5, title: "Accountant" }),
    ];
    expect(searchCatalogJobs(rows, "product designer", SEARCH_JOB_LIMIT).map(row => row.id)).toEqual([3, 2, 1]);
  });

  it("matches a location and caps the answer", () => {
    const rows = [job({ id: 1, title: "Engineer", locations: ["Bengaluru"] }), job({ id: 2, title: "Engineer", locations: ["Remote"] })];
    expect(searchCatalogJobs(rows, "bengaluru", SEARCH_JOB_LIMIT).map(row => row.id)).toEqual([1]);
    expect(searchCatalogJobs(rows, "engineer", 1)).toHaveLength(1);
  });
});

describe("runUniversalSearch", () => {
  it("resolves a job link to its directory company and role", async () => {
    const result = await runUniversalSearch("https://boards.greenhouse.io/acme/jobs/123", deps());
    expect(searchResponseSchema.parse(result)).toEqual(result);
    expect(result.kind).toBe("job-link");
    expect(result.jobLink).toEqual({
      url: "https://boards.greenhouse.io/acme/jobs/123",
      companySlug: "acme",
      companyName: "Acme",
      roleTitle: "Product Designer",
      employerConfidence: "direct-domain",
      status: "fresh",
    });
    expect(result.companies.map(hit => hit.slug)).toEqual(["acme"]);
    expect(result.companies[0]?.referrerPresence).toBe("present");
  });

  it("resolves a company website through the directory", async () => {
    const result = await runUniversalSearch("https://www.stripe.com", deps());
    expect(result.kind).toBe("company-website");
    expect(result.companies.map(hit => hit.slug)).toEqual(["stripe"]);
    expect(result.jobLink).toBeNull();
  });

  it("applies the work-domain rules to a discovered website (about.google -> google.com)", async () => {
    const result = await runUniversalSearch("about.google", deps());
    expect(result.kind).toBe("company-website");
    expect(result.companies.map(hit => hit.slug)).toEqual(["google"]);
  });

  it("answers a company name from the directory, presence included", async () => {
    const result = await runUniversalSearch("Neutrinos", deps());
    expect(result.kind).toBe("company-name");
    expect(result.companies.map(hit => hit.slug)).toEqual(["neutrinos"]);
    expect(result.companies[0]?.referrerPresence).toBe("none");
  });

  it("answers a job title with open catalog jobs and the same presence label", async () => {
    const rows = [job({ id: 7, title: "Product Designer", companyId: acme.id, companySlug: "acme", companyName: "Acme" })];
    const result = await runUniversalSearch("product designer", deps({ searchJobs: async () => rows }));
    expect(result.kind).toBe("job-title");
    expect(result.jobs).toEqual([{
      id: 7,
      companySlug: "acme",
      companyName: "Acme",
      title: "Product Designer",
      locations: ["Remote"],
      applyUrl: "https://acme.com/careers/7",
      publishedAt: "2026-11-20T00:00:00.000Z",
      level: 5,
      referrerPresence: "present",
    }]);
    expect(result.catalogState).toBe("ok");
  });

  it("says the catalog is unavailable rather than claiming no such job", async () => {
    const result = await runUniversalSearch("product designer", deps({ catalogEnabled: () => false, searchJobs: async () => { throw new Error("must not read"); } }));
    expect(result.jobs).toEqual([]);
    expect(result.catalogState).toBe("unavailable");
  });

  it("keeps a degraded discovery portion out of a public cache and never calls it a no-match", async () => {
    const discover = vi.fn(async (): Promise<DiscoveryOutcome> => ({ companies: [], degraded: true, reason: "rate_limited" }));
    const result = await runUniversalSearch("zeta", deps({ discover }));
    expect(result.discoveryState).toBe("degraded");
    expect(result.companies).toEqual([]);
    expect(result.discovered).toEqual([]);
  });

  it("merges worldwide discovery candidates the directory does not hold", async () => {
    const candidate: DiscoveredCompany = { name: "Zeta", domain: "zeta.example", source: "wikidata" };
    const discover = vi.fn(async (): Promise<DiscoveryOutcome> => ({ companies: [candidate], degraded: false }));
    const result = await runUniversalSearch("zeta", deps({ discover }));
    expect(result.kind).toBe("company-name");
    expect(result.discovered).toEqual([candidate]);
    expect(result.discoveryState).toBe("ok");
  });

  it("falls back to the website's own company when a posting preview cannot name one", async () => {
    const result = await runUniversalSearch("https://stripe.com/careers/123", deps({
      preview: async () => preview({ employerConfidence: "ambiguous", companyDomain: undefined, roleTitle: undefined }),
    }));
    expect(result.kind).toBe("job-link");
    expect(result.jobLink?.companySlug).toBeNull();
    expect(result.companies.map(hit => hit.slug)).toEqual(["stripe"]);
  });
});

describe("GET /api/search", () => {
  function appWith(over: Partial<Parameters<typeof registerSearchRoutes>[1]> = {}) {
    const app = express();
    registerSearchRoutes(app, {
      search: (q, clientKey) => runUniversalSearch(q, deps(), clientKey),
      ...over,
    });
    return app;
  }

  it("answers signed out with the public cache", async () => {
    const response = await request(appWith()).get("/api/search?q=Neutrinos");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=30");
    expect(searchResponseSchema.parse(response.body).companies[0]?.slug).toBe("neutrinos");
  });

  it("refuses a missing, unknown or over-long query", async () => {
    const app = appWith();
    expect((await request(app).get("/api/search")).status).toBe(400);
    expect((await request(app).get("/api/search?q=acme&kind=job")).status).toBe(400);
    expect((await request(app).get(`/api/search?q=${"a".repeat(SEARCH_QUERY_MAX + 1)}`)).status).toBe(400);
  });

  it("rate limits one client and says when to retry", async () => {
    const app = appWith();
    let last = 0;
    for (let index = 0; index < 61; index += 1) last = (await request(app).get("/api/search?q=acme")).status;
    expect(last).toBe(429);
    const limited = await request(app).get("/api/search?q=acme");
    expect(limited.status).toBe(429);
    expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("answers 503 when the directory is unavailable", async () => {
    const app = appWith({ search: async () => { throw new CompanyDirectoryUnavailableError(); } });
    const response = await request(app).get("/api/search?q=acme");
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
});
