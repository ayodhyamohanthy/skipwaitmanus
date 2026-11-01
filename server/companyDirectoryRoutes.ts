// Company directory REST surface.
//   GET  /api/companies            public, cacheable: listed companies + openCount
//   GET  /api/companies/:slug      public, cacheable: one listed company, 404 otherwise
//   GET  /api/companies/:slug/opportunities  public, cacheable: a company's live
//                                  employee-posted roles (D-022), newest first
//   GET  /api/admin/companies?q=   admin: every company with status and domains
//   GET  /api/admin/companies/unmatched-domains  admin, flagged: verified work domains no company owns
//   POST /api/admin/companies      admin: create (strict Zod body)
//   PATCH /api/admin/companies/:id admin: edit, hide/list, add/remove alias domains
// Contracts live in shared/companies.ts; services are injectable for tests.
import express, { type Express, type Request, type Response } from "express";
import { refuseReviewerExternalAction } from "./_core/reviewerLogin";
import { adminCompanyCreateSchema, adminCompanyUpdateSchema, COMPANY_NOT_FOUND_ERROR, COMPANY_SLUG_PATTERN, type AdminCompany, type AdminCompanyCreate, type AdminCompanyUpdate, type CompanyDirectoryResponse, type PublicCompany } from "../shared/companies";
import { companyOpportunitiesResponseSchema } from "../shared/companyOpportunities";
import { getCompanyDirectoryEntry, listAdminCompanies, listCompanyDirectory } from "./companyDirectory";
import { CompanyConflictError, CompanyInputError, CompanyNotFoundError, createCompany, listUnmatchedWorkDomains, updateCompany, type UnmatchedWorkDomain } from "./companyDirectoryAdmin";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { companyResponseSignalEnabled, loadCompanyResponseSignal } from "./companyResponseSignal";
import { listCompanyOpportunityPosts } from "./db";
import type { CompanyResponseSignal } from "../shared/companyResponseSignal";

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number };

export type CompanyDirectoryRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: ActivityInput) => void | Promise<void>;
  listCompanyDirectory?: () => Promise<CompanyDirectoryResponse>;
  getCompanyDirectoryEntry?: (slug: string) => Promise<PublicCompany | undefined>;
  /** A company's live posts for the given domains (defaults to server/db.ts). */
  listCompanyOpportunities?: (domains: readonly string[], nowMs?: number) => Promise<unknown[]>;
  listAdminCompanies?: (query?: string) => Promise<AdminCompany[]>;
  createCompany?: (input: AdminCompanyCreate) => Promise<AdminCompany>;
  updateCompany?: (id: number, patch: AdminCompanyUpdate) => Promise<AdminCompany>;
  /** Flag company_response_signal (D-097): off until QA. */
  responseSignalEnabled?: () => boolean;
  loadResponseSignal?: (domains: readonly string[]) => Promise<CompanyResponseSignal>;
  /** D-097: off until QA verifies. Defaults to UNMATCHED_DOMAINS_ENABLED=true. */
  unmatchedDomainsEnabled?: () => boolean;
  listUnmatchedWorkDomains?: () => Promise<UnmatchedWorkDomain[]>;
};

const PUBLIC_CACHE = "public, max-age=60";

function failure(res: Response, error: unknown, fallback: string) {
  res.set("Cache-Control", "no-store");
  if (error instanceof CompanyDirectoryUnavailableError) return res.status(503).json({ error: error.message });
  if (error instanceof CompanyNotFoundError) return res.status(404).json({ error: error.message });
  if (error instanceof CompanyConflictError) return res.status(409).json({ error: error.message });
  if (error instanceof CompanyInputError) return res.status(400).json({ error: error.message });
  return res.status(500).json({ error: fallback });
}

