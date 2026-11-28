// PRIVACY-own-employer-guard (D-414 (3), D-415 (2)). The decision runs on an in-memory store with the same meaning as
// the drizzle store; the drizzle store's SQL is pinned separately (drizzle.mock(), no database); the route test pins
// the 409 body the composer reads; the db.ts test pins that the guard runs before any wallet read, lock or write.
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/mysql2";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { OWN_EMPLOYER, isOwnEmployer, isSameEmployerDomain, ownEmployerMessage, ownEmployerRefusalSchema, parseOwnEmployerRefusal } from "../shared/ownEmployer";
import { assertNotOwnEmployer, OwnEmployerError, ownEmployerQueries, type OwnEmployerStore } from "./ownEmployerGuard";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

type World = {
  users: { id: number; person: number | null }[];
  profiles: { userId: number; domain: string | null; verifiedAt: Date | null }[];
  companies: { id: number; name: string; domains: string[] }[];
  requests: { userId: number; key: string }[];
};

/** The drizzle store's meaning over plain rows. */
function memoryStore(world: World): OwnEmployerStore {
  return {
    async personUserIds(userId) {
      const own = world.users.find(row => row.id === userId);
      if (!own || own.person === null) return [userId];
      return Array.from(new Set([userId, ...world.users.filter(row => row.person === own.person).map(row => row.id)]));
    },
    async verifiedWorkEmails(userIds) {
      return world.profiles.filter(row => userIds.includes(row.userId) && row.verifiedAt !== null).map(row => ({ workEmailDomain: row.domain, workEmailVerifiedAt: row.verifiedAt }));
    },
    async companyOf(domain) {
      const company = world.companies.find(row => row.domains.includes(domain));
      return company ? { name: company.name, domains: company.domains } : null;
    },
    async hasRequestWithKey(userId, key) {
      return world.requests.some(row => row.userId === userId && row.key === key);
    },
  };
}

const VERIFIED = new Date("2026-11-01T00:00:00Z");
const KEY = "own-employer-key-0001";
const world = (): World => ({
  users: [
    { id: 1, person: 10 }, // the seeker's personal login
    { id: 2, person: 10 }, // the same person's work-email account (D-057)
    { id: 3, person: 20 }, // a colleague: another person
    { id: 4, person: null }, // a seeker with no canonical person yet
    { id: 5, person: 30 },
  ],
  profiles: [
    { userId: 2, domain: "acme.com", verifiedAt: VERIFIED },
    { userId: 3, domain: "acme.com", verifiedAt: VERIFIED },
    { userId: 5, domain: "fb.com", verifiedAt: VERIFIED },
  ],
  companies: [
    { id: 100, name: "Acme", domains: ["acme.com"] },
    { id: 200, name: "Meta", domains: ["meta.com", "fb.com"] },
  ],
  requests: [],
});

const check = (userId: number, companyDomain: string, extra: Partial<Parameters<typeof assertNotOwnEmployer>[1]> = {}) => ({ userId, companyDomain, idempotencyKey: KEY, ...extra });

describe("own-employer domains (shared/ownEmployer.ts)", () => {
  it("matches equal domains and subdomains either way, never a different name", () => {
    expect(isSameEmployerDomain("acme.com", "acme.com")).toBe(true);
    expect(isSameEmployerDomain(" ACME.com. ", "www.acme.com")).toBe(true);
    expect(isSameEmployerDomain("us.ibm.com", "ibm.com")).toBe(true);
    expect(isSameEmployerDomain("amazon.com", "aws.amazon.com")).toBe(true);
    expect(isSameEmployerDomain("hp.com", "hpe.com")).toBe(false);
    expect(isSameEmployerDomain("notacme.com", "acme.com")).toBe(false);
    expect(isSameEmployerDomain("com", "acme.com")).toBe(false);
    expect(isSameEmployerDomain("", "acme.com")).toBe(false);
  });
  it("counts only verified work emails", () => {
    expect(isOwnEmployer([{ workEmailDomain: "acme.com", workEmailVerifiedAt: null }], ["acme.com"])).toBe(false);
    expect(isOwnEmployer([{ workEmailDomain: null, workEmailVerifiedAt: VERIFIED }], ["acme.com"])).toBe(false);
    expect(isOwnEmployer([{ workEmailDomain: "acme.com", workEmailVerifiedAt: VERIFIED }], ["acme.com"])).toBe(true);
  });
  it("words the refusal plainly and parses only the exact 409 body", () => {
    expect(ownEmployerMessage("Acme")).toBe("You work at Acme. We don't send requests to your own employer, so colleagues never see you're looking. Nothing was used.");
    const body = { code: OWN_EMPLOYER, error: ownEmployerMessage("Acme"), companyDomain: "acme.com", companyName: "Acme" };
    expect(parseOwnEmployerRefusal(409, body)).toEqual(body);
    expect(parseOwnEmployerRefusal(400, body)).toBeNull();
    expect(parseOwnEmployerRefusal(409, { ...body, code: "company_cap_reached" })).toBeNull();
    expect(parseOwnEmployerRefusal(409, { ...body, extra: 1 })).toBeNull();
  });
});

