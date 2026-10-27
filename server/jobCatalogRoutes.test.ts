import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { JOB_CATALOG_ENABLED, companyJobsResponseSchema } from "../shared/jobCatalog";
import { assignJobLevel } from "../shared/jobLevel";
import { registerJobCatalogRoutes, type JobCatalogRouteDeps, type StoredCatalogJob } from "./jobCatalogRoutes";
import { registerPrivateReferralRoutes } from "./privateReferralRoutes";
import { captureServerError } from "./sentry";

vi.mock("./sentry", () => ({ captureServerError: vi.fn() }));

const admin = { account: { id: 1, role: "admin" } };
const member = { account: { id: 2, role: "user" } };

function jobRow(over: Partial<StoredCatalogJob> = {}): StoredCatalogJob {
  return {
    id: 1,
    companyId: 10,
    sourceId: 5,
    externalId: "1",
    title: "Software Engineer",
    rawLocation: "Bengaluru",
    locations: ["Bengaluru"],
    workMode: "onsite",
    department: "Engineering",
    jobFunction: "Engineering",
    level: assignJobLevel({ title: "Software Engineer", description: "Build things.", url: "https://boards.greenhouse.io/stripe/jobs/1" }).level,
    applyUrl: "https://boards.greenhouse.io/stripe/jobs/1",
    snippet: "Build things.",
    publishedAt: "2026-10-20T10:00:00.000Z",
    closedAt: null,
    ...over,
  };
}

