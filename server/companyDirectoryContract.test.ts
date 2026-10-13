import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adminCompanyCreateSchema,
  adminCompanyUpdateSchema,
  companyDetailResponseSchema,
  companyDirectoryResponseSchema,
  companyDomainSchema,
  companyIdentityOf,
  companySlugSchema,
  deriveCompanyInitials,
  deriveCompanySlug,
  publicCompanySchema,
  type PublicCompany,
} from "../shared/companies";
import { LAUNCH_COMPANY_SEED, type CompanySeed } from "./companyDirectorySeed";

const migration = readFileSync(join(__dirname, "..", "drizzle", "deploy", "0076_company_directory.sql"), "utf8");
const sqlText = (value: string) => `'${value.replace(/'/g, "''")}'`;
const toPublic = (seed: CompanySeed, openToReferrals = false): PublicCompany => ({ slug: seed.slug, name: seed.name, initials: seed.initials, industry: seed.industry, location: seed.location, functions: [...seed.functions], blurb: seed.blurb, domains: [...seed.domains], openToReferrals });

describe("company directory seed", () => {
  it("is the five launch companies in kit order", () => {
    expect(LAUNCH_COMPANY_SEED.map(company => company.name)).toEqual(["SkipWait", "Wipro", "Go Neutrinos", "TCS", "Merkle"]);
    expect(LAUNCH_COMPANY_SEED.map(company => company.domains[0])).toEqual(["skipwait.me", "wipro.com", "goneutrinos.com", "tcs.com", "merkle.com"]);
    const orders = LAUNCH_COMPANY_SEED.map(company => company.sortOrder);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    expect(new Set(LAUNCH_COMPANY_SEED.map(company => company.slug)).size).toBe(LAUNCH_COMPANY_SEED.length);
    expect(new Set(LAUNCH_COMPANY_SEED.flatMap(company => company.domains)).size).toBe(LAUNCH_COMPANY_SEED.flatMap(company => company.domains).length);
  });

  it("every seed row is a valid public directory entry", () => {
    for (const seed of LAUNCH_COMPANY_SEED) expect(publicCompanySchema.parse(toPublic(seed))).toEqual(toPublic(seed));
  });

  it("the deploy migration inserts exactly the seed rows and primary domains", () => {
    for (const [index, seed] of LAUNCH_COMPANY_SEED.entries()) {
      const values = [sqlText(seed.slug), sqlText(seed.name), sqlText(seed.initials), sqlText(seed.industry), sqlText(seed.location), sqlText(JSON.stringify(seed.functions)), sqlText(seed.blurb)];
      const row = index === 0
        ? `SELECT ${values[0]} AS slug, ${values[1]} AS name, ${values[2]} AS initials, ${values[3]} AS industry, ${values[4]} AS location, ${values[5]} AS functions, ${values[6]} AS blurb, ${seed.sortOrder} AS sortOrder`
        : `UNION ALL SELECT ${values.join(", ")}, ${seed.sortOrder}`;
      expect(migration).toContain(row);
      const domain = index === 0 ? `SELECT ${sqlText(seed.slug)} AS slug, ${sqlText(seed.domains[0]!)} AS domain` : `UNION ALL SELECT ${sqlText(seed.slug)}, ${sqlText(seed.domains[0]!)}`;
      expect(migration).toContain(domain);
    }
    expect(migration.match(/UNION ALL SELECT/g)).toHaveLength((LAUNCH_COMPANY_SEED.length - 1) * 2);
    expect(migration).toContain("SET NAMES utf8mb4;");
    expect(migration).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM `companies` c WHERE c\.slug = v\.slug\)/);
    expect(migration).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM `companyDomains` d WHERE d\.domain = v\.domain\)/);
  });
});

