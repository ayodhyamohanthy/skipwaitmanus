// Job catalog routes (D-174-job-catalog, packet section 5.5).
// GET /api/companies/:slug/jobs serves the company's catalog with filters,
// facets and 50-job pages; POST /api/admin/job-sources registers a board
// source with its evidence (verification stays a human step). While
// JOB_CATALOG_ENABLED is false the jobs route answers "unavailable" (D-097).
// Catalog rows live in catalogJobs only: the legacy /api/jobs list and its
// JobPosting markup read the jobs table and never see them.

import type { Express, Request, Response as ExpressResponse } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { JOB_CATALOG_ENABLED, JOB_CATALOG_PAGE_SIZE, companyJobsResponseSchema, jobCatalogProviderSchema } from "../shared/jobCatalog";
import { catalogJobs, companies, companyJobSources } from "../drizzle/schema";
import { getDb } from "./db";
import { createDrizzleCatalogSyncStore, syncOneSource, type CatalogSourceRow } from "./jobSources/sync";
import { captureServerError } from "./sentry";

export type StoredCatalogJob = {
  id: number;
  companyId: number;
  sourceId: number;
  externalId: string;
  title: string;
  rawLocation: string | null;
  locations: string[];
  workMode: "onsite" | "hybrid" | "remote" | "unknown";
  department: string | null;
  jobFunction: string | null;
  level: number;
  applyUrl: string;
  snippet: string;
  publishedAt: string | null;
  closedAt: string | null;
};

export type StoredJobSource = {
  id: number;
  companyId: number;
  provider: string;
  boardToken: string;
  evidenceUrl: string;
  status: "verified" | "unverified" | "failing";
  lastFetchedAt: Date | null;
};

export type JobCatalogStore = {
  findCompanyBySlug(slug: string): Promise<{ id: number; slug: string } | null>;
  getSourceForCompany(companyId: number): Promise<StoredJobSource | null>;
  listCatalogJobs(companyId: number): Promise<StoredCatalogJob[]>;
  createJobSource(input: { companyId: number; provider: string; boardToken: string; evidenceUrl: string }): Promise<{ id: number; status: "unverified" }>;
};

export type JobCatalogRouteDeps = {
  enabled?: boolean;
  resolveIdentity: (req: Request) => Promise<{ account: { id: number; role?: "user" | "admin" } } | null | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number }) => Promise<void>;
  store: JobCatalogStore;
  maybeRefresh: (source: CatalogSourceRow) => void;
  now?: () => Date;
};

const STALE_AFTER_MS = 60 * 60 * 1000; // fetch on open when older than 1 hour
const REFRESH_CACHE_MS = 60 * 1000; // at most one refresh trigger per minute

const createSourceBodySchema = z
  .object({
    companySlug: z.string().min(1).max(48),
    provider: jobCatalogProviderSchema,
    boardToken: z.string().min(1).max(120),
    evidenceUrl: z.string().url().max(2048),
  })
  .strict();

const EMPTY_FACETS = { locations: {}, levels: {}, functions: {} };

export function registerJobCatalogRoutes(app: Express, deps: JobCatalogRouteDeps) {
  const enabled = deps.enabled ?? JOB_CATALOG_ENABLED;
  const now = deps.now ?? (() => new Date());
  const lastRefreshAt = new Map<number, number>();

  app.get("/api/companies/:slug/jobs", async (req, res) => {
    const unavailable = { jobs: [], facets: EMPTY_FACETS, source: null, syncedAt: null, completeness: "unavailable" as const };
    if (!enabled) {
      res.set("Cache-Control", "public, max-age=60");
      return res.json(unavailable);
    }
    try {
      const company = await deps.store.findCompanyBySlug(String(req.params.slug).slice(0, 48));
      if (!company) return res.status(404).json({ error: "Unknown company" });
      const source = await deps.store.getSourceForCompany(company.id);
      if (!source || source.status === "unverified") {
        res.set("Cache-Control", "public, max-age=60");
        return res.json(unavailable);
      }
      // Fetch on open: a source stale for over an hour refreshes, at most one
      // trigger per minute.
      const fetchedAt = source.lastFetchedAt?.getTime() ?? 0;
      if (now().getTime() - fetchedAt > STALE_AFTER_MS) {
        const last = lastRefreshAt.get(source.id) ?? 0;
        if (now().getTime() - last > REFRESH_CACHE_MS) {
          lastRefreshAt.set(source.id, now().getTime());
          deps.maybeRefresh({ id: source.id, companyId: source.companyId, provider: source.provider, boardToken: source.boardToken, status: source.status });
        }
      }
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().slice(0, 120) : "";
      const location = typeof req.query.location === "string" ? req.query.location.trim().toLowerCase().slice(0, 120) : "";
      const levelParam = typeof req.query.level === "string" ? Number(req.query.level) : NaN;
      const fn = typeof req.query.function === "string" ? req.query.function.trim().toLowerCase().slice(0, 60) : "";
      const offset = typeof req.query.cursor === "string" && /^\d+$/.test(req.query.cursor) ? Number(req.query.cursor) : 0;

      const open = (await deps.store.listCatalogJobs(company.id)).filter((job) => !job.closedAt);
      const queried = q ? open.filter((job) => job.title.toLowerCase().includes(q) || job.snippet.toLowerCase().includes(q)) : open;
      const filtered = queried.filter(
        (job) =>
          (!location || job.locations.some((l) => l.toLowerCase() === location)) &&
          (!Number.isInteger(levelParam) || job.level === levelParam) &&
          (!fn || (job.jobFunction ?? "").toLowerCase() === fn)
      );
      const facets = { locations: {} as Record<string, number>, levels: {} as Record<string, number>, functions: {} as Record<string, number> };
      for (const job of queried) {
        for (const l of job.locations) facets.locations[l] = (facets.locations[l] ?? 0) + 1;
        facets.levels[String(job.level)] = (facets.levels[String(job.level)] ?? 0) + 1;
        if (job.jobFunction) facets.functions[job.jobFunction] = (facets.functions[job.jobFunction] ?? 0) + 1;
      }
      const page = filtered.slice(offset, offset + JOB_CATALOG_PAGE_SIZE);
      const nextCursor = offset + JOB_CATALOG_PAGE_SIZE < filtered.length ? String(offset + JOB_CATALOG_PAGE_SIZE) : null;
      const body = {
        jobs: page.map(({ id: _id, closedAt: _c, ...job }) => job),
        nextCursor,
        facets,
        source: { companyId: source.companyId, provider: source.provider, boardToken: source.boardToken, evidenceUrl: source.evidenceUrl, status: source.status },
        syncedAt: source.lastFetchedAt ? source.lastFetchedAt.toISOString() : null,
        completeness: (source.status === "verified" ? "complete" : "partial") as "complete" | "partial",
      };
      companyJobsResponseSchema.parse(body);
      res.set("Cache-Control", "public, max-age=60");
      res.json(body);
    } catch (error) {
      captureServerError(error, { route: "/api/companies/:slug/jobs" });
      res.status(500).json({ error: "We could not load the job catalog right now" });
    }
  });

  app.post("/api/admin/job-sources", async (req: Request, res: ExpressResponse) => {
    const identity = await deps.resolveIdentity(req);
    if (!identity) return res.status(401).json({ error: "Sign in required" });
    if (identity.account.role !== "admin") {
      void deps.recordActivity?.({ actorUserId: identity.account.id, action: "job_source.create_denied", outcome: "denied" }).catch(() => undefined);
      return res.status(403).json({ error: "Admin only" });
    }
    const parsed = createSourceBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid job source" });
    const company = await deps.store.findCompanyBySlug(parsed.data.companySlug);
    if (!company) return res.status(404).json({ error: "Unknown company" });
    const source = await deps.store.createJobSource({ companyId: company.id, provider: parsed.data.provider, boardToken: parsed.data.boardToken, evidenceUrl: parsed.data.evidenceUrl });
    void deps.recordActivity?.({ actorUserId: identity.account.id, action: "job_source.created", outcome: "success", resourceType: "company_job_source", resourceId: source.id }).catch(() => undefined);
    res.status(201).json({ source });
  });
}

