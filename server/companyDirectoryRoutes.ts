// Company directory REST surface.
//   GET  /api/companies            public, cacheable: listed companies + openCount
//   GET  /api/companies/:slug      public, cacheable: one listed company, 404 otherwise
//   GET  /api/admin/companies?q=   admin: every company with status and domains
//   POST /api/admin/companies      admin: create (strict Zod body)
//   PATCH /api/admin/companies/:id admin: edit, hide/list, add/remove alias domains
// Contracts live in shared/companies.ts; services are injectable for tests.
import express, { type Express, type Request, type Response } from "express";
import { adminCompanyCreateSchema, adminCompanyUpdateSchema, COMPANY_NOT_FOUND_ERROR, COMPANY_SLUG_PATTERN, type AdminCompany, type AdminCompanyCreate, type AdminCompanyUpdate, type CompanyDirectoryResponse, type PublicCompany } from "../shared/companies";
import { getCompanyDirectoryEntry, listAdminCompanies, listCompanyDirectory } from "./companyDirectory";
import { CompanyConflictError, CompanyInputError, CompanyNotFoundError, createCompany, updateCompany } from "./companyDirectoryAdmin";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number };

export type CompanyDirectoryRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: ActivityInput) => void | Promise<void>;
  listCompanyDirectory?: () => Promise<CompanyDirectoryResponse>;
  getCompanyDirectoryEntry?: (slug: string) => Promise<PublicCompany | undefined>;
  listAdminCompanies?: (query?: string) => Promise<AdminCompany[]>;
  createCompany?: (input: AdminCompanyCreate) => Promise<AdminCompany>;
  updateCompany?: (id: number, patch: AdminCompanyUpdate) => Promise<AdminCompany>;
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
  const adminList = deps.listAdminCompanies ?? listAdminCompanies;
  const create = deps.createCompany ?? createCompany;
  const update = deps.updateCompany ?? updateCompany;
  const record = (input: ActivityInput) => { try { void Promise.resolve(deps.recordActivity?.(input)).catch(() => undefined); } catch { /* logging never breaks the request */ } };

  /** 401 for anonymous, 403 for signed-in non-admins; the admin identity otherwise. */
  const requireAdmin = async (req: Request, res: Response) => {
    const identity = await deps.resolveIdentity(req);
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

  app.get("/api/admin/companies", async (req, res) => {
    try {
      const identity = await requireAdmin(req, res); if (!identity) return;
      const query = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
      res.json({ companies: await adminList(query) });
    } catch (error) { failure(res, error, "We could not load companies"); }
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
