import { describe, expect, it } from "vitest";
import {
  JOB_CATALOG_ENABLED,
  catalogJobSchema,
  companyJobsResponseSchema,
  companyJobSourceSchema,
} from "./jobCatalog";

describe("job catalog contracts (D-174-job-catalog)", () => {
  it("ships with the switch off (D-097)", () => {
    expect(JOB_CATALOG_ENABLED).toBe(false);
  });

  it("companyJobSourceSchema rejects unknown fields", () => {
    const base = {
      companyId: 1,
      provider: "greenhouse",
      boardToken: "stripe",
      evidenceUrl: "https://stripe.com/jobs",
      status: "verified",
    };
    expect(() => companyJobSourceSchema.parse({ ...base, unexpected: true })).toThrow();
  });

  it("companyJobSourceSchema accepts greenhouse, ashby, lever and refuses others", () => {
    const base = {
      companyId: 1,
      boardToken: "test",
      evidenceUrl: "https://example.com/jobs",
      status: "verified",
    };
    expect(companyJobSourceSchema.safeParse({ ...base, provider: "greenhouse" }).success).toBe(true);
    expect(companyJobSourceSchema.safeParse({ ...base, provider: "ashby" }).success).toBe(true);
    expect(companyJobSourceSchema.safeParse({ ...base, provider: "lever" }).success).toBe(true);
    expect(companyJobSourceSchema.safeParse({ ...base, provider: "workday" }).success).toBe(false);
  });

  it("catalogJobSchema rejects unknown fields and out-of-range levels", () => {
    const base = {
      id: 7,
      companyId: 1,
      sourceId: 2,
      externalId: "abc",
      title: "Designer",
      rawLocation: "Bengaluru",
      locations: ["Bengaluru"],
      workMode: "hybrid",
      department: null,
      jobFunction: null,
      level: 5,
      applyUrl: "https://boards.greenhouse.io/stripe/jobs/1",
      snippet: "x",
      publishedAt: null,
    };
    expect(() => catalogJobSchema.parse({ ...base, extra: 1 })).toThrow();
    expect(() => catalogJobSchema.parse({ ...base, level: 0 })).toThrow();
    expect(() => catalogJobSchema.parse({ ...base, level: 11 })).toThrow();
    expect(() => catalogJobSchema.parse({ ...base, workMode: "flying" })).toThrow();
    expect(() => catalogJobSchema.parse({ ...base, id: undefined })).toThrow();
  });

  it("companyJobsResponseSchema caps a page at 50 jobs and carries honesty fields", () => {
    const job = {
      id: 7,
      companyId: 1,
      sourceId: 2,
      externalId: "abc",
      title: "Designer",
      rawLocation: "Bengaluru",
      locations: ["Bengaluru"],
      workMode: "remote",
      department: null,
      jobFunction: null,
      level: 3,
      applyUrl: "https://boards.greenhouse.io/stripe/jobs/1",
      snippet: "x",
      publishedAt: null,
    };
    const page = {
      jobs: Array.from({ length: 50 }, () => job),
      facets: { locations: {}, levels: {}, functions: {} },
      source: null,
      syncedAt: null,
      completeness: "unavailable",
    };
    expect(companyJobsResponseSchema.parse(page).jobs).toHaveLength(50);
    expect(() => companyJobsResponseSchema.parse({ ...page, jobs: [...page.jobs, job] })).toThrow();
    expect(() => companyJobsResponseSchema.parse({ ...page, completeness: "complete-ish" })).toThrow();
  });
});
