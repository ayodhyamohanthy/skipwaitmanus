import express, { type Express, type Request } from "express";
import { createCompanySuggestion, createSafetyReport, listMyCompanySuggestions, listMySafetyReports, SAFETY_REPORT_REASONS } from "./db";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type Identity = { account: Account };

export type SafetyRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number }) => void;
  createSafetyReport?: typeof createSafetyReport;
  listMySafetyReports?: typeof listMySafetyReports;
  createCompanySuggestion?: typeof createCompanySuggestion;
  listMyCompanySuggestions?: typeof listMyCompanySuggestions;
};

export function registerSafetyRoutes(app: Express, deps: SafetyRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input); };
  const fileReport = deps.createSafetyReport ?? createSafetyReport;
  const myReports = deps.listMySafetyReports ?? listMySafetyReports;
  const suggestCompany = deps.createCompanySuggestion ?? createCompanySuggestion;
  const mySuggestions = deps.listMyCompanySuggestions ?? listMyCompanySuggestions;

  app.get("/api/safety-report-reasons", (_req, res) => {
    res.json({ reasons: SAFETY_REPORT_REASONS });
  });

  app.post("/api/safety-reports", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to file a report" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const report = await fileReport(identity.account.id, {
        reason: body.reason,
        details: body.details,
        referralRequestId: body.referralRequestId,
        reportedUserId: body.reportedUserId,
        urgent: body.urgent,
      });
      record({ actorUserId: identity.account.id, action: "safety_report.filed", outcome: "success", resourceType: "safety_report", resourceId: report.id });
      res.status(201).json({ report });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not file this report";
      res.status(/choose|invalid|yourself|only report|several reports|up to/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.get("/api/safety-reports/mine", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your reports" });
      res.set("Cache-Control", "private, no-store");
      res.json({ reports: await myReports(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your reports" }); }
  });

  app.post("/api/company-suggestions", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to suggest a company" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const suggestion = await suggestCompany(identity.account.id, { companyName: body.companyName, website: body.website, role: body.role });
      record({ actorUserId: identity.account.id, action: "company_suggestion.filed", outcome: "success", resourceType: "company_suggestion", resourceId: suggestion.id });
      res.status(201).json({ suggestion });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save this suggestion";
      res.status(/name|website|up to 3|already suggested|seeker|employee/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.get("/api/company-suggestions/mine", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your suggestions" });
      res.set("Cache-Control", "private, no-store");
      res.json({ suggestions: await mySuggestions(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your suggestions" }); }
  });
}
