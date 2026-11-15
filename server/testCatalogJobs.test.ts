import { describe, expect, it, vi } from "vitest";
import { isTestCatalogJob, publicCatalogJobs } from "./testCatalogJobs";

const job = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  company: "Acme Logistics",
  description: "Senior software engineer",
  targetRoleUrl: "https://careers.acmelogistics.com/jobs/123",
  ...overrides,
}) as unknown as Parameters<typeof isTestCatalogJob>[0];

describe("isTestCatalogJob", () => {
  it.each([
    "acme.com",
    "careers.acme.com",
    "example.com",
    "jobs.example.net",
    "example.org",
    "jobs.example.org",
    "fixture.test",
    "preview.example",
    "staging.invalid",
    "dev.localhost",
  ])("filters reserved or test company host %s", company => {
    expect(isTestCatalogJob(job({ company }))).toBe(true);
  });

  it("filters a reserved host in targetRoleUrl", () => {
    expect(isTestCatalogJob(job({
      company: "Contoso",
      targetRoleUrl: "https://jobs.acme.com/roles/123",
    }))).toBe(true);
  });

  it("filters a test fixture description even when the company is real", () => {
    expect(isTestCatalogJob(job({
      company: "Acme Logistics",
      description: "Test role for loop verification",
    }))).toBe(true);
  });

  it("keeps real Acme Logistics rows and non-URL targetRoleUrl values", () => {
    expect(isTestCatalogJob(job({
      company: "Acme Logistics",
      description: "Build referral tools for customers",
      targetRoleUrl: "Apply through the company careers page",
    }))).toBe(false);
  });

  it("matches reserved hosts on domain boundaries, not as substrings", () => {
    expect(isTestCatalogJob(job({
      company: "Not Acme",
      targetRoleUrl: "https://notacme.com/jobs/123",
    }))).toBe(false);
  });
});

describe("publicCatalogJobs", () => {
  it("wraps listJobs, removes the fabricated catalog row, and preserves real rows", async () => {
    const fixture = job({
      id: 1,
      company: "acme.com",
      description: "Test role for loop verification",
    });
    const real = job({
      id: 2,
      company: "Acme Logistics",
      description: "Build referral tools for customers",
      targetRoleUrl: "Ask for the current role link",
    });
    const listJobs = vi.fn(async (companyId: number) => [fixture, real]);
    const publicListJobs = publicCatalogJobs(listJobs);

    await expect(publicListJobs(42)).resolves.toEqual([real]);
    expect(listJobs).toHaveBeenCalledWith(42);
  });
});
