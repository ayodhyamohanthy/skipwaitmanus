import { describe, expect, it } from "vitest";
import { DIRECTORY_EXPANSION_SEED, DIRECTORY_EXPANSION_SEED_2 } from "./companyDirectoryExpansionSeed";
import { LAUNCH_COMPANY_SEED } from "./companyDirectorySeed";
import { JOB_SOURCE_SEED, jobSourceSeedEntrySchema } from "./jobSourceSeed";

// SEARCH-job-sources (D-394): the reviewed boards are well-formed and belong to listed companies.
describe("JOB_SOURCE_SEED", () => {
  it("parses every entry strictly", () => {
    for (const entry of JOB_SOURCE_SEED) expect(jobSourceSeedEntrySchema.parse(entry)).toEqual(entry);
  });

  it("names only companies in the directory seed", () => {
    const slugs = new Set([...LAUNCH_COMPANY_SEED, ...DIRECTORY_EXPANSION_SEED, ...DIRECTORY_EXPANSION_SEED_2].map(company => company.slug));
    expect(JOB_SOURCE_SEED.filter(entry => !slugs.has(entry.companySlug)).map(entry => entry.companySlug)).toEqual([]);
  });

  it("holds each board and each company once", () => {
    const boards = JOB_SOURCE_SEED.map(entry => `${entry.provider}:${entry.boardToken}`);
    expect(new Set(boards).size).toBe(boards.length);
    const companies = JOB_SOURCE_SEED.map(entry => entry.companySlug);
    expect(new Set(companies).size).toBe(companies.length);
  });

  it("marks only well-evidenced boards verified; a board that needs review stays out of the sync", () => {
    for (const entry of JOB_SOURCE_SEED) expect(entry.verified).toBe(entry.evidence !== "needs-review");
    expect(JOB_SOURCE_SEED.find(entry => entry.companySlug === "coinbase")?.verified).toBe(false);
    expect(JOB_SOURCE_SEED.filter(entry => entry.verified)).toHaveLength(13);
  });
});
