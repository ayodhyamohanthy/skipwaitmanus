import { describe, expect, it } from "vitest";
import { isTestCatalogJob } from "./db";

describe("public job catalog excludes fixtures (#98)", () => {
  it("drops the acme.com loop-verification role seen live on Sep 24", () => {
    expect(isTestCatalogJob({ company: "Sample role", targetRoleUrl: "https://acme.com/careers/senior-frontend", description: "Test role for loop verification" })).toBe(true);
  });
  it("drops reserved example/test domains", () => {
    for (const url of ["https://example.com/jobs/1", "https://jobs.example.org/x", "https://careers.foo.test/a", "https://x.invalid/"]) expect(isTestCatalogJob({ company: "Co", targetRoleUrl: url, description: "Real" })).toBe(true);
    expect(isTestCatalogJob({ company: "example.com", targetRoleUrl: null, description: "Real" })).toBe(true);
  });
  it("keeps real roles", () => {
    expect(isTestCatalogJob({ company: "Google", targetRoleUrl: "https://careers.google.com/jobs/123", description: "Build search infrastructure." })).toBe(false);
    expect(isTestCatalogJob({ company: "Acme Logistics", targetRoleUrl: "https://acmelogistics.in/careers/1", description: "Testing lead for QA team" })).toBe(false);
    expect(isTestCatalogJob({ company: "Zoho", targetRoleUrl: "not a url", description: "Role" })).toBe(false);
  });
});
