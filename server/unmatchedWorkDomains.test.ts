import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { planUnmatchedWorkDomains } from "./companyDirectoryAdmin";
import { registerCompanyDirectoryRoutes } from "./companyDirectoryRoutes";

const d = (s: string) => new Date(s);

describe("planUnmatchedWorkDomains", () => {
  it("lists verified domains no company owns, counted, case-insensitive, most first", () => {
    const out = planUnmatchedWorkDomains([
      { domain: "Neutrinos.com", verifiedAt: d("2026-10-17T13:10:15Z") },
      { domain: "neutrinos.com", verifiedAt: d("2026-10-10T00:00:00Z") },
      { domain: "goneutrinos.com", verifiedAt: d("2026-10-11T00:00:00Z") },
      { domain: "acme.com", verifiedAt: d("2026-10-12T00:00:00Z") },
      { domain: null, verifiedAt: d("2026-10-12T00:00:00Z") },
      { domain: "unverified.com", verifiedAt: null },
    ], ["goneutrinos.com"]);
    expect(out).toEqual([
      { domain: "neutrinos.com", verifiedReferrers: 2, firstVerifiedAt: "2026-10-10T00:00:00.000Z" },
      { domain: "acme.com", verifiedReferrers: 1, firstVerifiedAt: "2026-10-12T00:00:00.000Z" },
    ]);
  });
  it("returns nothing when every domain is owned", () => {
    expect(planUnmatchedWorkDomains([{ domain: "a.com", verifiedAt: d("2026-10-01T00:00:00Z") }], ["A.com"])).toEqual([]);
  });
  it("exposes no identifying fields", () => {
    const [row] = planUnmatchedWorkDomains([{ domain: "x.io", verifiedAt: d("2026-10-01T00:00:00Z") }], []);
    expect(Object.keys(row!).sort()).toEqual(["domain", "firstVerifiedAt", "verifiedReferrers"]);
  });
});

describe("GET /api/admin/companies/unmatched-domains", () => {
  const ids: Record<string, { account: { id: number; role: "user" | "admin" } }> = { admin: { account: { id: 1, role: "admin" } }, member: { account: { id: 2, role: "user" } } };
  const build = (enabled: boolean) => {
    const app = express();
    registerCompanyDirectoryRoutes(app, { resolveIdentity: async req => ids[String(req.header("x-test-user"))], unmatchedDomainsEnabled: () => enabled, listUnmatchedWorkDomains: async () => [{ domain: "x.io", verifiedReferrers: 1, firstVerifiedAt: "2026-10-01T00:00:00.000Z" }] });
    return app;
  };
  it("flag off: 404 even for admins (shipped state)", async () => {
    expect((await request(build(false)).get("/api/admin/companies/unmatched-domains").set("x-test-user", "admin")).status).toBe(404);
  });
  it("flag on: 401 anonymous, 403 non-admin, 200 admin with no-store", async () => {
    const app = build(true);
    expect((await request(app).get("/api/admin/companies/unmatched-domains")).status).toBe(401);
    expect((await request(app).get("/api/admin/companies/unmatched-domains").set("x-test-user", "member")).status).toBe(403);
    const ok = await request(app).get("/api/admin/companies/unmatched-domains").set("x-test-user", "admin");
    expect(ok.status).toBe(200);
    expect(ok.headers["cache-control"]).toBe("private, no-store");
    expect(ok.body.domains).toHaveLength(1);
  });
});
