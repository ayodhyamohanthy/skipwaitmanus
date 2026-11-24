// D-099 slice A (D-374): the referral-bonus REST surface.
//   GET  /api/company-bonuses                    public, cacheable: listed companies with a published, fresh figure
//   GET  /api/company-bonuses/:slug              public, cacheable: one company's state + figure, 404 otherwise
//   POST /api/company-bonuses/:slug/reports      signed in: file a report (5 per person per 24 h)
//   GET  /api/admin/company-bonuses              admin: every company with its figure, stale flag and open reports
//   PUT  /api/admin/company-bonuses/:companyId   admin: upsert (the source must be on that company's own domain)
//   POST /api/admin/company-bonuses/:companyId/withdraw  admin: withdraw
//   GET  /api/admin/company-bonus-reports        admin: reports by status, never the reporter's email
//   POST /api/admin/company-bonus-reports/:id/decision   admin: fixed | dismissed
// Every route answers 404 while BONUS_PAGES_ENABLED is off (D-097). There is no
// public bonus page, sitemap entry or middleware pattern (D-374).
import type { Express, Request, Response } from "express";
import {
  BONUS_REPORT_LIMIT_MESSAGE,
  BONUS_REPORTS_PER_DAY,
  BONUS_SOURCE_DOMAIN_ERROR,
  adminBonusUpsertSchema,
  bonusDetailResponseSchema,
  bonusListResponseSchema,
  bonusReportDecisionSchema,
  bonusReportInputSchema,
  sourceHostAllowed,
} from "../shared/referralBonus";
import { COMPANY_SLUG_PATTERN } from "../shared/companies";
import type { ReferralBonusStore } from "./referralBonusStore";
import { defaultReferralBonusStore, toPublicBonus } from "./referralBonusStore";

export const BONUS_PAGES_FLAG = "BONUS_PAGES_ENABLED";
export const bonusPagesEnabled = () => process.env[BONUS_PAGES_FLAG] === "true";

const PUBLIC_CACHE = "public, max-age=300";
const DAY_MS = 24 * 60 * 60 * 1000;

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number };

export type ReferralBonusRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: ActivityInput) => void | Promise<void>;
  store?: () => Promise<ReferralBonusStore | undefined>;
  enabled?: () => boolean;
  now?: () => Date;
};

