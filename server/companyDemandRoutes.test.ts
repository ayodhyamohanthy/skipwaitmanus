import express from "express";
import { DrizzleQueryError } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { COMPANY_NOT_FOUND_ERROR, type AdminCompany, type PublicCompany } from "../shared/companies";
import type { DemandCompany } from "../shared/companyDemand";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { registerCompanyDemandRoutes, type CompanyDemandRouteDeps } from "./companyDemandRoutes";

const company = (slug: string, name: string, domains: string[]): PublicCompany => ({ slug, name, initials: name.slice(0, 2).toUpperCase(), industry: "Software", location: "Remote", functions: ["Engineering"], blurb: "A company.", domains, openToReferrals: false });
const acme = company("acme", "Acme", ["acme.com", "acme.io"]);
const globex = company("globex", "Globex", ["globex.com"]);
const initech = company("initech", "Initech", ["initech.com"]);
const adminAcme: AdminCompany = { ...acme, id: 1, status: "listed", sortOrder: 10, primaryDomain: "acme.com", updatedAt: "2026-10-01T00:00:00.000Z" };
const hiddenInitech: AdminCompany = { ...initech, id: 3, status: "hidden", sortOrder: 30, primaryDomain: "initech.com", updatedAt: "2026-10-01T00:00:00.000Z" };

const identities: Record<string, { account: { id: number; role: "user" | "admin" } }> = { admin: { account: { id: 1, role: "admin" } }, member: { account: { id: 2, role: "user" } } };

const people: Record<string, number> = { acme: 5, globex: 1, initech: 0 };

function appWith(deps: Partial<CompanyDemandRouteDeps> = {}) {
  const app = express();
  const reports: Array<Record<string, unknown> | undefined> = [];
  const loadCompanyDemand = deps.loadCompanyDemand ?? vi.fn(async (companies: readonly DemandCompany[]) => companies.map(entry => ({ slug: entry.slug, name: entry.name, people: people[entry.slug] ?? 0 })));
  registerCompanyDemandRoutes(app, {
    resolveIdentity: async req => identities[String(req.header("x-test-user"))],
    listCompanyDirectory: async () => ({ companies: [acme, globex, initech], openCount: 0 }),
    getCompanyDirectoryEntry: async slug => [acme, globex, initech].find(entry => entry.slug === slug),
    listAdminCompanies: async () => [adminAcme, { ...globex, id: 2, status: "listed", sortOrder: 20, primaryDomain: "globex.com", updatedAt: "2026-10-01T00:00:00.000Z" }, hiddenInitech],
    publicDemandEnabled: () => true,
    adminDemandEnabled: () => true,
    reportError: (_error, context) => { reports.push(context); },
    ...deps,
    loadCompanyDemand,
  });
  return { app, reports, loadCompanyDemand };
}

describe("GET /api/company-demand", () => {
  it("is absent while the public switch is off, and reads nothing", async () => {
    const loadCompanyDemand = vi.fn(async () => []);
    const { app } = appWith({ publicDemandEnabled: () => false, loadCompanyDemand });
    const response = await request(app).get("/api/company-demand");
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(loadCompanyDemand).not.toHaveBeenCalled();
  });

  it("lists only companies with people asking, counts first then few, and caches for five minutes", async () => {
    const { app } = appWith();
    const response = await request(app).get("/api/company-demand");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.body).toEqual({ companies: [{ slug: "acme", name: "Acme", demand: { state: "count", people: 5 } }, { slug: "globex", name: "Globex", demand: { state: "few" } }] });
  });

  it("carries no number below the floor, no total, no request count, no availability word and no domain", async () => {
    const { app } = appWith();
    const response = await request(app).get("/api/company-demand");
    const body = response.body as { companies: Array<{ slug: string; name: string; demand: { state: string; people?: number } }> };
    for (const entry of body.companies) {
      expect(Object.keys(entry).sort()).toEqual(["demand", "name", "slug"]);
      if (entry.demand.state === "count") expect(entry.demand.people).toBeGreaterThanOrEqual(3);
      else expect(entry.demand.people).toBeUndefined();
    }
    expect(JSON.stringify(response.body)).not.toMatch(/acme\.com|acme\.io|globex\.com|initech\.com/);
    expect(JSON.stringify(response.body)).not.toMatch(/"(total|requests|waiting|open|openToReferrals|domains)"/);
  });

  it("answers 503 without personal data when the read fails, and reports it", async () => {
    const { app, reports } = appWith({ loadCompanyDemand: async () => { throw new CompanyDirectoryUnavailableError(); } });
    const response = await request(app).get("/api/company-demand");
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({ error: "We could not load demand right now" });
    expect(reports).toEqual([{ source: "company-demand" }]);
  });

  it("answers 503 for a driver failure, and 500 for anything else so a bug never hides as an outage", async () => {
    const driver = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    const down = appWith({ loadCompanyDemand: async () => { throw new DrizzleQueryError("select 1", [], driver); } });
    expect((await request(down.app).get("/api/company-demand")).status).toBe(503);
    const bug = appWith({ loadCompanyDemand: async () => { throw new Error("a contract bug"); } });
    const response = await request(bug.app).get("/api/company-demand");
    expect(response.status).toBe(500);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(bug.reports).toEqual([{ source: "company-demand" }]);
  });
});

