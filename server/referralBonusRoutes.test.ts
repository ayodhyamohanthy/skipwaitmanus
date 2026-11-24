// D-099 slice A (D-374): the bonus routes. Written before the implementation.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { BONUS_REPORT_LIMIT_MESSAGE, BONUS_SOURCE_DOMAIN_ERROR } from "../shared/referralBonus";
import { registerReferralBonusRoutes, type ReferralBonusRouteDeps } from "./referralBonusRoutes";
import type { AdminBonusRow, AdminReportRow, BonusCompanyIdentity, PublicBonusEntry, ReferralBonusStore, StoredBonus } from "./referralBonusStore";

const identities: Record<string, { account: { id: number; role: "user" | "admin" } }> = {
  admin: { account: { id: 1, role: "admin" } },
  member: { account: { id: 2, role: "user" } },
};

const wipro: BonusCompanyIdentity = { id: 10, slug: "wipro", name: "Wipro", initials: "W", status: "listed" };
const tcs: BonusCompanyIdentity = { id: 11, slug: "tcs", name: "TCS", initials: "T", status: "listed" };
const hidden: BonusCompanyIdentity = { id: 12, slug: "secretco", name: "Secret Co", initials: "S", status: "hidden" };

const fresh = (over: Partial<StoredBonus> = {}): StoredBonus => ({
  companyId: 10,
  amountMinor: 5_000_000,
  currency: "INR",
  upTo: false,
  scopeNote: null,
  sourceUrl: "https://www.wipro.com/careers/referrals",
  checkedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  status: "published",
  ...over,
});

function fakeStore(seed: { bonuses?: Map<number, StoredBonus>; reports?: number } = {}) {
  const companies = new Map([wipro, tcs, hidden].map(company => [company.id, company]));
  const bonuses = seed.bonuses ?? new Map<number, StoredBonus>();
  const reports: Array<{ id: number; companyId: number; reporterUserId: number; reason: string; note: string | null; status: "open" | "fixed" | "dismissed"; createdAt: Date }> = [];
  let reportSeq = 0;
  for (let i = 0; i < (seed.reports ?? 0); i += 1) {
    reportSeq += 1;
    reports.push({ id: reportSeq, companyId: 10, reporterUserId: 2, reason: "other", note: null, status: "open", createdAt: new Date() });
  }
  const store: ReferralBonusStore = {
    async companyBySlug(slug) { return [...companies.values()].find(company => company.slug === slug); },
    async companyById(id) { return companies.get(id); },
    async domainsOf(companyId) { return companyId === 10 ? ["wipro.com", "careers.wipro.com"] : ["tcs.com"]; },
    async listPublished(now) {
      const rows: PublicBonusEntry[] = [];
      for (const [companyId, bonus] of bonuses) {
        const company = companies.get(companyId);
        if (!company || company.status !== "listed" || bonus.status !== "published") continue;
        if (now.getTime() - bonus.checkedAt.getTime() > 365 * 24 * 60 * 60 * 1000) continue;
        rows.push({ company: { slug: company.slug, name: company.name, initials: company.initials }, bonus: { amountMinor: bonus.amountMinor, currency: bonus.currency, upTo: bonus.upTo, scopeNote: bonus.scopeNote, sourceUrl: bonus.sourceUrl, sourceHost: new URL(bonus.sourceUrl).hostname, checkedAt: bonus.checkedAt.toISOString() } });
      }
      return rows.sort((a, b) => a.company.name.localeCompare(b.company.name));
    },
    async getPublishedForCompany(companyId, now) {
      const bonus = bonuses.get(companyId);
      if (!bonus || bonus.status !== "published") return undefined;
      return now.getTime() - bonus.checkedAt.getTime() > 365 * 24 * 60 * 60 * 1000 ? undefined : bonus;
    },
    async upsert(companyId, input, userId) { bonuses.set(companyId, { companyId, ...input, status: "published" }); void userId; },
    async withdraw(companyId) {
      const bonus = bonuses.get(companyId);
      if (!bonus) return false;
      bonuses.set(companyId, { ...bonus, status: "withdrawn" });
      return true;
    },
    async listAdmin(now): Promise<AdminBonusRow[]> {
      return [...companies.values()].map(company => {
        const bonus = bonuses.get(company.id);
        return { company, bonus: bonus ? { ...bonus, stale: now.getTime() - bonus.checkedAt.getTime() > 365 * 24 * 60 * 60 * 1000 } : null, openReports: reports.filter(report => report.companyId === company.id && report.status === "open").length };
      });
    },
    async countReportsSince(reporterUserId, since) { return reports.filter(report => report.reporterUserId === reporterUserId && report.createdAt >= since).length; },
    async createReport(companyId, reporterUserId, input) {
      reportSeq += 1;
      reports.push({ id: reportSeq, companyId, reporterUserId, reason: input.reason, note: input.note, status: "open", createdAt: new Date() });
    },
    async listReports(status): Promise<AdminReportRow[]> {
      return reports.filter(report => report.status === status).map(report => ({ id: report.id, company: { slug: "wipro", name: "Wipro" }, reason: report.reason, note: report.note, suggestedSourceUrl: null, status: report.status, createdAt: report.createdAt }));
    },
    async decideReport(id, decision) {
      const report = reports.find(row => row.id === id && row.status === "open");
      if (!report) return false;
      report.status = decision;
      return true;
    },
  };
  return { store, bonuses, reports };
}

