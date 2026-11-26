import { describe, expect, it } from "vitest";
import {
  JOB_SOURCE_SEED,
  jobSourceSeedSchema,
  getJobSourceForCompany,
  type JobSourceSeed,
} from "./jobSourceSeed";
import { LAUNCH_COMPANY_SEED } from "./companyDirectorySeed";

describe("job source seed (SEARCH-job-sources / D-394)", () => {
  it("contains verified sources for covered companies", () => {
    expect(JOB_SOURCE_SEED.length).toBeGreaterThanOrEqual(10);
  });

  it("every seed entry conforms to the schema", () => {
    for (const entry of JOB_SOURCE_SEED) {
      const parsed = jobSourceSeedSchema.safeParse(entry);
      expect(parsed.success, `Invalid seed entry for ${entry.companySlug}: ${JSON.stringify(parsed)}`).toBe(true);
      expect(entry.status).toBe("verified");
      expect(entry.evidenceUrl.startsWith("https://")).toBe(true);
      expect(Number.isNaN(Date.parse(entry.verifiedAt))).toBe(false);
    }
  });

  it("has unique (provider, boardToken) pairs per database constraint", () => {
    const keys = new Set<string>();
    for (const entry of JOB_SOURCE_SEED) {
      const key = `${entry.provider}:${entry.boardToken.toLowerCase()}`;
      expect(keys.has(key), `Duplicate provider:token pair found: ${key}`).toBe(false);
      keys.add(key);
    }
  });

  it("has unique company slugs across seed entries", () => {
    const slugs = new Set<string>();
    for (const entry of JOB_SOURCE_SEED) {
      expect(slugs.has(entry.companySlug), `Duplicate companySlug found: ${entry.companySlug}`).toBe(false);
      slugs.add(entry.companySlug);
    }
  });

  it("includes verified public boards for key listed companies (D-394)", () => {
    const coveredSlugs = new Set(JOB_SOURCE_SEED.map((s) => s.companySlug));
    expect(coveredSlugs.has("stripe")).toBe(true);
    expect(coveredSlugs.has("openai")).toBe(true);
    expect(coveredSlugs.has("coinbase")).toBe(true);
    expect(coveredSlugs.has("discord")).toBe(true);
    expect(coveredSlugs.has("mongodb")).toBe(true);
    expect(coveredSlugs.has("pinterest")).toBe(true);
    expect(coveredSlugs.has("snowflake")).toBe(true);
    expect(coveredSlugs.has("1password")).toBe(true);
    expect(coveredSlugs.has("sofi")).toBe(true);
    expect(coveredSlugs.has("gemini")).toBe(true);
    expect(coveredSlugs.has("nintendo")).toBe(true);
  });

  it("launch companies without public Greenhouse/Ashby/Lever boards are not seeded (honesty rule)", () => {
    const coveredSlugs = new Set(JOB_SOURCE_SEED.map((s) => s.companySlug));
    // None of the 5 launch companies use public Greenhouse, Ashby, or Lever boards
    for (const launch of LAUNCH_COMPANY_SEED) {
      expect(coveredSlugs.has(launch.slug), `${launch.slug} should not be seeded without a verified public board`).toBe(false);
    }
  });

  it("getJobSourceForCompany looks up seed entry by company slug", () => {
    const stripe = getJobSourceForCompany("stripe");
    expect(stripe).toBeDefined();
    expect(stripe?.provider).toBe("greenhouse");
    expect(stripe?.boardToken).toBe("stripe");
    expect(stripe?.evidenceUrl).toContain("stripe.com");

    const openai = getJobSourceForCompany("openai");
    expect(openai).toBeDefined();
    expect(openai?.provider).toBe("ashby");
    expect(openai?.boardToken).toBe("openai");

    const missing = getJobSourceForCompany("wipro");
    expect(missing).toBeUndefined();
  });
});
