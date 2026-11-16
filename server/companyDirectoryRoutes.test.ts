import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { COMPANY_NOT_FOUND_ERROR, companyDetailResponseSchema, companyDirectoryResponseSchema, type AdminCompany, type PublicCompany } from "../shared/companies";
import { CompanyConflictError, CompanyNotFoundError } from "./companyDirectoryAdmin";
import { registerCompanyDirectoryRoutes, type CompanyDirectoryRouteDeps } from "./companyDirectoryRoutes";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";

const wipro: PublicCompany = { slug: "wipro", name: "Wipro", initials: "W", industry: "Technology services", location: "Global", functions: ["Engineering", "Data", "Operations"], blurb: "Explore roles across technology, consulting, and business operations.", domains: ["wipro.com"], openToReferrals: true };
const adminWipro: AdminCompany = { ...wipro, id: 2, status: "listed", sortOrder: 20, primaryDomain: "wipro.com", updatedAt: "2026-10-01T00:00:00.000Z" };
const identities: Record<string, { account: { id: number; role: "user" | "admin" } }> = { admin: { account: { id: 1, role: "admin" } }, member: { account: { id: 2, role: "user" } } };

function appWith(deps: Partial<CompanyDirectoryRouteDeps> = {}) {
  const app = express();
  const activity: string[] = [];
  registerCompanyDirectoryRoutes(app, { resolveIdentity: async req => identities[String(req.header("x-test-user"))], recordActivity: input => { activity.push(`${input.action}:${input.outcome}`); }, ...deps });
  return { app, activity };
}

describe("GET /api/companies/search", () => {
  const list = async () => ({ companies: [wipro, { ...wipro, slug: "tcs", name: "TCS", domains: ["tcs.com"] }], openCount: 2 });
  it("is not swallowed by /:slug and finds TCS by alias", async () => {
    const getCompanyDirectoryEntry = vi.fn(async () => undefined);
    const { app } = appWith({ listCompanyDirectory: list, getCompanyDirectoryEntry });
    const r = await request(app).get("/api/companies/search?q=tata");
    expect(r.status).toBe(200);
    expect(getCompanyDirectoryEntry).not.toHaveBeenCalled();
    expect(r.headers["cache-control"]).toBe("public, max-age=60");
    expect(r.body.companies.map((c: { slug: string }) => c.slug)).toEqual(["tcs"]);
  });
  it("refuses unknown query keys", async () => {
    const { app } = appWith({ listCompanyDirectory: list });
    expect((await request(app).get("/api/companies/search?q=tcs&industry=x")).status).toBe(400);
  });
  it("carries no availability field", async () => {
    const { app } = appWith({ listCompanyDirectory: list });
    const r = await request(app).get("/api/companies/search?q=wipro");
    expect(r.body.companies).toHaveLength(1);
    expect(JSON.stringify(r.body)).not.toMatch(/openToReferrals|available/i);
  });
});

describe("public company directory routes", () => {
  it("serves the listed directory with a public cache header", async () => {
    const { app } = appWith({ listCompanyDirectory: async () => ({ companies: [wipro], openCount: 1 }) });
    const response = await request(app).get("/api/companies?purpose=verify");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(companyDirectoryResponseSchema.parse(response.body)).toEqual({ companies: [wipro], openCount: 1 });
  });

  it("serves one company and 404s an unknown or hidden slug with the kit copy", async () => {
    const getCompanyDirectoryEntry = vi.fn(async (slug: string) => (slug === "wipro" ? wipro : undefined));
    const { app } = appWith({ getCompanyDirectoryEntry });
    const found = await request(app).get("/api/companies/wipro");
    expect(found.status).toBe(200);
    expect(companyDetailResponseSchema.parse(found.body).company).toEqual(wipro);
    const missing = await request(app).get("/api/companies/hidden-co");
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: COMPANY_NOT_FOUND_ERROR });
  });

  it.each(["Wipro", "a_b", "x".repeat(49)])("rejects the malformed slug %s without a lookup", async slug => {
    const getCompanyDirectoryEntry = vi.fn(async () => wipro);
    const { app } = appWith({ getCompanyDirectoryEntry });
    expect((await request(app).get(`/api/companies/${slug}`)).status).toBe(400);
    expect(getCompanyDirectoryEntry).not.toHaveBeenCalled();
  });

  it("answers 503 when the directory is unavailable and never caches the failure", async () => {
    const { app } = appWith({ listCompanyDirectory: async () => { throw new CompanyDirectoryUnavailableError(); } });
    const response = await request(app).get("/api/companies");
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("without a database outside production serves the five launch companies, none open", async () => {
    const { app } = appWith();
    const response = await request(app).get("/api/companies");
    expect(response.status).toBe(200);
    const body = companyDirectoryResponseSchema.parse(response.body);
    expect(body.companies.map(company => company.name)).toEqual(["skipwait.me", "Wipro", "Neutrinos", "TCS", "Merkle"]);
    expect(body.openCount).toBe(0);
    expect((await request(app).get("/api/companies/go-neutrinos")).body.company.initials).toBe("N");
  });
});

