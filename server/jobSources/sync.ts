// Catalog refresh (D-174-job-catalog, packet section 5.5). Upserts a
// successful full fetch on (sourceId, externalId): a job missing from it gets
// closedAt. A failed fetch changes no job and marks a verified source
// failing; an unverified source stays unverified (a 404 board never reads as
// "0 jobs"). While JOB_CATALOG_ENABLED is false the job does nothing (D-097).
//
// The store operations are injectable so the refresh semantics are testable
// without a database; the drizzle wiring lives at the bottom of the file.
//
// SEARCH-job-sources (D-394): each run first ensures the reviewed boards in
// shared/jobSourceSeed.ts exist. It inserts a missing board with its seeded
// status and never changes a board that is already there, so a person's later
// verdict (or a failing status) always stands. A seeding failure fails the run
// visibly but never stops the boards already present from being fetched.

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { JOB_CATALOG_ENABLED } from "../../shared/jobCatalog";
import { JOB_SOURCE_SEED, type JobSourceSeedEntry } from "../../shared/jobSourceSeed";
import { assignJobLevel } from "../../shared/jobLevel";
import { classifyJobFunction } from "../../shared/jobFunctionClassifier";
import { catalogJobs, companies, companyJobSources } from "../../drizzle/schema";
import { getDb } from "../db";
import { captureServerError } from "../sentry";
import type { JobRunContext, JobRunOutput } from "../scheduledJobRunner";
import { fetchJobBoard, type NormalizedCatalogJob } from "./greenhouse";

export type CatalogSourceRow = {
  id: number;
  companyId: number;
  provider: string;
  boardToken: string;
  status: "verified" | "unverified" | "failing";
};

export type CatalogJobUpsert = {
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
};

export type SeedSourcesResult = { inserted: number; missingCompanies: string[] };

export type CatalogSyncStore = {
  /** Inserts each seeded board that is not there yet; never updates an existing one. */
  ensureSeedSources?(seed: readonly JobSourceSeedEntry[], now: Date): Promise<SeedSourcesResult>;
  loadSources(): Promise<CatalogSourceRow[]>;
  upsertJobs(jobs: CatalogJobUpsert[], now: Date): Promise<void>;
  closeMissing(sourceId: number, seenExternalIds: string[], now: Date): Promise<number>;
  markFetchOk(source: CatalogSourceRow, count: number, now: Date): Promise<void>;
  markFetchFailed(source: CatalogSourceRow): Promise<void>;
};

/** A board that failed once is retried by the daily batch until it answers
 *  again; an unverified one waits for a human (review F3). */
export const SYNCABLE_SOURCE_STATUSES = ["verified", "failing"] as const;

export function statusAfterSuccessfulFetch(status: CatalogSourceRow["status"]): CatalogSourceRow["status"] {
  return status === "failing" ? "verified" : status;
}

export function toUpsert(source: CatalogSourceRow, job: NormalizedCatalogJob): CatalogJobUpsert {
  const level = assignJobLevel({ title: job.title, description: job.snippet, url: job.applyUrl });
  return {
    companyId: source.companyId,
    sourceId: source.id,
    externalId: job.externalId,
    title: job.title,
    rawLocation: job.rawLocation,
    locations: job.locations,
    workMode: job.workMode,
    department: job.department,
    jobFunction: classifyJobFunction(`${job.title} ${job.department ?? ""}`),
    level: level.level,
    applyUrl: job.applyUrl,
    snippet: job.snippet,
    publishedAt: job.publishedAt,
  };
}

export async function syncOneSource(
  source: CatalogSourceRow,
  store: CatalogSyncStore,
  now: Date,
  fetchImpl?: Parameters<typeof fetchJobBoard>[1] extends { fetchImpl?: infer F } ? F : never
): Promise<{ ok: boolean; closed: number; count: number }> {
  const result = await fetchJobBoard(source, { fetchImpl });
  if (!result.ok) {
    await store.markFetchFailed(source);
    return { ok: false, closed: 0, count: 0 };
  }
  const upserts = result.jobs.map((job) => toUpsert(source, job));
  await store.upsertJobs(upserts, now);
  const closed = await store.closeMissing(source.id, upserts.map((j) => j.externalId), now);
  await store.markFetchOk(source, upserts.length, now);
  return { ok: true, closed, count: upserts.length };
}

export function createJobCatalogSync(store?: CatalogSyncStore) {
  return async (context: JobRunContext): Promise<JobRunOutput> => {
    if (!JOB_CATALOG_ENABLED) return { processed: 0, failed: 0, skipped: "flag_off" };
    const resolved = store ?? (await createDrizzleCatalogSyncStore());
    const now = new Date(context.nowMs);
    let processed = 0;
    let failed = 0;
    let firstError: unknown;
    if (resolved.ensureSeedSources) {
      try {
        const seeded = await resolved.ensureSeedSources(JOB_SOURCE_SEED, now);
        // A seeded company missing from the directory is a data drift to fix, not a reason to stop fetching.
        if (seeded.missingCompanies.length) captureServerError(new Error(`job source seed: companies not in the directory: ${seeded.missingCompanies.join(", ")}`), { lane: "job-catalog-sync" });
      } catch (error) {
        failed += 1;
        firstError = error;
      }
    }
    const sources = await resolved.loadSources();
    for (const source of sources) {
      try {
        const outcome = await syncOneSource(source, resolved, now);
        processed += 1;
        if (!outcome.ok) failed += 1;
      } catch (error) {
        failed += 1;
        captureServerError(error, { lane: "job-catalog-sync", sourceId: source.id, provider: source.provider });
      }
    }
    return firstError === undefined ? { processed, failed } : { processed, failed, firstError };
  };
}