describe("GET /api/company-demand/:slug", () => {
  it("is absent while the public switch is off", async () => {
    const loadCompanyDemand = vi.fn(async () => []);
    const { app } = appWith({ publicDemandEnabled: () => false, loadCompanyDemand });
    const response = await request(app).get("/api/company-demand/acme");
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(loadCompanyDemand).not.toHaveBeenCalled();
  });

  it("answers a count, a few, and none, and caches for five minutes", async () => {
    const { app } = appWith();
    const counted = await request(app).get("/api/company-demand/acme");
    expect(counted.status).toBe(200);
    expect(counted.headers["cache-control"]).toBe("public, max-age=300");
    expect(counted.body).toEqual({ demand: { state: "count", people: 5 } });
    expect((await request(app).get("/api/company-demand/globex")).body).toEqual({ demand: { state: "few" } });
    expect((await request(app).get("/api/company-demand/initech")).body).toEqual({ demand: { state: "none" } });
  });

  it("rejects a malformed slug without a lookup, and 404s an unknown or hidden company", async () => {
    const getCompanyDirectoryEntry = vi.fn(async (slug: string) => (slug === "acme" ? acme : undefined));
    const { app } = appWith({ getCompanyDirectoryEntry });
    for (const slug of ["Acme", "a_b", "x".repeat(49)]) expect((await request(app).get(`/api/company-demand/${slug}`)).status).toBe(400);
    expect(getCompanyDirectoryEntry).not.toHaveBeenCalled();
    const missing = await request(app).get("/api/company-demand/hidden-co");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: COMPANY_NOT_FOUND_ERROR });
  });

  it("answers 503 without personal data when the read fails", async () => {
    const { app, reports } = appWith({ loadCompanyDemand: async () => { throw new CompanyDirectoryUnavailableError(); } });
    const response = await request(app).get("/api/company-demand/acme");
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(JSON.stringify(response.body)).not.toMatch(/acme\.com|open-|@/);
    expect(reports).toEqual([{ source: "company-demand" }]);
  });
});

describe("GET /api/admin/company-demand/unlisted", () => {
  it("refuses an anonymous request with 401 before it looks at the switch", async () => {
    const listAdminCompanies = vi.fn(async () => []);
    const { app } = appWith({ listAdminCompanies, adminDemandEnabled: () => false });
    const response = await request(app).get("/api/admin/company-demand/unlisted");
    expect(response.status).toBe(401);
    expect(listAdminCompanies).not.toHaveBeenCalled();
  });

  it("refuses a signed-in non-admin with 403", async () => {
    const { app } = appWith();
    expect((await request(app).get("/api/admin/company-demand/unlisted").set("x-test-user", "member")).status).toBe(403);
  });

  it("is absent to an admin while its switch is off", async () => {
    const loadUnlistedDemand = vi.fn(async () => []);
    const { app } = appWith({ adminDemandEnabled: () => false, loadUnlistedDemand });
    const response = await request(app).get("/api/admin/company-demand/unlisted").set("x-test-user", "admin");
    expect(response.status).toBe(404);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(loadUnlistedDemand).not.toHaveBeenCalled();
  });

  it("lists unowned domains by people, private and uncached, and nothing else", async () => {
    const loadUnlistedDemand = vi.fn(async () => [{ domain: "unlisted.example", people: 2 }]);
    const { app } = appWith({ loadUnlistedDemand });
    const response = await request(app).get("/api/admin/company-demand/unlisted").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({ domains: [{ domain: "unlisted.example", people: 2 }] });
    expect(Object.keys(response.body.domains[0]).sort()).toEqual(["domain", "people"]);
    // A hidden company still owns its domain, so the loader is told about it.
    expect(loadUnlistedDemand).toHaveBeenCalledWith(["acme.com", "acme.io", "globex.com", "initech.com"], expect.any(Number));
  });
});
