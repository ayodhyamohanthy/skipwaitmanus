import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerReportRoutes, type ReportRouteDeps } from "./reportRoutes";
import { SAFETY_REPORT_REASONS, safetyReportAppealUntil, safetyReportDueAt, safetyReportReference } from "./db";

const HOUR = 60 * 60 * 1000;

type StoredReport = {
  id: number;
  reporterUserId: number;
  subjectUserId: number | null;
  reason: string;
  details: string | null;
  urgent: boolean;
  blockRequested: boolean;
  dueAt: Date;
  status: "received";
};

function buildApp(options: { users?: number[]; admin?: number[] } = {}) {
  const app = express();
  app.use(express.json());
  const users = new Set(options.users ?? [11, 22, 33]);
  const admins = new Set(options.admin ?? [99]);
  const identities = new Map([...users, ...admins].map(id => [String(id), { account: { id, openId: `workos-${id}`, role: admins.has(id) ? ("admin" as const) : ("user" as const) } }]));
  const reports: StoredReport[] = [];
  const blocks: Array<[number, number]> = [];

  const deps: ReportRouteDeps = {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    recordActivity: async () => undefined,
    userExists: async userId => users.has(userId),
    createSafetyReport: async input => {
      const id = reports.length + 1;
      // Uses the real SLA helper, so these route tests assert the shipped window
      // rather than a stub's idea of it.
      const dueAt = safetyReportDueAt(input.urgent === true);
      reports.push({ id, reporterUserId: input.reporterUserId, subjectUserId: input.subjectUserId ?? null, reason: input.reason, details: input.details?.trim() || null, urgent: input.urgent === true, blockRequested: input.blockRequested === true, dueAt, status: "received" });
      return { id, reference: safetyReportReference(id), urgent: input.urgent === true, dueAt, status: "received" as const };
    },
    listMySafetyReports: async userId => reports.filter(report => report.reporterUserId === userId).map(report => ({ id: report.id, reference: safetyReportReference(report.id), reason: report.reason, status: report.status, urgent: report.urgent, dueAt: report.dueAt })),
    blockUser: async (blocker, blocked) => { blocks.push([blocker, blocked]); },
    listAdminSafetyReports: async () => reports.map(report => ({ ...report, reference: safetyReportReference(report.id) })),
    reviewSafetyReport: async (adminUserId, reportId, input) => {
      const target = reports.find(report => report.id === reportId);
      if (!target) return undefined;
      return { id: reportId, reference: safetyReportReference(reportId), status: input.status, outcome: input.status === "declined" ? "no_action" : input.outcome ?? null, reviewerNote: input.reviewerNote, reviewedByUserId: adminUserId, appealUntil: safetyReportAppealUntil(new Date()) };
    },
  };
  registerReportRoutes(app, deps);
  return { app, reports, blocks };
}

describe("safety report SLA policy", () => {
  it("gives an unsafe report 4 hours and a normal one 48 hours", () => {
    const from = new Date("2026-10-07T00:00:00.000Z");
    expect(safetyReportDueAt(true, from).getTime() - from.getTime()).toBe(4 * HOUR);
    expect(safetyReportDueAt(false, from).getTime() - from.getTime()).toBe(48 * HOUR);
  });
  it("opens a 14-day appeal window from the review moment", () => {
    const reviewedAt = new Date("2026-10-07T00:00:00.000Z");
    expect(safetyReportAppealUntil(reviewedAt).getTime() - reviewedAt.getTime()).toBe(14 * 24 * HOUR);
  });
  it("derives a stable human reference from the row id", () => {
    expect(safetyReportReference(1048)).toBe("R-2048");
    expect(safetyReportReference(1)).toBe("R-1001");
  });
});