export async function createDrizzleCatalogSyncStore(): Promise<CatalogSyncStore> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  return {
    async ensureSeedSources(seed, now) {
      if (!seed.length) return { inserted: 0, missingCompanies: [] };
      const companyRows = await db
        .select({ id: companies.id, slug: companies.slug })
        .from(companies)
        .where(inArray(companies.slug, Array.from(new Set(seed.map((entry) => entry.companySlug)))));
      const companyIdBySlug = new Map(companyRows.map((row) => [row.slug, row.id]));
      const existing = await db
        .select({ provider: companyJobSources.provider, boardToken: companyJobSources.boardToken })
        .from(companyJobSources)
        .where(inArray(companyJobSources.boardToken, seed.map((entry) => entry.boardToken)));
      const present = new Set(existing.map((row) => `${row.provider}:${row.boardToken}`));
      const missingCompanies: string[] = [];
      let inserted = 0;
      for (const entry of seed) {
        const companyId = companyIdBySlug.get(entry.companySlug);
        if (companyId === undefined) { missingCompanies.push(entry.companySlug); continue; }
        if (present.has(`${entry.provider}:${entry.boardToken}`)) continue;
        await db
          .insert(companyJobSources)
          .values({
            companyId,
            provider: entry.provider,
            boardToken: entry.boardToken,
            evidenceUrl: entry.evidenceUrl,
            status: entry.verified ? "verified" : "unverified",
            verifiedAt: entry.verified ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          // A concurrent run inserted it first: keep that row exactly as it is.
          .onDuplicateKeyUpdate({ set: { id: sql`${companyJobSources.id}` } });
        inserted += 1;
      }
      return { inserted, missingCompanies };
    },
    async loadSources() {
      const rows = await db
        .select({
          id: companyJobSources.id,
          companyId: companyJobSources.companyId,
          provider: companyJobSources.provider,
          boardToken: companyJobSources.boardToken,
          status: companyJobSources.status,
        })
        // The daily batch fetches verified boards plus ones that failed once,
        // so a single timeout is not permanent; an unverified source still
        // waits for a human (a 404 board never reads as "0 jobs").
        .from(companyJobSources)
        .where(inArray(companyJobSources.status, [...SYNCABLE_SOURCE_STATUSES]));
      return rows;
    },
    async upsertJobs(jobs, now) {
      for (const job of jobs) {
        await db
          .insert(catalogJobs)
          .values({
            ...job,
            locations: JSON.stringify(job.locations),
            publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
            level: job.level,
            lastSeenAt: now,
          })
          .onDuplicateKeyUpdate({
            set: {
              title: job.title,
              rawLocation: job.rawLocation,
              locations: JSON.stringify(job.locations),
              workMode: job.workMode,
              department: job.department,
              jobFunction: job.jobFunction,
              level: job.level,
              applyUrl: job.applyUrl,
              snippet: job.snippet,
              publishedAt: job.publishedAt ? new Date(job.publishedAt) : null,
              lastSeenAt: now,
              closedAt: null,
            },
          });
      }
    },
    async closeMissing(sourceId, seenExternalIds, now) {
      const open = await db
        .select({ id: catalogJobs.id, externalId: catalogJobs.externalId })
        .from(catalogJobs)
        .where(and(eq(catalogJobs.sourceId, sourceId), isNull(catalogJobs.closedAt)));
      const seen = new Set(seenExternalIds);
      const toClose = open.filter((row) => !seen.has(row.externalId)).map((row) => row.id);
      for (const id of toClose) {
        await db.update(catalogJobs).set({ closedAt: now }).where(eq(catalogJobs.id, id));
      }
      return toClose.length;
    },
    async markFetchOk(source, count, now) {
      await db
        .update(companyJobSources)
        .set({ lastFetchedAt: now, lastCount: count })
        .where(eq(companyJobSources.id, source.id));
      // Restore a source that failed once, but never promote an unverified
      // one (review F3).
      const restored = statusAfterSuccessfulFetch(source.status);
      if (restored !== source.status) {
        await db
          .update(companyJobSources)
          .set({ status: restored })
          .where(and(eq(companyJobSources.id, source.id), eq(companyJobSources.status, source.status)));
      }
    },
    async markFetchFailed(source) {
      // A failed fetch changes no job. A verified source degrades to failing;
      // an unverified one stays unverified so a 404 board never reads as
      // "0 jobs".
      if (source.status === "verified") {
        await db
          .update(companyJobSources)
          .set({ status: "failing" })
          .where(and(eq(companyJobSources.id, source.id), ne(companyJobSources.status, "failing")));
      }
    },
  };
}