export function registerCompanyDirectoryRoutes(app: Express, deps: CompanyDirectoryRouteDeps) {
  const list = deps.listCompanyDirectory ?? listCompanyDirectory;
  const getOne = deps.getCompanyDirectoryEntry ?? getCompanyDirectoryEntry;
  const listOpportunities = deps.listCompanyOpportunities ?? listCompanyOpportunityPosts;
  const adminList = deps.listAdminCompanies ?? listAdminCompanies;
  const create = deps.createCompany ?? createCompany;
  const update = deps.updateCompany ?? updateCompany;
  const record = (input: ActivityInput) => { try { void Promise.resolve(deps.recordActivity?.(input)).catch(() => undefined); } catch { /* logging never breaks the request */ } };

  /** 401 for anonymous, 403 for signed-in non-admins; the admin identity otherwise. */
  const requireAdmin = async (req: Request, res: Response) => {
    const identity = await deps.resolveIdentity(req);
    if (refuseReviewerExternalAction(res, (identity?.account as { openId?: string } | undefined)?.openId)) return undefined;
    if (!identity) { res.status(401).json({ error: "Sign in to continue" }); return undefined; }
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.companies_denied", outcome: "denied", resourceType: "company" });
      res.status(403).json({ error: "Administrator access is required" });
      return undefined;
    }
    res.set("Cache-Control", "private, no-store");
    return identity;
  };

  app.get("/api/companies", async (_req, res) => {
    try { const directory = await list(); res.set("Cache-Control", PUBLIC_CACHE).json(directory); }
    catch (error) { failure(res, error, "We could not load companies"); }
  });

  app.get("/api/companies/:slug", async (req, res) => {
    const slug = req.params.slug ?? "";
    if (!COMPANY_SLUG_PATTERN.test(slug)) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid company link" });
    try {
      const company = await getOne(slug);
      if (!company) return res.status(404).set("Cache-Control", "public, max-age=30").json({ error: COMPANY_NOT_FOUND_ERROR });
      res.set("Cache-Control", PUBLIC_CACHE).json({ company });
    } catch (error) { failure(res, error, "We could not load this company"); }
  });

  // A company's live openings from its verified employees (D-022, plan 3c):
  // public and cached like the directory read. The service omits lapsed and
  // closed posts and never returns poster ids, emails or names unless the
  // poster chose a first name; a row that fails the shared contract is an
  // error, never a partially rendered card.
  app.get("/api/companies/:slug/opportunities", async (req, res) => {
    const slug = req.params.slug ?? "";
    if (!COMPANY_SLUG_PATTERN.test(slug)) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid company link" });
    try {
      const company = await getOne(slug);
      if (!company) return res.status(404).set("Cache-Control", "public, max-age=30").json({ error: COMPANY_NOT_FOUND_ERROR });
      const opportunities = await listOpportunities(company.domains, Date.now());
      res.set("Cache-Control", PUBLIC_CACHE).json(companyOpportunitiesResponseSchema.parse({ opportunities }));
    } catch (error) { failure(res, error, "We could not load this company's openings"); }
  });

  // Aggregate responsiveness for one listed company. 404 while the flag is off, so the surface does not exist.
  app.get("/api/companies/:slug/response-signal", async (req, res) => {
    if (!(deps.responseSignalEnabled ?? companyResponseSignalEnabled)()) return res.status(404).set("Cache-Control", "no-store").json({ error: "Not found" });
    const slug = req.params.slug ?? "";
    if (!COMPANY_SLUG_PATTERN.test(slug)) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid company link" });
    try {
      const company = await getOne(slug);
      if (!company) return res.status(404).set("Cache-Control", "public, max-age=30").json({ error: COMPANY_NOT_FOUND_ERROR });
      res.set("Cache-Control", PUBLIC_CACHE).json({ signal: await (deps.loadResponseSignal ?? loadCompanyResponseSignal)(company.domains) });
    } catch (error) { failure(res, error, "We could not load this company's signal"); }
  });

  app.get("/api/admin/companies", async (req, res) => {
    try {
      const identity = await requireAdmin(req, res); if (!identity) return;
      const query = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
      res.json({ companies: await adminList(query) });
    } catch (error) { failure(res, error, "We could not load companies"); }
  });

  app.get("/api/admin/companies/unmatched-domains", async (req, res) => {
    try {
      const identity = await requireAdmin(req, res); if (!identity) return;
      const enabled = deps.unmatchedDomainsEnabled ?? (() => process.env.UNMATCHED_DOMAINS_ENABLED === "true");
      if (!enabled()) return res.status(404).json({ error: "Not found" });
      res.json({ domains: await (deps.listUnmatchedWorkDomains ?? listUnmatchedWorkDomains)() });
    } catch (error) { failure(res, error, "We could not load unmatched domains"); }
  });

  app.post("/api/admin/companies", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const identity = await requireAdmin(req, res); if (!identity) return;
      const parsed = adminCompanyCreateSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the company details" });
      const company = await create(parsed.data);
      record({ actorUserId: identity.account.id, action: "admin.company_created", outcome: "success", resourceType: "company", resourceId: company.id });
      res.status(201).json({ company });
    } catch (error) { failure(res, error, "We could not create this company"); }
  });

  app.patch("/api/admin/companies/:id", express.json({ limit: "16kb" }), async (req, res) => {
    try {
      const identity = await requireAdmin(req, res); if (!identity) return;
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid company reference" });
      const parsed = adminCompanyUpdateSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Check the company details" });
      const company = await update(id, parsed.data);
      record({ actorUserId: identity.account.id, action: "admin.company_updated", outcome: "success", resourceType: "company", resourceId: id });
      res.json({ company });
    } catch (error) { failure(res, error, "We could not update this company"); }
  });
}