/** Default store: drizzle over the 0120 tables. */
export async function createDrizzleJobCatalogStore(): Promise<JobCatalogStore> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  return {
    async findCompanyBySlug(slug) {
      const rows = await db.select({ id: companies.id, slug: companies.slug }).from(companies).where(eq(companies.slug, slug)).limit(1);
      return rows[0] ?? null;
    },
    async getSourceForCompany(companyId) {
      const rows = await db.select().from(companyJobSources).where(eq(companyJobSources.companyId, companyId)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return { id: row.id, companyId: row.companyId, provider: row.provider, boardToken: row.boardToken, evidenceUrl: row.evidenceUrl, status: row.status, lastFetchedAt: row.lastFetchedAt };
    },
    async listCatalogJobs(companyId) {
      const rows = await db.select().from(catalogJobs).where(eq(catalogJobs.companyId, companyId));
      return rows.map((row) => ({
        id: row.id,
        companyId: row.companyId,
        sourceId: row.sourceId,
        externalId: row.externalId,
        title: row.title,
        rawLocation: row.rawLocation,
        locations: JSON.parse(row.locations) as string[],
        workMode: row.workMode,
        department: row.department,
        jobFunction: row.jobFunction,
        level: row.level,
        applyUrl: row.applyUrl,
        snippet: row.snippet,
        publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
        closedAt: row.closedAt ? row.closedAt.toISOString() : null,
      }));
    },
    async createJobSource(input) {
      const result = await db.insert(companyJobSources).values({ ...input, status: "unverified" });
      const id = Number((result as Array<{ insertId?: number }>)[0]?.insertId ?? 0);
      return { id, status: "unverified" };
    },
  };
}

/** Default refresher: run one source through the sync pipeline, errors swallowed. */
export function createJobCatalogRefresher(): (source: CatalogSourceRow) => void {
  return (source) => {
    void (async () => {
      const store = await createDrizzleCatalogSyncStore();
      await syncOneSource(source, store, new Date());
    })().catch((error) => captureServerError(error, { lane: "job-catalog-refresh", sourceId: source.id }));
  };
}

/** Production wiring: drizzle-backed store + refresher behind one call, so
 *  server/_core/index.ts registers the catalog with a single line (switch
 *  only). */
export function registerJobCatalogRoutesWithDrizzle(
  app: Express,
  deps: { resolveIdentity: JobCatalogRouteDeps["resolveIdentity"]; recordActivity?: JobCatalogRouteDeps["recordActivity"] }
) {
  let storePromise: Promise<JobCatalogStore> | null = null;
  const store = () => (storePromise ??= createDrizzleJobCatalogStore());
  registerJobCatalogRoutes(app, {
    resolveIdentity: deps.resolveIdentity,
    recordActivity: deps.recordActivity,
    store: {
      findCompanyBySlug: async (slug) => (await store()).findCompanyBySlug(slug),
      getSourceForCompany: async (companyId) => (await store()).getSourceForCompany(companyId),
      listCatalogJobs: async (companyId) => (await store()).listCatalogJobs(companyId),
      createJobSource: async (input) => (await store()).createJobSource(input),
    },
    maybeRefresh: createJobCatalogRefresher(),
  });
}