describe("assertNotOwnEmployer", () => {
  it("refuses when another account of the same canonical person is verified there", async () => {
    const refusal = assertNotOwnEmployer(memoryStore(world()), check(1, "acme.com"));
    await expect(refusal).rejects.toBeInstanceOf(OwnEmployerError);
    await expect(refusal).rejects.toMatchObject({ code: OWN_EMPLOYER, companyDomain: "acme.com", companyName: "Acme", message: ownEmployerMessage("Acme") });
  });
  it("refuses the verified account itself", async () => {
    await expect(assertNotOwnEmployer(memoryStore(world()), check(2, "acme.com"))).rejects.toBeInstanceOf(OwnEmployerError);
  });
  it("leaves other companies alone", async () => {
    await expect(assertNotOwnEmployer(memoryStore(world()), check(1, "globex.com"))).resolves.toBeUndefined();
  });
  it("never blocks on another person's verification (cross-user isolation)", async () => {
    // User 3 (person 20) is verified at acme.com; user 4 has no canonical person and user 1 is person 10 at acme only.
    await expect(assertNotOwnEmployer(memoryStore(world()), check(4, "acme.com"))).resolves.toBeUndefined();
    const w = world(); w.profiles = w.profiles.filter(row => row.userId !== 2);
    await expect(assertNotOwnEmployer(memoryStore(w), check(1, "acme.com"))).resolves.toBeUndefined();
  });
  it("does not block on an unverified or lapsed work email", async () => {
    const w = world(); w.profiles = [{ userId: 2, domain: "acme.com", verifiedAt: null }];
    await expect(assertNotOwnEmployer(memoryStore(w), check(1, "acme.com"))).resolves.toBeUndefined();
  });
  it("covers every directory domain of the company (D-415 (2))", async () => {
    const refusal = assertNotOwnEmployer(memoryStore(world()), check(5, "meta.com"));
    await expect(refusal).rejects.toMatchObject({ companyName: "Meta", companyDomain: "meta.com" });
  });
  it("covers the selected company's domains when the directory has no row for the link's domain", async () => {
    const w = world(); w.companies = [];
    await expect(assertNotOwnEmployer(memoryStore(w), check(5, "meta.com", { selectedCompany: { name: "Meta", domains: ["meta.com", "fb.com"] } }))).rejects.toMatchObject({ companyName: "Meta" });
    await expect(assertNotOwnEmployer(memoryStore(w), check(5, "meta.com"))).resolves.toBeUndefined();
  });
  it("covers a subdomain work email and names the domain when the directory has no name", async () => {
    const w = world(); w.companies = []; w.profiles = [{ userId: 4, domain: "us.ibm.com", verifiedAt: VERIFIED }];
    await expect(assertNotOwnEmployer(memoryStore(w), check(4, "ibm.com"))).rejects.toMatchObject({ companyName: "ibm.com" });
  });
  it("lets a replay of a request created before the guard through", async () => {
    const w = world(); w.requests = [{ userId: 1, key: KEY }];
    await expect(assertNotOwnEmployer(memoryStore(w), check(1, "acme.com"))).resolves.toBeUndefined();
    await expect(assertNotOwnEmployer(memoryStore(w), { ...check(1, "acme.com"), idempotencyKey: "another-key-000001" })).rejects.toBeInstanceOf(OwnEmployerError);
  });
  it("reads nothing about the company when the person holds no verified work email", async () => {
    const store = memoryStore(world());
    const companyOf = vi.spyOn(store, "companyOf");
    const hasRequestWithKey = vi.spyOn(store, "hasRequestWithKey");
    await assertNotOwnEmployer(store, check(4, "acme.com"));
    expect(companyOf).not.toHaveBeenCalled();
    expect(hasRequestWithKey).not.toHaveBeenCalled();
  });
});

