// D-086 demand-list REST surface (packet §5.1 step 3).
//   GET /api/company-demand            public, cached: listed companies with people asking
//   GET /api/company-demand/:slug      public, cached: one company's demand state
//   GET /api/admin/company-demand/unlisted  admin, flagged: unowned domains by people
//
// The prefix is /api/company-demand, not /api/companies/:slug, so a slug can
// never shadow these routes. Both switches start false (shared/companyDemand.ts);
// while a switch is off its routes do not exist and nothing is read.
//
// A public body carries slugs, names and a demand state only. There is no
// total, no request count, no availability field and no domain.
import { DrizzleQueryError } from "drizzle-orm";
import type { Express, Request, Response } from "express";
import { COMPANY_NOT_FOUND_ERROR, COMPANY_SLUG_PATTERN, type AdminCompany, type CompanyDirectoryResponse, type PublicCompany } from "../shared/companies";
import { COMPANY_DEMAND_ADMIN_ENABLED, COMPANY_DEMAND_PUBLIC_ENABLED, companyDemandDetailResponseSchema, companyDemandListResponseSchema, orderDemandList, toPublicDemand, unlistedDemandAdminResponseSchema, type DemandCompany } from "../shared/companyDemand";
import { getCompanyDirectoryEntry, listAdminCompanies, listCompanyDirectory } from "./companyDirectory";
import { loadCompanyDemand, loadUnlistedDemand } from "./companyDemand";
import { CompanyDirectoryUnavailableError } from "./companyDirectorySource";
import { captureServerError } from "./sentry";

type Identity = { account: { id: number; role?: "user" | "admin" } };
type ActivityInput = { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number };
type DemandCount = { slug: string; name: string; people: number };

export type CompanyDemandRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: ActivityInput) => void | Promise<void>;
  listCompanyDirectory?: () => Promise<CompanyDirectoryResponse>;
  getCompanyDirectoryEntry?: (slug: string) => Promise<PublicCompany | undefined>;
  listAdminCompanies?: () => Promise<AdminCompany[]>;
  /** COMPANY_DEMAND_PUBLIC_ENABLED, injectable for tests. */
  publicDemandEnabled?: () => boolean;
  /** COMPANY_DEMAND_ADMIN_ENABLED, injectable for tests. */
  adminDemandEnabled?: () => boolean;
  loadCompanyDemand?: (companies: readonly DemandCompany[], nowMs: number) => Promise<DemandCount[]>;
  loadUnlistedDemand?: (ownedDomains: readonly string[], nowMs: number) => Promise<Array<{ domain: string; people: number }>>;
  /** server/sentry.ts by default; tests capture the context. Never carries a query string or personal data. */
  reportError?: (error: unknown, context?: Record<string, unknown>) => void;
};

const PUBLIC_CACHE = "public, max-age=300";
const NOT_FOUND = "Not found";
const UNAVAILABLE = "We could not load demand right now";

/** slug, name and owned domains: the whole input the count needs. */
const asDemandCompany = (company: PublicCompany | AdminCompany): DemandCompany => ({ slug: company.slug, name: company.name, domains: company.domains });

export function registerCompanyDemandRoutes(app: Express, deps: CompanyDemandRouteDeps) {
  const list = deps.listCompanyDirectory ?? listCompanyDirectory;
  const getOne = deps.getCompanyDirectoryEntry ?? getCompanyDirectoryEntry;
  const adminList = deps.listAdminCompanies ?? listAdminCompanies;
  const loadCounts = deps.loadCompanyDemand ?? loadCompanyDemand;
  const loadUnlisted = deps.loadUnlistedDemand ?? loadUnlistedDemand;
  const publicEnabled = deps.publicDemandEnabled ?? (() => COMPANY_DEMAND_PUBLIC_ENABLED);
  const adminEnabled = deps.adminDemandEnabled ?? (() => COMPANY_DEMAND_ADMIN_ENABLED);
  const report = deps.reportError ?? captureServerError;
  const record = (input: ActivityInput) => { try { void Promise.resolve(deps.recordActivity?.(input)).catch(() => undefined); } catch { /* logging never breaks the request */ } };

  /** 401 for anonymous, 403 for signed-in non-admins; the admin identity otherwise. */
  const requireAdmin = async (req: Request, res: Response) => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) { res.status(401).json({ error: "Sign in to continue" }); return undefined; }
    if (identity.account.role !== "admin") {
      record({ actorUserId: identity.account.id, action: "admin.company_demand_denied", outcome: "denied", resourceType: "company" });
      res.status(403).json({ error: "Administrator access is required" });
      return undefined;
    }
    res.set("Cache-Control", "private, no-store");
    return identity;
  };

  /**
   * A read that fails is a 503 and never a cached body: the only input is the
   * clock, so "we cannot read it now" is the honest answer. Anything else is a
   * 500, so a contract bug never hides as a quiet outage. Both reach Sentry.
   */
  const failed = (res: Response, error: unknown) => {
    report(error, { source: "company-demand" });
    const down = error instanceof CompanyDirectoryUnavailableError || error instanceof DrizzleQueryError;
    res.status(down ? 503 : 500).set("Cache-Control", "no-store").json({ error: down ? UNAVAILABLE : "Something went wrong on our side" });
  };

  app.get("/api/company-demand", async (_req, res) => {
    if (!publicEnabled()) return res.status(404).set("Cache-Control", "no-store").json({ error: NOT_FOUND });
    try {
      const directory = await list();
      const counts = await loadCounts(directory.companies.map(asDemandCompany), Date.now());
      res.set("Cache-Control", PUBLIC_CACHE).json(companyDemandListResponseSchema.parse({ companies: orderDemandList(counts) }));
    } catch (error) { failed(res, error); }
  });

  app.get("/api/company-demand/:slug", async (req, res) => {
    if (!publicEnabled()) return res.status(404).set("Cache-Control", "no-store").json({ error: NOT_FOUND });
    const slug = req.params.slug ?? "";
    if (!COMPANY_SLUG_PATTERN.test(slug)) return res.status(400).set("Cache-Control", "no-store").json({ error: "Invalid company link" });
    try {
      const company = await getOne(slug);
      // A hidden company is absent here exactly as it is from the directory.
      if (!company) return res.status(404).set("Cache-Control", "no-store").json({ error: COMPANY_NOT_FOUND_ERROR });
      const [count] = await loadCounts([asDemandCompany(company)], Date.now());
      res.set("Cache-Control", PUBLIC_CACHE).json(companyDemandDetailResponseSchema.parse({ demand: toPublicDemand(count?.people ?? 0) }));
    } catch (error) { failed(res, error); }
  });

  app.get("/api/admin/company-demand/unlisted", async (req, res) => {
    try {
      const identity = await requireAdmin(req, res); if (!identity) return;
      if (!adminEnabled()) return res.status(404).set("Cache-Control", "no-store").json({ error: NOT_FOUND });
      // Every company domain is owned, listed or hidden: a hidden company is
      // still a company, so its domain never reaches the admission queue.
      const ownedDomains = (await adminList()).flatMap(company => company.domains);
      res.json(unlistedDemandAdminResponseSchema.parse({ domains: await loadUnlisted(ownedDomains, Date.now()) }));
    } catch (error) { failed(res, error); }
  });
}
