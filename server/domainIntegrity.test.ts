import { describe, expect, it } from "vitest";
import { buildDomainIntegrityReport, classifyStoredDomain } from "./domainIntegrity";

describe("domain integrity diagnostic", () => {
  it.each([
    ["acme.co.uk", "valid_registrable_domain", undefined], ["co.uk", "public_suffix_only", undefined],
    ["jobs.acme.com.au", "valid_but_not_canonical", "acme.com.au"], ["ACME.COM", "valid_but_not_canonical", "acme.com"],
    ["localhost", "malformed_ip_localhost", undefined], ["127.0.0.1", "malformed_ip_localhost", undefined], ["https://acme.com", "malformed_ip_localhost", undefined],
  ])("classifies %s", (value, classification, suggestedDomain) => expect(classifyStoredDomain(value)).toEqual({ classification, ...(suggestedDomain ? { suggestedDomain } : {}) }));

  it("spans every marketplace table and keeps activity-log domains as evidence only", () => {
    const report = buildDomainIntegrityReport([
      { table: "profiles", rowId: 1, storedDomain: "acme.com" },
      { table: "jobs", rowId: 2, storedDomain: "co.uk" },
      { table: "companyOpportunities", rowId: 3, storedDomain: "jobs.acme.com.au" },
      { table: "referralAvailabilitySlots", rowId: 4, storedDomain: "localhost" },
      { table: "referrerFastTrackLinks", rowId: 5, storedDomain: "ACME.COM" },
      { table: "companyCoverageInvitations", rowId: 6, storedDomain: "example.co.in" },
      { table: "operationalActivityLogs", rowId: 7, storedDomain: "com", evidenceOnly: true },
    ]);
    expect(report.affectedCount).toBe(4);
    expect(report.affectedRows.map(row => row.table)).toEqual(["jobs", "companyOpportunities", "referralAvailabilitySlots", "referrerFastTrackLinks"]);
    expect(report.evidence).toMatchObject({ affectedCount: 1, aggregates: { public_suffix_only: 1 } });
  });
});