function appWith(deps: Partial<ReferralBonusRouteDeps> = {}, seed: Parameters<typeof fakeStore>[0] = {}) {
  const app = express();
  app.use(express.json());
  const activity: string[] = [];
  const fake = fakeStore(seed);
  const store = vi.fn(async () => fake.store);
  registerReferralBonusRoutes(app, {
    resolveIdentity: async req => identities[String(req.header("x-test-user"))],
    recordActivity: input => { activity.push(`${input.action}:${input.outcome}`); },
    store,
    enabled: () => true,
    ...deps,
  });
  return { app, activity, storeSpy: store, ...fake };
}

const ALL_ROUTES: Array<[string, string]> = [
  ["get", "/api/company-bonuses"],
  ["get", "/api/company-bonuses/wipro"],
  ["post", "/api/company-bonuses/wipro/reports"],
  ["get", "/api/admin/company-bonuses"],
  ["put", "/api/admin/company-bonuses/10"],
  ["post", "/api/admin/company-bonuses/10/withdraw"],
  ["get", "/api/admin/company-bonus-reports"],
  ["post", "/api/admin/company-bonus-reports/1/decision"],
];

describe("flag off (D-097, §10 review 1)", () => {
  it("answers 404 on every route and never touches the store", async () => {
    const { app, storeSpy } = appWith({ enabled: () => false });
    for (const [method, path] of ALL_ROUTES) {
      const response = await (request(app) as unknown as Record<string, (path: string) => request.Test>)[method](path).set("x-test-user", "admin");
      expect(response.status, `${method.toUpperCase()} ${path}`).toBe(404);
    }
    expect(storeSpy).not.toHaveBeenCalled();
  });
});

describe("GET /api/company-bonuses", () => {
  it("lists only listed companies with a published, fresh figure, sorted by name", async () => {
    const bonuses = new Map<number, StoredBonus>([
      [10, fresh()],
      [11, fresh({ companyId: 11, sourceUrl: "https://tcs.com/referrals", checkedAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) })],
      [12, fresh({ companyId: 12 })],
    ]);
    const { app } = appWith({}, { bonuses });
    const response = await request(app).get("/api/company-bonuses");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
    expect(response.body.bonuses.map((row: { company: { slug: string } }) => row.company.slug)).toEqual(["wipro"]);
  });

  it("sends exactly the allow-list keys", async () => {
    const { app } = appWith({}, { bonuses: new Map([[10, fresh()]]) });
    const response = await request(app).get("/api/company-bonuses");
    expect(Object.keys(response.body.bonuses[0].bonus).sort()).toEqual(["amountMinor", "checkedAt", "currency", "scopeNote", "sourceHost", "sourceUrl", "upTo"]);
    expect(Object.keys(response.body.bonuses[0].company).sort()).toEqual(["initials", "name", "slug"]);
  });
});

describe("GET /api/company-bonuses/:slug", () => {
  it("answers 404 for a hidden company", async () => {
    const { app } = appWith({}, { bonuses: new Map([[12, fresh({ companyId: 12 })]]) });
    expect((await request(app).get("/api/company-bonuses/secretco")).status).toBe(404);
  });

  it("answers 404 for an unknown slug", async () => {
    const { app } = appWith();
    expect((await request(app).get("/api/company-bonuses/nope")).status).toBe(404);
  });

  it("answers not_published with a null bonus when there is no fresh figure", async () => {
    const { app } = appWith();
    const response = await request(app).get("/api/company-bonuses/wipro");
    expect(response.status).toBe(200);
    expect(response.body.state).toBe("not_published");
    expect(response.body.bonus).toBeNull();
    expect(response.headers["cache-control"]).toBe("public, max-age=300");
  });

  it("answers the published figure", async () => {
    const { app } = appWith({}, { bonuses: new Map([[10, fresh()]]) });
    const response = await request(app).get("/api/company-bonuses/wipro");
    expect(response.body.state).toBe("published");
    expect(response.body.bonus.amountMinor).toBe(5_000_000);
    expect(response.body.bonus.sourceHost).toBe("www.wipro.com");
  });
});

describe("admin gating", () => {
  it("answers 401 signed out and 403 for a member before any store call", async () => {
    const { app, storeSpy } = appWith();
    expect((await request(app).get("/api/admin/company-bonuses")).status).toBe(401);
    expect((await request(app).get("/api/admin/company-bonuses").set("x-test-user", "member")).status).toBe(403);
    expect(storeSpy).not.toHaveBeenCalled();
  });
});