export function registerReferralBonusRoutes(app: Express, deps: ReferralBonusRouteDeps) {
  const enabled = deps.enabled ?? bonusPagesEnabled;
  const now = deps.now ?? (() => new Date());
  const loadStore = deps.store ?? defaultReferralBonusStore;
  const record = (input: ActivityInput) => { try { void Promise.resolve(deps.recordActivity?.(input)).catch(() => undefined); } catch { /* logging never breaks the request */ } };

  /** 404 everywhere while the flag is off: the surface does not exist. */
  const off = (res: Response) => { res.status(404).set("Cache-Control", "no-store").json({ error: "Not found" }); return true; };

  const requireAdmin = async (req: Request, res: Response) => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) { res.status(401).json({ error: "Sign in to continue" }); return undefined; }
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.company_bonus.denied", outcome: "denied", resourceType: "company_bonus" });
      res.status(403).json({ error: "Administrator access is required" });
      return undefined;
    }
    res.set("Cache-Control", "private, no-store");
    return identity;
  };

  const requireStore = async (res: Response) => {
    const store = await loadStore();
    if (!store) { res.status(503).set("Cache-Control", "no-store").json({ error: "We could not load referral bonuses" }); return undefined; }
    return store;
  };

  app.get("/api/company-bonuses", async (_req, res) => {
    if (!enabled()) return off(res);
    const store = await requireStore(res);
    if (!store) return;
    try {
      const bonuses = await store.listPublished(now());
      res.set("Cache-Control", PUBLIC_CACHE).json(bonusListResponseSchema.parse({ bonuses }));
    } catch {
      res.status(503).set("Cache-Control", "no-store").json({ error: "We could not load referral bonuses" });
    }
  });

  app.get("/api/company-bonuses/:slug", async (req, res) => {
    if (!enabled()) return off(res);
    const slug = req.params.slug ?? "";
    if (!COMPANY_SLUG_PATTERN.test(slug)) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid company link" });
    const store = await requireStore(res);
    if (!store) return;
    try {
      const company = await store.companyBySlug(slug);
      if (!company || company.status === "hidden") return res.status(404).set("Cache-Control", "no-store").json({ error: "This door doesn't lead anywhere" });
      const bonus = await store.getPublishedForCompany(company.id, now());
      const identity = { slug: company.slug, name: company.name, initials: company.initials };
      res.set("Cache-Control", PUBLIC_CACHE).json(bonusDetailResponseSchema.parse({ company: identity, state: bonus ? "published" : "not_published", bonus: bonus ? toPublicBonus(bonus) : null }));
    } catch {
      res.status(503).set("Cache-Control", "no-store").json({ error: "We could not load referral bonuses" });
    }
  });

  app.post("/api/company-bonuses/:slug/reports", async (req, res) => {
    if (!enabled()) return off(res);
    const identity = await deps.resolveIdentity(req);
    if (!identity) return res.status(401).set("Cache-Control", "no-store").json({ error: "Sign in to report a wrong figure" });
    const parsed = bonusReportInputSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).set("Cache-Control", "no-store").json({ error: "Check the report and try again" });
    const slug = req.params.slug ?? "";
    if (!COMPANY_SLUG_PATTERN.test(slug)) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid company link" });
    const store = await requireStore(res);
    if (!store) return;
    try {
      const company = await store.companyBySlug(slug);
      if (!company || company.status === "hidden") return res.status(404).set("Cache-Control", "no-store").json({ error: "This door doesn't lead anywhere" });
      const since = new Date(now().getTime() - DAY_MS);
      if (await store.countReportsSince(identity.account.id, since) >= BONUS_REPORTS_PER_DAY) {
        return res.status(429).set("Cache-Control", "no-store").json({ error: BONUS_REPORT_LIMIT_MESSAGE });
      }
      await store.createReport(company.id, identity.account.id, parsed.data, now());
      // The reporter's note never reaches the activity log (ruling 10).
      record({ actorUserId: identity.account.id, action: "company_bonus.report_filed", outcome: "success", resourceType: "company", resourceId: company.id });
      res.status(201).set("Cache-Control", "no-store").json({ ok: true });
    } catch {
      res.status(503).set("Cache-Control", "no-store").json({ error: "We could not record the report" });
    }
  });

  app.get("/api/admin/company-bonuses", async (req, res) => {
    if (!enabled()) return off(res);
    const identity = await requireAdmin(req, res);
    if (!identity) return;
    const store = await requireStore(res);
    if (!store) return;
    try {
      const rows = await store.listAdmin(now());
      res.json({ bonuses: rows });
    } catch {
      res.status(503).json({ error: "We could not load referral bonuses" });
    }
  });

  app.put("/api/admin/company-bonuses/:companyId", async (req, res) => {
    if (!enabled()) return off(res);
    const identity = await requireAdmin(req, res);
    if (!identity) return;
    const companyId = Number(req.params.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ error: "Invalid company" });
    const parsed = adminBonusUpsertSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Check the figure and try again" });
    const store = await requireStore(res);
    if (!store) return;
    try {
      const company = await store.companyById(companyId);
      if (!company) return res.status(404).json({ error: "This door doesn't lead anywhere" });
      const domains = await store.domainsOf(companyId);
      if (!sourceHostAllowed(parsed.data.sourceUrl, domains)) {
        return res.status(400).json({ error: BONUS_SOURCE_DOMAIN_ERROR(company.name) });
      }
      await store.upsert(companyId, { ...parsed.data, checkedAt: new Date(parsed.data.checkedAt) }, identity.account.id, now());
      record({ actorUserId: identity.account.id, action: "admin.company_bonus.upserted", outcome: "success", resourceType: "company", resourceId: companyId });
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "We could not save the figure" });
    }
  });

  app.post("/api/admin/company-bonuses/:companyId/withdraw", async (req, res) => {
    if (!enabled()) return off(res);
    const identity = await requireAdmin(req, res);
    if (!identity) return;
    const companyId = Number(req.params.companyId);
    if (!Number.isInteger(companyId) || companyId <= 0) return res.status(400).json({ error: "Invalid company" });
    const store = await requireStore(res);
    if (!store) return;
    try {
      const withdrawn = await store.withdraw(companyId, identity.account.id, now());
      if (!withdrawn) return res.status(404).json({ error: "There is no figure to withdraw" });
      record({ actorUserId: identity.account.id, action: "admin.company_bonus.withdrawn", outcome: "success", resourceType: "company", resourceId: companyId });
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "We could not withdraw the figure" });
    }
  });

  app.get("/api/admin/company-bonus-reports", async (req, res) => {
    if (!enabled()) return off(res);
    const identity = await requireAdmin(req, res);
    if (!identity) return;
    const status = req.query.status === "fixed" || req.query.status === "dismissed" ? req.query.status : "open";
    const store = await requireStore(res);
    if (!store) return;
    try {
      const reports = await store.listReports(status);
      res.json({ reports });
    } catch {
      res.status(503).json({ error: "We could not load reports" });
    }
  });

  app.post("/api/admin/company-bonus-reports/:id/decision", async (req, res) => {
    if (!enabled()) return off(res);
    const identity = await requireAdmin(req, res);
    if (!identity) return;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid report" });
    const parsed = bonusReportDecisionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Choose Fixed or Dismissed" });
    const store = await requireStore(res);
    if (!store) return;
    try {
      const decided = await store.decideReport(id, parsed.data.decision, identity.account.id, now());
      if (!decided) return res.status(404).json({ error: "That report is not open" });
      record({ actorUserId: identity.account.id, action: "admin.company_bonus_report.decided", outcome: "success", resourceType: "company_bonus_report", resourceId: id });
      res.json({ ok: true });
    } catch {
      res.status(503).json({ error: "We could not record the decision" });
    }
  });
}
