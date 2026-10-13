import { describe, expect, it } from "vitest";
import { companyDirectoryResponseSchema } from "../shared/companies";
import { attachCompanyIdentities, createCompanyDirectory, isOpenReferrer } from "./companyDirectory";
import { planDomainChanges, CompanyInputError } from "./companyDirectoryAdmin";
import { seedCompanySource, type CompanyDirectorySource, type CompanyDomainRecord, type CompanyRecord, type ReferrerCandidate } from "./companyDirectorySource";
import { LAUNCH_COMPANY_SEED } from "./companyDirectorySeed";

const VERIFIED_AT = new Date("2026-09-01T00:00:00.000Z");
const UPDATED_AT = new Date("2026-10-01T00:00:00.000Z");

function company(id: number, slug: string, patch: Partial<CompanyRecord> = {}): CompanyRecord {
  return { id, slug, name: slug.toUpperCase(), initials: slug.charAt(0).toUpperCase(), industry: "Technology", location: "Global", functions: '["Engineering"]', blurb: `About ${slug}.`, status: "listed", sortOrder: id * 10, updatedAt: UPDATED_AT, ...patch };
}

/** A referrer who satisfies every availability rule; tests break one rule at a time. */
function referrer(userId: number, domain: string, patch: Partial<ReferrerCandidate> = {}): ReferrerCandidate {
  return { userId, accountType: "referrer", workEmailDomain: domain, workEmailVerifiedAt: VERIFIED_AT, paused: false, referralCapacity: 3, userSuspended: false, personSuspended: null, ...patch };
}

function source(input: { companies: CompanyRecord[]; domains: CompanyDomainRecord[]; candidates?: ReferrerCandidate[]; allocated?: Record<number, number> }): CompanyDirectorySource & { candidateQueries: string[][] } {
  const candidateQueries: string[][] = [];
  return {
    candidateQueries,
    loadCompanies: async () => input.companies,
    loadDomains: async () => input.domains,
    // Mirrors the SQL filter: only rows whose domain was asked for come back.
    loadReferrerCandidates: async domains => { candidateQueries.push([...domains]); return (input.candidates ?? []).filter(candidate => domains.includes((candidate.workEmailDomain ?? "").toLowerCase())); },
    loadAllocatedSlotCounts: async ids => new Map(ids.map(id => [id, input.allocated?.[id] ?? 0])),
  };
}

const acme = company(1, "acme");
const beta = company(2, "beta");
const domains: CompanyDomainRecord[] = [
  { companyId: 1, domain: "acme.com", isPrimary: true },
  { companyId: 1, domain: "acme.co.uk", isPrimary: false },
  { companyId: 2, domain: "beta.io", isPrimary: true },
];

describe("company directory availability", () => {
  it("opens a company for one verified, unpaused, unsuspended referrer with free capacity", async () => {
    const directory = createCompanyDirectory(source({ companies: [acme, beta], domains, candidates: [referrer(10, "acme.com")], allocated: { 10: 2 } }));
    const listed = await directory.list();
    expect(listed.companies.map(entry => [entry.slug, entry.openToReferrals])).toEqual([["acme", true], ["beta", false]]);
    expect(listed.openCount).toBe(1);
    expect(companyDirectoryResponseSchema.safeParse(listed).success).toBe(true);
  });

  it.each([
    ["paused", referrer(10, "acme.com", { paused: true }), 0],
    ["unverified", referrer(10, "acme.com", { workEmailVerifiedAt: null }), 0],
    ["a seeker, not a referrer", referrer(10, "acme.com", { accountType: "job_seeker" }), 0],
    ["at capacity", referrer(10, "acme.com", { referralCapacity: 2 }), 2],
    ["over capacity", referrer(10, "acme.com"), 5],
    ["zero capacity", referrer(10, "acme.com", { referralCapacity: 0 }), 0],
    ["a suspended account", referrer(10, "acme.com", { userSuspended: true }), 0],
    ["a suspended canonical person", referrer(10, "acme.com", { personSuspended: true }), 0],
    ["verified at another company", referrer(10, "beta.io"), 0],
    ["verified at an unlisted domain", referrer(10, "acme.org"), 0],
  ])("a referrer who is %s does not open the company", async (_label, candidate, allocated) => {
    const directory = createCompanyDirectory(source({ companies: [acme], domains, candidates: [candidate], allocated: { 10: allocated } }));
    const listed = await directory.list();
    expect(listed.companies[0]?.openToReferrals).toBe(false);
    expect(listed.openCount).toBe(0);
    expect((await directory.get("acme"))?.openToReferrals).toBe(false);
  });

  it("uses the default capacity of 3 when none is saved, and counts alias domains", async () => {
    expect(isOpenReferrer(referrer(10, "acme.com", { referralCapacity: null }), "acme.com", 2)).toBe(true);
    expect(isOpenReferrer(referrer(10, "acme.com", { referralCapacity: null }), "acme.com", 3)).toBe(false);
    const directory = createCompanyDirectory(source({ companies: [acme], domains, candidates: [referrer(11, "ACME.CO.UK")] }));
    expect((await directory.get("acme"))?.openToReferrals).toBe(true);
  });

  it("one open referrer is enough even when colleagues are closed", async () => {
    const candidates = [referrer(10, "acme.com", { paused: true }), referrer(11, "acme.com", { referralCapacity: 1 }), referrer(12, "acme.co.uk")];
    const directory = createCompanyDirectory(source({ companies: [acme], domains, candidates, allocated: { 11: 1 } }));
    expect((await directory.list()).openCount).toBe(1);
  });

  it("never exposes referrer ids, counts or names", async () => {
    const candidates = [referrer(4242, "acme.com"), referrer(4343, "acme.com")];
    const directory = createCompanyDirectory(source({ companies: [acme], domains, candidates, allocated: { 4242: 1 } }));
    const serialized = JSON.stringify([await directory.list(), await directory.get("acme")]);
    expect(serialized).not.toMatch(/4242|4343|userId|referrerId|capacity|allocated|paused|suspended|referrerCount/);
    expect(Object.keys((await directory.list()).companies[0]!).sort()).toEqual(["blurb", "domains", "functions", "industry", "initials", "location", "name", "openToReferrals", "slug"]);
  });

  it("only asks for referrers on the requested company's domains", async () => {
    const fake = source({ companies: [acme, beta], domains });
    await createCompanyDirectory(fake).get("beta");
    expect(fake.candidateQueries).toEqual([["beta.io"]]);
  });
});