function appWith(over: Partial<JobCatalogRouteDeps> = {}, rows: StoredCatalogJob[] = []) {
  const maybeRefresh = vi.fn();
  const store = {
    findCompanyBySlug: vi.fn(async (slug: string) => (slug === "acme" ? { id: 10, slug: "acme" } : slug === "otherco" ? { id: 20, slug: "otherco" } : null)),
    getSourceForCompany: vi.fn(async (companyId: number) =>
      companyId === 10
        ? { id: 5, companyId: 10, provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers", status: "verified" as const, lastFetchedAt: new Date("2026-10-25T10:00:00Z") }
        : null),
    listCatalogJobs: vi.fn(async (companyId: number) => rows.filter((r) => r.companyId === companyId)),
    createJobSource: vi.fn(async (input: { companyId: number; provider: string; boardToken: string; evidenceUrl: string }) => ({ id: 9, status: "unverified" as const, ...input })),
  };
  const app = express();
  app.use(express.json());
  const deps: JobCatalogRouteDeps = {
    enabled: true,
    resolveIdentity: async () => admin,
    recordActivity: async () => undefined,
    store: store as never,
    maybeRefresh,
    now: () => new Date("2026-10-25T11:30:00Z"),
    ...over,
  };
  registerJobCatalogRoutes(app, deps);
  return { app, store, maybeRefresh };
}

describe("GET /api/companies/:slug/jobs (D-174-job-catalog)", () => {
  it("answers unavailable with the switch off (default is the shipped flag)", async () => {
    const { app } = appWith({ enabled: undefined });
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.status).toBe(200);
    expect(res.body.completeness).toBe("unavailable");
    expect(res.body.jobs).toEqual([]);
    expect(JOB_CATALOG_ENABLED).toBe(false);
    companyJobsResponseSchema.parse(res.body);
  });

  it("serves open jobs with facets and a parseable contract", async () => {
    const { app } = appWith({}, [jobRow(), jobRow({ id: 2, externalId: "2", title: "Designer", jobFunction: "Design", locations: ["Remote"], workMode: "remote", level: 4 })]);
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.status).toBe(200);
    companyJobsResponseSchema.parse(res.body);
    expect(res.body.completeness).toBe("complete");
    expect(res.body.jobs).toHaveLength(2);
    expect(res.body.facets.locations).toMatchObject({ Bengaluru: 1, Remote: 1 });
    expect(res.body.facets.functions).toMatchObject({ Engineering: 1, Design: 1 });
    expect(res.body.source.boardToken).toBe("acme");
  });

  it("a closed job leaves the API", async () => {
    const { app } = appWith({}, [jobRow(), jobRow({ id: 2, externalId: "2", title: "Old Role", closedAt: "2026-10-24T00:00:00.000Z" })]);
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.body.jobs.map((j: { title: string }) => j.title)).toEqual(["Software Engineer"]);
  });

  it("the served job keeps its catalog id so a job-locked request can name it (D-174 §5.8)", async () => {
    const { app } = appWith({}, [jobRow({ id: 42 })]);
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.status).toBe(200);
    expect(res.body.jobs[0].id).toBe(42);
    companyJobsResponseSchema.parse(res.body);
  });

  it("serves newest first and puts undated jobs last (D-193 §4.2)", async () => {
    const rows = [
      jobRow({ id: 1, externalId: "1", title: "Older", publishedAt: "2026-10-20T10:00:00.000Z" }),
      jobRow({ id: 2, externalId: "2", title: "Newer", publishedAt: "2026-10-24T10:00:00.000Z" }),
      jobRow({ id: 4, externalId: "4", title: "Tie newest", publishedAt: "2026-10-24T10:00:00.000Z" }),
      jobRow({ id: 3, externalId: "3", title: "Undated", publishedAt: null }),
    ];
    const { app } = appWith({}, rows);
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.body.jobs.map((j: { title: string }) => j.title)).toEqual(["Tie newest", "Newer", "Older", "Undated"]);
  });

  it("one company's slug never returns another company's jobs", async () => {
    const rows = [jobRow(), jobRow({ id: 3, companyId: 20, sourceId: 6, externalId: "9", title: "Other Company Role" })];
    const { app } = appWith({}, rows);
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.body.jobs.map((j: { title: string }) => j.title)).toEqual(["Software Engineer"]);
    const other = await request(app).get("/api/companies/otherco/jobs");
    expect(other.body.jobs).toEqual([]);
    expect(other.body.completeness).toBe("unavailable");
  });

  it("the served level equals assignJobLevel on (title, snippet, applyUrl)", async () => {
    const row = jobRow();
    const { app } = appWith({}, [row]);
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.body.jobs[0].level).toBe(assignJobLevel({ title: row.title, description: row.snippet, url: row.applyUrl }).level);
  });

  it("filters by q, location, level and function, and pages at 50 with a cursor", async () => {
    const many = Array.from({ length: 60 }, (_, i) => jobRow({ id: i + 1, externalId: String(i + 1), title: i % 2 ? "Engineer" : "Analyst", level: (i % 10) + 1 }));
    const { app } = appWith({}, many);
    const page1 = await request(app).get("/api/companies/acme/jobs");
    expect(page1.body.jobs).toHaveLength(50);
    const page2 = await request(app).get(`/api/companies/acme/jobs?cursor=${encodeURIComponent(page1.body.nextCursor)}`);
    expect(page2.body.jobs).toHaveLength(10);
    const filtered = await request(app).get("/api/companies/acme/jobs?q=analyst&level=2");
    expect(filtered.body.jobs.every((j: { title: string; level: number }) => /analyst/i.test(j.title) && j.level === 2)).toBe(true);
  });

  it("a company without a verified source answers unavailable with source null", async () => {
    const { app, store } = appWith();
    store.getSourceForCompany.mockResolvedValue({ id: 5, companyId: 10, provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers", status: "unverified", lastFetchedAt: null });
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.body.completeness).toBe("unavailable");
    expect(res.body.source).toBeNull();
  });

  it("a stale source triggers one refresh per 60 seconds", async () => {
    const { app, store, maybeRefresh } = appWith();
    store.getSourceForCompany.mockResolvedValue({ id: 5, companyId: 10, provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers", status: "verified", lastFetchedAt: new Date("2026-10-25T09:00:00Z") });
    await request(app).get("/api/companies/acme/jobs");
    await request(app).get("/api/companies/acme/jobs");
    expect(maybeRefresh).toHaveBeenCalledTimes(1);
  });
});

describe("catalog rows never leak into the legacy /api/jobs list", () => {
  it("/api/jobs serves only the legacy jobs store", async () => {
    const catalogRows = [jobRow({ title: "Catalog Only Role" })];
    const { app } = appWith({}, catalogRows);
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => member,
      recordActivity: async () => undefined,
      listJobs: async () => [{ id: 1, title: "Senior Frontend Engineer", company: "acme.com" }],
    } as never);
    const legacy = await request(app).get("/api/jobs");
    expect(legacy.body.jobs.map((j: { title: string }) => j.title)).toEqual(["Senior Frontend Engineer"]);
    expect(JSON.stringify(legacy.body)).not.toContain("Catalog Only Role");
  });
});

describe("POST /api/admin/job-sources (D-174-job-catalog)", () => {
  it("rejects a non-admin", async () => {
    const { app } = appWith({ resolveIdentity: async () => member });
    const res = await request(app).post("/api/admin/job-sources").send({ companySlug: "acme", provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers" });
    expect(res.status).toBe(403);
  });

  it("registers a source as unverified - verification is a human step", async () => {
    const { app, store } = appWith();
    const res = await request(app).post("/api/admin/job-sources").send({ companySlug: "acme", provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers" });
    expect(res.status).toBe(201);
    expect(res.body.source.status).toBe("unverified");
    expect(store.createJobSource).toHaveBeenCalledWith({ companyId: 10, provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers" });
  });

  it("rejects an unknown field in the body", async () => {
    const { app } = appWith();
    const res = await request(app).post("/api/admin/job-sources").send({ companySlug: "acme", provider: "greenhouse", boardToken: "acme", evidenceUrl: "https://acme.example/careers", surprise: true });
    expect(res.status).toBe(400);
  });
});

describe("job catalog error reporting (PR #650 review finding)", () => {
  it("a store failure answers 500 and reports to Sentry", async () => {
    const { app, store } = appWith();
    store.listCatalogJobs.mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).get("/api/companies/acme/jobs");
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("We could not load the job catalog right now");
    expect(captureServerError).toHaveBeenCalled();
  });
});