describe("own-employer store SQL (drizzle store contract)", () => {
  const q = () => ownEmployerQueries(drizzle.mock());
  it("reads the person's rows by canonical person", () => {
    expect(q().userRow(7).toSQL()).toEqual({ sql: "select `id`, `canonicalPersonId` from `users` where `users`.`id` = ? limit ?", params: [7, 1] });
    expect(q().personRows(10).toSQL()).toEqual({ sql: "select `id` from `users` where `users`.`canonicalPersonId` = ?", params: [10] });
  });
  it("reads only verified work emails of those rows", () => {
    expect(q().verifiedWorkEmails([1, 2]).toSQL()).toEqual({ sql: "select `workEmailDomain`, `workEmailVerifiedAt` from `profiles` where (`profiles`.`userId` in (?, ?) and `profiles`.`workEmailVerifiedAt` is not null)", params: [1, 2] });
  });
  it("reads the directory company and all its domains", () => {
    expect(q().companyIdOf("meta.com").toSQL()).toEqual({ sql: "select `companyId` from `companyDomains` where `companyDomains`.`domain` = ? limit ?", params: ["meta.com", 1] });
    expect(q().companyDomainsOf(200).toSQL()).toEqual({ sql: "select `domain` from `companyDomains` where `companyDomains`.`companyId` = ?", params: [200] });
    expect(q().companyName(200).toSQL()).toEqual({ sql: "select `name` from `companies` where `companies`.`id` = ? limit ?", params: [200, 1] });
  });
  it("finds a replay by the seeker's own idempotency key", () => {
    expect(q().requestWithKey(1, KEY).toSQL()).toEqual({ sql: "select `id` from `referralRequests` where (`referralRequests`.`jobSeekerId` = ? and `referralRequests`.`idempotencyKey` = ?) limit ?", params: [1, KEY, 1] });
  });
});

describe("POST /api/company-referrals own-employer refusal", () => {
  function setup() {
    const app = express(); app.use(express.json());
    const record = vi.fn(async () => undefined);
    const create = vi.fn(async () => { throw new OwnEmployerError("acme.com", "Acme"); });
    const dispatch = vi.fn();
    registerPrivateReferralRoutes(app, {
      resolveIdentity: async () => ({ account: { id: 1, openId: "seeker" } }),
      createCompanyReferralRequest: create,
      recordActivity: record,
      sendReferralReviewEmail: dispatch,
    } as unknown as PrivateReferralRouteDeps);
    return { app, create, record, dispatch };
  }
  it("answers 409 with the typed body the composer reads, and sends nothing", async () => {
    const { app, dispatch, record } = setup();
    const response = await request(app).post("/api/company-referrals").set("Idempotency-Key", "0123456789abcdef0123")
      .send({ targetRoleUrl: "https://careers.acme.com/jobs/1", attachmentIds: [1], candidateMessage: "Three reasons" });
    expect(response.status).toBe(409);
    expect(ownEmployerRefusalSchema.parse(response.body)).toEqual({ code: OWN_EMPLOYER, error: ownEmployerMessage("Acme"), companyDomain: "acme.com", companyName: "Acme" });
    expect(dispatch).not.toHaveBeenCalled();
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ action: "company_referral.own_employer_denied", outcome: "denied", companyDomain: "acme.com" }));
  });
});

describe("createCompanyReferralRequest runs the guard before any wallet read, lock or write", () => {
  const source = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
  const start = source.indexOf("export async function createCompanyReferralRequest(");
  const body = source.slice(start, source.indexOf("\nexport ", start + 10));
  it("calls the guard once, before the wallet and the transaction", () => {
    const guard = body.indexOf("assertNotOwnEmployer(");
    expect(start).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(0);
    expect(body.indexOf("assertNotOwnEmployer(", guard + 1)).toBe(-1);
    expect(guard).toBeLessThan(body.indexOf("ensureTokenWallet("));
    expect(guard).toBeLessThan(body.indexOf(".transaction("));
    expect(guard).toBeLessThan(body.indexOf("tokenBalances"));
  });
});