describe("company directory contract", () => {
  const entry = toPublic(LAUNCH_COMPANY_SEED[1]!, true);

  it("accepts a directory whose openCount matches its open companies and rejects a mismatch", () => {
    const companies = [entry, toPublic(LAUNCH_COMPANY_SEED[0]!, false)];
    expect(companyDirectoryResponseSchema.safeParse({ companies, openCount: 1 }).success).toBe(true);
    expect(companyDirectoryResponseSchema.safeParse({ companies, openCount: 2 }).success).toBe(false);
    expect(companyDirectoryResponseSchema.safeParse({ companies: [], openCount: 0 }).success).toBe(true);
    expect(companyDetailResponseSchema.parse({ company: entry }).company.slug).toBe("wipro");
  });

  it("strips fields a public reader must never see", () => {
    const parsed = publicCompanySchema.parse({ ...entry, referrerCount: 4, referrerIds: [7], id: 2 });
    expect(Object.keys(parsed).sort()).toEqual(["blurb", "domains", "functions", "industry", "initials", "location", "name", "openToReferrals", "slug"]);
  });

  it.each([
    ["uppercase slug", { slug: "Wipro" }],
    ["slug longer than 48", { slug: "a".repeat(49) }],
    ["initials longer than 4", { initials: "ABCDE" }],
    ["empty functions", { functions: [] }],
    ["duplicate functions", { functions: ["Data", "data"] }],
    ["no domains", { domains: [] }],
    ["a personal-mail domain", { domains: ["gmail.com"] }],
    ["a domain without a TLD", { domains: ["localhost"] }],
    ["a non-boolean availability", { openToReferrals: "yes" }],
    ["an empty blurb", { blurb: "  " }],
  ])("rejects %s", (_label, patch) => {
    expect(publicCompanySchema.safeParse({ ...entry, ...patch }).success).toBe(false);
  });

  it("normalizes domains to lowercase and validates slugs", () => {
    expect(companyDomainSchema.parse("  Careers.Wipro.COM ")).toBe("careers.wipro.com");
    expect(companyDomainSchema.safeParse("https://wipro.com").success).toBe(false);
    expect(companySlugSchema.safeParse("go-neutrinos").success).toBe(true);
    expect(companySlugSchema.safeParse("go neutrinos").success).toBe(false);
  });

  it("admin create is strict and requires the descriptors and a primary domain", () => {
    const valid = { name: "Acme", industry: "Retail", location: "Global", functions: ["Engineering"], blurb: "Build retail tools.", primaryDomain: "acme.com" };
    expect(adminCompanyCreateSchema.parse(valid)).toEqual(valid);
    expect(adminCompanyCreateSchema.safeParse({ ...valid, openToReferrals: true }).success).toBe(false);
    expect(adminCompanyCreateSchema.safeParse({ ...valid, primaryDomain: "outlook.com" }).success).toBe(false);
    const { blurb: _blurb, ...missing } = valid;
    expect(adminCompanyCreateSchema.safeParse(missing).success).toBe(false);
    expect(adminCompanyCreateSchema.safeParse({ ...valid, status: "deleted" }).success).toBe(false);
  });

  it("admin update needs at least one known field", () => {
    expect(adminCompanyUpdateSchema.safeParse({}).success).toBe(false);
    expect(adminCompanyUpdateSchema.safeParse({ status: "hidden" }).success).toBe(true);
    expect(adminCompanyUpdateSchema.safeParse({ slug: "renamed" }).success).toBe(false);
    expect(adminCompanyUpdateSchema.safeParse({ addDomains: ["wipro.co.in"], removeDomains: ["wipro.in"] }).success).toBe(true);
  });

  it("derives slugs and initials for admin-created companies", () => {
    expect(deriveCompanySlug("Go Neutrinos")).toBe("go-neutrinos");
    expect(deriveCompanySlug("  Tata Consultancy Services (TCS) ")).toBe("tata-consultancy-services-tcs");
    expect(deriveCompanySlug("!!!")).toBe("");
    expect(deriveCompanyInitials("Go Neutrinos")).toBe("GN");
    expect(deriveCompanyInitials("Merkle")).toBe("M");
    expect(deriveCompanyInitials("   ")).toBe("?");
  });

  it("resolves a row's display identity from server fields, falling back to the domain", () => {
    expect(companyIdentityOf({ companyDomain: "goneutrinos.com", companyName: "Go Neutrinos", companyInitials: "GN" })).toEqual({ name: "Go Neutrinos", mark: "GN" });
    expect(companyIdentityOf({ companyDomain: "acme.io", companyName: null, companyInitials: null })).toEqual({ name: "acme.io", mark: "A" });
    expect(companyIdentityOf({ companyDomain: "acme.io" })).toEqual({ name: "acme.io", mark: "A" });
    expect(companyIdentityOf({ companyDomain: "", companyName: " " })).toEqual({ name: "", mark: "?" });
  });
});
