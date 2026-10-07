import type { Express, Request } from "express";
import { z } from "zod";
import { SAFETY_REPORT_REASONS } from "./db";

/**
 * Safety reporting and blocking — the `/report` flow in the v4 kit
 * (SCREENS.md `/report`, FOR_AI_BUILDERS.md §3 "Safety").
 *
 * Contract notes that the design does not state:
 * - The reporter's identity is never disclosed to the subject. Admin responses
 *   carry both ids because review needs them; the reporter's own list does not
 *   project the subject at all.
 * - `urgent` is the reporter's "I feel unsafe" toggle and is the only thing that
 *   moves the SLA: 4h vs 48h, computed server-side from `Date.now()` so a
 *   client clock cannot shrink the window.
 * - A block is created only when the reporter asks for one, and it is stored as
 *   a single direction (read both ways) so review can see who blocked whom.
 */

type Account = { id: number; openId: string; role?: "user" | "admin" };
type Identity = { account: Account };
type Gate = { identity: Identity } | { error: { status: number; body: { error: string } } };

type ActivityInput = {
  actorUserId?: number;
  action: string;
  outcome: "success" | "failure" | "denied";
  resourceType?: string;
  resourceId?: string | number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export type ReportRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: ActivityInput) => Promise<void>;
  userExists?: (userId: number) => Promise<boolean>;
  createSafetyReport: (input: {
    reporterUserId: number;
    subjectUserId?: number | null;
    reason: (typeof SAFETY_REPORT_REASONS)[number];
    details?: string;
    urgent?: boolean;
    blockRequested?: boolean;
  }) => Promise<{ id: number; reference: string; urgent: boolean; dueAt: Date; status: "received" }>;
  listMySafetyReports: (userId: number) => Promise<unknown[]>;
  blockUser: (blockerUserId: number, blockedUserId: number) => Promise<unknown>;
  listAdminSafetyReports?: (limit: number) => Promise<unknown[]>;
  reviewSafetyReport?: (
    adminUserId: number,
    reportId: number,
    input: { status: "in_review" | "resolved" | "declined"; outcome?: "warning" | "restricted" | "removed" | "no_action"; reviewerNote: string },
  ) => Promise<unknown>;
};

const createReportSchema = z.object({
  subjectUserId: z.number().int().positive().optional(),
  reason: z.enum(SAFETY_REPORT_REASONS),
  details: z.string().max(2000).optional(),
  urgent: z.boolean().optional(),
  block: z.boolean().optional(),
});

// The note is mandatory by design: an outcome with no recorded reasoning is not
// an audit trail. `.trim()` must come before `.min(1)`, otherwise a
// whitespace-only note passes validation here and is only caught in the data
// layer, which surfaces a 500 for what is really a client validation error.
const decisionSchema = z.object({
  status: z.enum(["in_review", "resolved", "declined"]),
  outcome: z.enum(["warning", "restricted", "removed", "no_action"]).optional(),
  reviewerNote: z.string().trim().min(1).max(2000),
});

export function registerReportRoutes(app: Express, deps: ReportRouteDeps) {
  const record = (input: ActivityInput) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const exists = deps.userExists ?? (async () => true);

  const requireIdentity = async (req: Request): Promise<Gate> => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) return { error: { status: 401, body: { error: "Sign in to use safety tools" } } };
    return { identity };
  };

  const requireAdmin = async (req: Request): Promise<Gate> => {
    const gate = await requireIdentity(req);
    if ("error" in gate) return gate;
    if (gate.identity.account.role !== "admin") return { error: { status: 403, body: { error: "Administrator access is required" } } };
    return { identity: gate.identity };
  };

  app.post("/api/reports", async (req, res) => {
    try {
      const gate = await requireIdentity(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const parsed = createReportSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: "Choose a reason for this report" });
      const reporterUserId = gate.identity.account.id;
      const subjectUserId = parsed.data.subjectUserId;
      if (subjectUserId !== undefined && subjectUserId === reporterUserId) {
        return res.status(400).json({ error: "You cannot report yourself" });
      }
      if (subjectUserId !== undefined && !(await exists(subjectUserId))) {
        return res.status(404).json({ error: "This person is not available" });
      }
      const report = await deps.createSafetyReport({
        reporterUserId,
        subjectUserId: subjectUserId ?? null,
        reason: parsed.data.reason,
        details: parsed.data.details,
        urgent: parsed.data.urgent,
        blockRequested: parsed.data.block,
      });
      let blocked = false;
      if (parsed.data.block === true && subjectUserId !== undefined) {
        try {
          await deps.blockUser(reporterUserId, subjectUserId);
          blocked = true;
        } catch {
          // The report is already filed and must not be lost because the block
          // failed; the reporter can block again from Settings.
          blocked = false;
        }
      }
      record({ actorUserId: reporterUserId, action: "safety_report.created", outcome: "success", resourceType: "safety_report", resourceId: report.id, metadata: { reason: parsed.data.reason, urgent: report.urgent, blocked } });
      res.set("Cache-Control", "private, no-store");
      res.status(201).json({ ...report, blocked });
    } catch {
      res.status(500).json({ error: "We could not submit this report" });
    }
  });

  app.get("/api/reports/mine", async (req, res) => {
    try {
      const gate = await requireIdentity(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const reports = await deps.listMySafetyReports(gate.identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ reports });
    } catch {
      res.status(500).json({ error: "We could not load your reports" });
    }
  });

  app.get("/api/admin/reports", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      if (!deps.listAdminSafetyReports) return res.status(503).json({ error: "Safety review is unavailable" });
      const reports = await deps.listAdminSafetyReports(Number(req.query.limit) || 100);
      res.set("Cache-Control", "private, no-store");
      res.json({ reports });
    } catch {
      res.status(500).json({ error: "We could not load the safety queue" });
    }
  });

  app.post("/api/admin/reports/:reportId/decision", async (req, res) => {
    try {
      const gate = await requireAdmin(req);
      if ("error" in gate) return res.status(gate.error.status).json(gate.error.body);
      const reportId = Number(req.params.reportId);
      if (!Number.isInteger(reportId) || reportId <= 0) return res.status(400).json({ error: "Invalid report" });
      const parsed = decisionSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: "A reviewer note is required for every decision" });
      if (!deps.reviewSafetyReport) return res.status(503).json({ error: "Safety review is unavailable" });
      const result = await deps.reviewSafetyReport(gate.identity.account.id, reportId, parsed.data);
      if (!result) return res.status(404).json({ error: "This report is no longer in the queue" });
      record({ actorUserId: gate.identity.account.id, action: "safety_report.reviewed", outcome: "success", resourceType: "safety_report", resourceId: reportId, metadata: { status: parsed.data.status, outcome: parsed.data.outcome ?? null } });
      res.set("Cache-Control", "private, no-store");
      res.json(result);
    } catch {
      res.status(500).json({ error: "We could not record this decision" });
    }
  });
}
