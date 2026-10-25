// Catalog refresh (D-174-job-catalog, packet section 5.5). Upserts a
// successful full fetch on (sourceId, externalId): a job missing from it gets
// closedAt. A failed fetch changes no job and marks a verified source
// failing; an unverified source stays unverified (a 404 board never reads as
// "0 jobs"). While JOB_CATALOG_ENABLED is false the job does nothing (D-097).
//
// The store operations are injectable so the refresh semantics are testable
// without a database; the drizzle wiring lives at the bottom of the file.

import { and, eq, isNull, ne } from "drizzle-orm";
import { JOB_CATALOG_ENABLED } from "../../shared/jobCatalog";
import { assignJobLevel } from "../../shared/jobLevel";
import { classifyJobFunction } from "../../shared/jobFunctionClassifier";
import { catalogJobs, companyJobSources } from "../../drizzle/schema";
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

export type CatalogSyncStore = {
  loadSources(): Promise<CatalogSourceRow[]>;
  upsertJobs(jobs: CatalogJobUpsert[], now: Date): Promise<void>;
  closeMissing(sourceId: number, seenExternalIds: string[], now: Date): Promise<number>;
  markFetchOk(sourceId: number, count: number, now: Date): Promise<void>;
  markFetchFailed(source: CatalogSourceRow): Promise<void>;
};

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
  await store.markFetchOk(source.id, upserts.length, now);
  return { ok: true, closed, count: upserts.length };
}

export function createJobCatalogSync(store?: CatalogSyncStore) {
  return async (context: JobRunContext): Promise<JobRunOutput> => {
    if (!JOB_CATALOG_ENABLED) return { processed: 0, failed: 0, skipped: "flag_off" };
    const resolved = store ?? (await createDrizzleCatalogSyncStore());
    const now = new Date(context.nowMs);
    const sources = await resolved.loadSources();
    let processed = 0;
    let failed = 0;
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
    return { processed, failed };
  };
}

export async function createDrizzleCatalogSyncStore(): Promise<CatalogSyncStore> {
  const db = await getDb();
  if (!db) throw new Error("database unavailable");
  return {
    async loadSources() {
      const rows = await db
        .select({
          id: companyJobSources.id,
          companyId: companyJobSources.companyId,
          provider: companyJobSources.provider,
          boardToken: companyJobSources.boardToken,
          status: companyJobSources.status,
        })
        // The daily batch fetches verified boards only (scheduledJobRegistry);
        // a just-created unverified source still gets its one-shot probe via
        // the refresher, pinned by "a 404 on an unverified board".
        .from(companyJobSources)
        .where(eq(companyJobSources.status, "verified"));
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
    async markFetchOk(sourceId, count, now) {
      await db
        .update(companyJobSources)
        .set({ lastFetchedAt: now, lastCount: count })
        .where(eq(companyJobSources.id, sourceId));
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