describe("admin company routes", () => {
  const validCreate = { name: "Acme", industry: "Retail", location: "Global", functions: ["Engineering"], blurb: "Build retail tools.", primaryDomain: "acme.com" };

  it("requires sign-in, then the admin role, before any read or write", async () => {
    const listAdminCompanies = vi.fn(async () => [adminWipro]);
    const createCompany = vi.fn(async () => adminWipro);
    const updateCompany = vi.fn(async () => adminWipro);
    const { app, activity } = appWith({ listAdminCompanies, createCompany, updateCompany });
    expect((await request(app).get("/api/admin/companies")).status).toBe(401);
    expect((await request(app).get("/api/admin/companies").set("x-test-user", "member")).status).toBe(403);
    expect((await request(app).post("/api/admin/companies").set("x-test-user", "member").send(validCreate)).status).toBe(403);
    expect((await request(app).patch("/api/admin/companies/2").set("x-test-user", "member").send({ status: "hidden" })).status).toBe(403);
    expect(listAdminCompanies).not.toHaveBeenCalled();
    expect(createCompany).not.toHaveBeenCalled();
    expect(updateCompany).not.toHaveBeenCalled();
    expect(activity.filter(entry => entry.endsWith(":denied"))).toHaveLength(3);
  });

  it("lists every company for an admin, uncached, passing the search", async () => {
    const listAdminCompanies = vi.fn(async () => [adminWipro]);
    const { app } = appWith({ listAdminCompanies });
    const response = await request(app).get("/api/admin/companies?q=wip").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.body).toEqual({ companies: [adminWipro] });
    expect(listAdminCompanies).toHaveBeenCalledWith("wip");
  });

  it("creates with a strict body and records the admin action", async () => {
    const createCompany = vi.fn(async () => ({ ...adminWipro, id: 9, slug: "acme" }));
    const { app, activity } = appWith({ createCompany });
    const created = await request(app).post("/api/admin/companies").set("x-test-user", "admin").send(validCreate);
    expect(created.status).toBe(201);
    expect(created.body.company.id).toBe(9);
    expect(createCompany).toHaveBeenCalledWith(validCreate);
    expect(activity).toContain("admin.company_created:success");
    expect((await request(app).post("/api/admin/companies").set("x-test-user", "admin").send({ ...validCreate, openToReferrals: true })).status).toBe(400);
    expect((await request(app).post("/api/admin/companies").set("x-test-user", "admin").send({ ...validCreate, primaryDomain: "gmail.com" })).status).toBe(400);
    expect(createCompany).toHaveBeenCalledTimes(1);
  });

  it("maps duplicate slugs or domains to 409", async () => {
    const { app } = appWith({ createCompany: async () => { throw new CompanyConflictError("acme.com already belongs to a company"); } });
    const response = await request(app).post("/api/admin/companies").set("x-test-user", "admin").send(validCreate);
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already belongs/);
  });

  it("edits by id with validation, 404 for an unknown company", async () => {
    const updateCompany = vi.fn(async (id: number) => { if (id === 404) throw new CompanyNotFoundError(); return { ...adminWipro, status: "hidden" as const }; });
    const { app, activity } = appWith({ updateCompany });
    const hidden = await request(app).patch("/api/admin/companies/2").set("x-test-user", "admin").send({ status: "hidden" });
    expect(hidden.status).toBe(200);
    expect(hidden.body.company.status).toBe("hidden");
    expect(updateCompany).toHaveBeenCalledWith(2, { status: "hidden" });
    expect(activity).toContain("admin.company_updated:success");
    expect((await request(app).patch("/api/admin/companies/404").set("x-test-user", "admin").send({ status: "listed" })).status).toBe(404);
    expect((await request(app).patch("/api/admin/companies/abc").set("x-test-user", "admin").send({ status: "listed" })).status).toBe(400);
    expect((await request(app).patch("/api/admin/companies/2").set("x-test-user", "admin").send({})).status).toBe(400);
    expect((await request(app).patch("/api/admin/companies/2").set("x-test-user", "admin").send({ slug: "renamed" })).status).toBe(400);
  });
});