describe("PUT /api/admin/company-bonuses/:companyId", () => {
  const body = { amountMinor: 5_000_000, currency: "INR", upTo: false, scopeNote: null, sourceUrl: "https://www.wipro.com/careers/referrals", checkedAt: "2026-01-01T00:00:00.000Z" };

  it("refuses a source on another domain with the plain message", async () => {
    const { app, activity } = appWith();
    const response = await request(app).put("/api/admin/company-bonuses/10").set("x-test-user", "admin").send({ ...body, sourceUrl: "https://evilwipro.com/referrals" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe(BONUS_SOURCE_DOMAIN_ERROR("Wipro"));
    expect(activity).toEqual([]);
  });

  it("accepts a subdomain of the company's own domain and records the activity row", async () => {
    const { app, activity, bonuses } = appWith();
    const response = await request(app).put("/api/admin/company-bonuses/10").set("x-test-user", "admin").send({ ...body, sourceUrl: "https://careers.wipro.com/referrals" });
    expect(response.status).toBe(200);
    expect(bonuses.get(10)?.amountMinor).toBe(5_000_000);
    expect(activity).toEqual(["admin.company_bonus.upserted:success"]);
  });

  it("rejects a bad body", async () => {
    const { app } = appWith();
    expect((await request(app).put("/api/admin/company-bonuses/10").set("x-test-user", "admin").send({ ...body, amountMinor: 0 })).status).toBe(400);
  });
});

describe("withdraw", () => {
  it("hides the figure from both public routes", async () => {
    const { app } = appWith({}, { bonuses: new Map([[10, fresh()]]) });
    expect((await request(app).get("/api/company-bonuses")).body.bonuses).toHaveLength(1);
    const withdrawn = await request(app).post("/api/admin/company-bonuses/10/withdraw").set("x-test-user", "admin");
    expect(withdrawn.status).toBe(200);
    expect((await request(app).get("/api/company-bonuses")).body.bonuses).toHaveLength(0);
    expect((await request(app).get("/api/company-bonuses/wipro")).body.state).toBe("not_published");
  });
});

describe("POST /api/company-bonuses/:slug/reports", () => {
  const body = { reason: "figure_changed", note: "The page now says something else", suggestedSourceUrl: null };

  it("answers 401 signed out", async () => {
    const { app } = appWith();
    expect((await request(app).post("/api/company-bonuses/wipro/reports").send(body)).status).toBe(401);
  });

  it("answers 400 on a bad body", async () => {
    const { app } = appWith();
    expect((await request(app).post("/api/company-bonuses/wipro/reports").set("x-test-user", "member").send({ reason: "new_source" })).status).toBe(400);
  });

  it("accepts a report and records an activity row without the note", async () => {
    const { app, activity, reports } = appWith();
    const response = await request(app).post("/api/company-bonuses/wipro/reports").set("x-test-user", "member").send(body);
    expect(response.status).toBe(201);
    expect(response.body).toEqual({ ok: true });
    expect(reports).toHaveLength(1);
    expect(activity).toEqual(["company_bonus.report_filed:success"]);
    expect(activity.join(" ")).not.toContain("The page now says");
  });

  it("answers the neutral 429 on the sixth report in 24 hours", async () => {
    const { app } = appWith({}, { reports: 5 });
    const response = await request(app).post("/api/company-bonuses/wipro/reports").set("x-test-user", "member").send(body);
    expect(response.status).toBe(429);
    expect(response.body.error).toBe(BONUS_REPORT_LIMIT_MESSAGE);
  });
});

describe("admin reports", () => {
  it("lists open reports without any reporter field", async () => {
    const { app } = appWith({}, { reports: 1 });
    const response = await request(app).get("/api/admin/company-bonus-reports?status=open").set("x-test-user", "admin");
    expect(response.status).toBe(200);
    expect(response.body.reports).toHaveLength(1);
    expect(Object.keys(response.body.reports[0]).sort()).toEqual(["company", "createdAt", "id", "note", "reason", "status", "suggestedSourceUrl"]);
  });

  it("decides a report and records the activity row", async () => {
    const { app, activity } = appWith({}, { reports: 1 });
    const response = await request(app).post("/api/admin/company-bonus-reports/1/decision").set("x-test-user", "admin").send({ decision: "fixed" });
    expect(response.status).toBe(200);
    expect(activity).toEqual(["admin.company_bonus_report.decided:success"]);
  });

  it("refuses a second decision on the same report", async () => {
    const { app } = appWith({}, { reports: 1 });
    await request(app).post("/api/admin/company-bonus-reports/1/decision").set("x-test-user", "admin").send({ decision: "fixed" });
    expect((await request(app).post("/api/admin/company-bonus-reports/1/decision").set("x-test-user", "admin").send({ decision: "dismissed" })).status).toBe(404);
  });
});