describe("POST /api/reports", () => {
  it("files a normal report and returns a reference with the 48h window", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 22, reason: "harassment" });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ reference: "R-1001", urgent: false, status: "received", blocked: false });
    expect(new Date(response.body.dueAt).getTime() - Date.now()).toBeGreaterThan(47 * HOUR);
  });

  it("shortens the window to 4 hours when the reporter says they feel unsafe", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 22, reason: "harassment", urgent: true });
    expect(response.status).toBe(201);
    expect(response.body.urgent).toBe(true);
    expect(new Date(response.body.dueAt).getTime() - Date.now()).toBeLessThanOrEqual(4 * HOUR);
  });

  it("blocks the subject only when the reporter asks for it", async () => {
    const withBlock = buildApp();
    const blocked = await request(withBlock.app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 22, reason: "spam", block: true });
    expect(blocked.body.blocked).toBe(true);
    expect(withBlock.blocks).toEqual([[11, 22]]);

    const withoutBlock = buildApp();
    const plain = await request(withoutBlock.app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 22, reason: "spam" });
    expect(plain.body.blocked).toBe(false);
    expect(withoutBlock.blocks).toEqual([]);
  });

  it("accepts every reason the design offers", async () => {
    for (const reason of SAFETY_REPORT_REASONS) {
      const { app } = buildApp();
      expect((await request(app).post("/api/reports").set("x-test-user", "11").send({ reason })).status).toBe(201);
    }
  });

  it("rejects an unknown reason, a self-report, an unknown subject and anonymous use", async () => {
    const { app } = buildApp();
    expect((await request(app).post("/api/reports").set("x-test-user", "11").send({ reason: "not_a_reason" })).status).toBe(400);
    expect((await request(app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 11, reason: "spam" })).status).toBe(400);
    expect((await request(app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 99, reason: "spam" })).status).toBe(404);
    expect((await request(app).post("/api/reports").send({ reason: "spam" })).status).toBe(401);
  });

  it("rejects details beyond the stored limit", async () => {
    const { app } = buildApp();
    expect((await request(app).post("/api/reports").set("x-test-user", "11").send({ reason: "other", details: "x".repeat(2001) })).status).toBe(400);
  });
});

describe("GET /api/reports/mine", () => {
  it("requires auth and returns only the reporter's own reports", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/reports/mine")).status).toBe(401);
    await request(app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 22, reason: "spam" });
    await request(app).post("/api/reports").set("x-test-user", "33").send({ subjectUserId: 22, reason: "spam" });
    const mine = await request(app).get("/api/reports/mine").set("x-test-user", "11");
    expect(mine.status).toBe(200);
    expect(mine.body.reports).toHaveLength(1);
    // The reporter's own view must not echo who they reported.
    expect(JSON.stringify(mine.body)).not.toMatch(/subjectUserId|reporterUserId/);
  });
});

describe("admin safety review", () => {
  it("gates the queue on the admin role", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/admin/reports")).status).toBe(401);
    expect((await request(app).get("/api/admin/reports").set("x-test-user", "11")).status).toBe(403);
    const admin = await request(app).get("/api/admin/reports").set("x-test-user", "99");
    expect(admin.status).toBe(200);
    expect(Array.isArray(admin.body.reports)).toBe(true);
  });

  it("requires a reviewer note on every decision", async () => {
    const { app } = buildApp();
    await request(app).post("/api/reports").set("x-test-user", "11").send({ subjectUserId: 22, reason: "harassment" });
    expect((await request(app).post("/api/admin/reports/1/decision").set("x-test-user", "99").send({ status: "resolved", outcome: "warning" })).status).toBe(400);
    expect((await request(app).post("/api/admin/reports/1/decision").set("x-test-user", "99").send({ status: "resolved", outcome: "warning", reviewerNote: "   " })).status).toBe(400);
    const decided = await request(app).post("/api/admin/reports/1/decision").set("x-test-user", "99").send({ status: "resolved", outcome: "warning", reviewerNote: "Harassment confirmed in thread." });
    expect(decided.status).toBe(200);
    expect(decided.body).toMatchObject({ status: "resolved", outcome: "warning" });
  });

  it("refuses a non-admin decision and an unknown report", async () => {
    const { app } = buildApp();
    expect((await request(app).post("/api/admin/reports/1/decision").set("x-test-user", "11").send({ status: "resolved", outcome: "warning", reviewerNote: "n" })).status).toBe(403);
    expect((await request(app).post("/api/admin/reports/404/decision").set("x-test-user", "99").send({ status: "resolved", outcome: "warning", reviewerNote: "n" })).status).toBe(404);
  });
});