describe("company directory listing", () => {
  const hidden = company(3, "gamma", { status: "hidden" });
  const corrupt = company(4, "delta", { functions: "not json" });
  const all = [beta, hidden, corrupt, acme];
  const withDomains = [...domains, { companyId: 3, domain: "gamma.dev", isPrimary: true }, { companyId: 4, domain: "delta.dev", isPrimary: true }];

  it("lists listed companies by sortOrder and hides hidden ones from public reads", async () => {
    const directory = createCompanyDirectory(source({ companies: all, domains: withDomains }));
    expect((await directory.list()).companies.map(entry => entry.slug)).toEqual(["acme", "beta"]);
    expect(await directory.get("gamma")).toBeUndefined();
    expect(await directory.get("nope")).toBeUndefined();
    expect((await directory.get("acme"))?.domains).toEqual(["acme.com", "acme.co.uk"]);
  });

  it("gives admins every valid company with status, primary domain and search", async () => {
    const directory = createCompanyDirectory(source({ companies: all, domains: withDomains }));
    const admin = await directory.adminList();
    expect(admin.map(entry => [entry.slug, entry.status, entry.primaryDomain])).toEqual([["acme", "listed", "acme.com"], ["beta", "listed", "beta.io"], ["gamma", "hidden", "gamma.dev"]]);
    expect((await directory.adminList("co.uk")).map(entry => entry.slug)).toEqual(["acme"]);
    expect((await directory.adminGet(3))?.status).toBe("hidden");
  });

  it("leaves out a row whose stored functions fail the contract instead of guessing", async () => {
    const directory = createCompanyDirectory(source({ companies: all, domains: withDomains }));
    expect((await directory.adminList()).some(entry => entry.slug === "delta")).toBe(false);
  });

  it("resolves display identity for any registered domain, hidden included", async () => {
    const directory = createCompanyDirectory(source({ companies: all, domains: withDomains }));
    const identities = await directory.resolveIdentities(["ACME.co.uk", "gamma.dev", "unknown.org", ""]);
    expect(Object.fromEntries(identities)).toEqual({ "acme.co.uk": { slug: "acme", name: "ACME", initials: "A" }, "gamma.dev": { slug: "gamma", name: "GAMMA", initials: "G" } });
    expect(await directory.findByDomain("acme.co.uk")).toEqual({ name: "ACME", domains: ["acme.com", "acme.co.uk"] });
    expect(await directory.findByDomain("unknown.org")).toBeUndefined();
  });

  it("the database-less dev source is the launch seed with nobody open", async () => {
    const listed = await createCompanyDirectory(seedCompanySource()).list();
    expect(listed.openCount).toBe(0);
    expect(listed.companies.map(entry => ({ slug: entry.slug, name: entry.name, initials: entry.initials, domains: entry.domains }))).toEqual(LAUNCH_COMPANY_SEED.map(seed => ({ slug: seed.slug, name: seed.name, initials: seed.initials, domains: [...seed.domains] })));
  });
});

describe("row company identities", () => {
  it("adds directory names and initials, null outside the directory", async () => {
    const rows = [{ id: 1, companyDomain: "wipro.com" }, { id: 2, companyDomain: "acme.io" }, { id: 3, companyDomain: null }];
    const enriched = await attachCompanyIdentities(rows, row => row.companyDomain, async () => new Map([["wipro.com", { slug: "wipro", name: "Wipro", initials: "W" }]]));
    expect(enriched).toEqual([{ id: 1, companyDomain: "wipro.com", companyName: "Wipro", companyInitials: "W" }, { id: 2, companyDomain: "acme.io", companyName: null, companyInitials: null }, { id: 3, companyDomain: null, companyName: null, companyInitials: null }]);
  });

  it("fails open: a lookup error leaves names null and the rows intact", async () => {
    const enriched = await attachCompanyIdentities([{ id: 1, companyDomain: "wipro.com" }], row => row.companyDomain, async () => { throw new Error("db down"); });
    expect(enriched).toEqual([{ id: 1, companyDomain: "wipro.com", companyName: null, companyInitials: null }]);
  });
});

describe("admin domain changes", () => {
  const owned = [{ domain: "acme.com", isPrimary: true }, { domain: "acme.co.uk", isPrimary: false }];
  it("adds new domains, ignores ones already owned and removes aliases", () => {
    expect(planDomainChanges(owned, ["acme.de", "acme.com", "acme.de"], ["acme.co.uk"])).toEqual({ insert: ["acme.de"], delete: ["acme.co.uk"] });
  });
  it.each([
    ["the primary domain", [], ["acme.com"], /primary domain/],
    ["a domain the company does not own", [], ["beta.io"], /not a domain of this company/],
    ["the same domain added and removed", ["acme.fr"], ["acme.fr"], /added and removed/],
  ])("refuses to remove %s", (_label, add, remove, message) => {
    expect(() => planDomainChanges(owned, add, remove)).toThrow(CompanyInputError);
    expect(() => planDomainChanges(owned, add, remove)).toThrow(message);
  });
});
