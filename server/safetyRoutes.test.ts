import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerSafetyRoutes, type SafetyRouteDeps } from "./safetyRoutes";

function buildApp() {
  const app = express();
  app.use(express.json());
  const reports: Array<{ id: number; reporterUserId: number; reason: string; status: string; urgent: boolean }> = [];
  const suggestions: Array<{ id: number; submitterUserId: number; companyName: string; status: string }> = [];
  const deps: SafetyRouteDeps = {
    resolveIdentity: async req => {
      const id = req.header("x-test-user");
      return id ? { account: { id: Number(id), openId: `workos-${id}` } } : undefined;
    },
    createSafetyReport: async (userId, input) => {
      if (input.reason !== "Spam or repeated asks") throw new Error("Choose the reason that fits best");
      if (reports.filter(r => r.reporterUserId === userId).length >= 20) throw new Error("You have filed several reports today.");
      const report = { id: reports.length + 1, reporterUserId: userId, reason: String(input.reason), status: "open", urgent: Boolean(input.urgent) };
      reports.push(report);
      return { id: report.id, reference: `R-${1000 + report.id}`, urgent: report.urgent };
    },
    listMySafetyReports: async userId => reports.filter(r => r.reporterUserId === userId),
    createCompanySuggestion: async (userId, input) => {
      if (typeof input.companyName !== "string" || input.companyName.trim().length < 2) throw new Error("Name the company you want to see");
      if (input.website !== undefined && input.website !== null && String(input.website).trim() !== "" && !/^https?:\/\//i.test(String(input.website))) throw new Error("Company websites must start with http:// or https://");
      if (suggestions.filter(s => s.submitterUserId === userId).length >= 3) throw new Error("You can suggest up to 3 companies a day");
      if (suggestions.some(s => s.companyName.toLowerCase() === String(input.companyName).toLowerCase())) throw new Error("This company was already suggested and is under review");
      const suggestion = { id: suggestions.length + 1, submitterUserId: userId, companyName: String(input.companyName).trim(), status: "open" };
      suggestions.push(suggestion);
      return { id: suggestion.id, companyName: suggestion.companyName };
    },
    listMyCompanySuggestions: async userId => suggestions.filter(s => s.submitterUserId === userId),
  };
  registerSafetyRoutes(app, deps);
  return app;
}

describe("safety reports and company suggestions", () => {
  it("files a report with a reference and lists it back", async () => {
    const app = buildApp();
    expect((await request(app).post("/api/safety-reports")).status).toBe(401);
    expect((await request(app).post("/api/safety-reports").set("x-test-user", "11").send({ reason: "Not a reason" })).status).toBe(400);
    const filed = await request(app).post("/api/safety-reports").set("x-test-user", "11").send({ reason: "Spam or repeated asks", urgent: true });
    expect(filed.status).toBe(201);
    expect(filed.body.report).toMatchObject({ reference: "R-1001", urgent: true });
    const mine = await request(app).get("/api/safety-reports/mine").set("x-test-user", "11");
    expect(mine.body.reports).toHaveLength(1);
    expect((await request(app).get("/api/safety-reports/mine").set("x-test-user", "22")).body.reports).toHaveLength(0);
  });

  it("suggests companies with daily limits and duplicate protection", async () => {
    const app = buildApp();
    expect((await request(app).post("/api/company-suggestions")).status).toBe(401);
    expect((await request(app).post("/api/company-suggestions").set("x-test-user", "11").send({ companyName: "X" })).status).toBe(400);
    expect((await request(app).post("/api/company-suggestions").set("x-test-user", "11").send({ companyName: "Acme", website: "notaurl" })).status).toBe(400);
    expect((await request(app).post("/api/company-suggestions").set("x-test-user", "11").send({ companyName: "Acme Corp", website: "https://acme.example" })).status).toBe(201);
    expect((await request(app).post("/api/company-suggestions").set("x-test-user", "22").send({ companyName: "acme corp" })).status).toBe(400);
    await request(app).post("/api/company-suggestions").set("x-test-user", "11").send({ companyName: "Beta" });
    await request(app).post("/api/company-suggestions").set("x-test-user", "11").send({ companyName: "Gamma" });
    expect((await request(app).post("/api/company-suggestions").set("x-test-user", "11").send({ companyName: "Delta" })).status).toBe(400);
    expect((await request(app).get("/api/company-suggestions/mine").set("x-test-user", "11")).body.suggestions).toHaveLength(3);
  });
});
