// Job catalog contracts (D-174-job-catalog, packet
// docs/plans/D-193-journey-foundations.md section 5.5). Shared between the
// server and tests. The catalog ships behind a switch and starts OFF
// (D-097: a cut ships off until QA turns it on). While the switch is off the
// jobs route answers completeness "unavailable" and the sync job does
// nothing.

import { z } from "zod";

/** Launch switch. QA flips this on after the deployed-unavailable check. */
export const JOB_CATALOG_ENABLED = false;

export const JOB_CATALOG_PAGE_SIZE = 50;

/** Providers this row covers. Greenhouse only; others join as their own rows. */
export const jobCatalogProviderSchema = z.enum(["greenhouse"]);
export type JobCatalogProvider = z.infer<typeof jobCatalogProviderSchema>;

export const jobSourceStatusSchema = z.enum(["verified", "unverified", "failing"]);
export type JobSourceStatus = z.infer<typeof jobSourceStatusSchema>;

export const workModeSchema = z.enum(["onsite", "hybrid", "remote", "unknown"]);
export type WorkMode = z.infer<typeof workModeSchema>;

export const catalogCompletenessSchema = z.enum(["complete", "partial", "unavailable"]);
export type CatalogCompleteness = z.infer<typeof catalogCompletenessSchema>;

/** Job level 1-10 per packet section 4.3 (assignJobLevel). */
export const jobLevelSchema = z.number().int().min(1).max(10);
export type JobLevel = z.infer<typeof jobLevelSchema>;

/** A company's registered job board source. Verification is a human step. */
export const companyJobSourceSchema = z
  .object({
    companyId: z.number().int().positive(),
    provider: jobCatalogProviderSchema,
    boardToken: z.string().min(1).max(120),
    evidenceUrl: z.string().url(),
    status: jobSourceStatusSchema,
  })
  .strict();
export type CompanyJobSource = z.infer<typeof companyJobSourceSchema>;

/** One catalog job row as served by the API. `id` is the stable catalogJobs
 *  handle D-174-ask-from-job takes as `catalogJobId` (D-193 §5.8). */
export const catalogJobSchema = z
  .object({
    id: z.number().int().positive(),
    companyId: z.number().int().positive(),
    sourceId: z.number().int().positive(),
    externalId: z.string().min(1).max(190),
    title: z.string().min(1).max(300),
    rawLocation: z.string().max(300).nullable(),
    locations: z.array(z.string().min(1).max(120)),
    workMode: workModeSchema,
    department: z.string().max(200).nullable(),
    jobFunction: z.string().max(60).nullable(),
    level: jobLevelSchema,
    applyUrl: z.string().url(),
    snippet: z.string().max(400),
    publishedAt: z.string().datetime().nullable(),
  })
  .strict();
export type CatalogJob = z.infer<typeof catalogJobSchema>;

/** Facet counts for the filters the jobs route supports. */
export const catalogFacetsSchema = z
  .object({
    locations: z.record(z.string(), z.number().int().nonnegative()),
    levels: z.record(z.string(), z.number().int().nonnegative()),
    functions: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();
export type CatalogFacets = z.infer<typeof catalogFacetsSchema>;

/** Output of GET /api/companies/:slug/jobs. source is null when unverified;
 *  completeness carries the honesty rules (D-175): an unverified source is
 *  never "complete". */
export const companyJobsResponseSchema = z
  .object({
    jobs: z.array(catalogJobSchema).max(JOB_CATALOG_PAGE_SIZE),
    nextCursor: z.string().nullable().optional(),
    facets: catalogFacetsSchema,
    source: companyJobSourceSchema.nullable(),
    syncedAt: z.string().datetime().nullable(),
    completeness: catalogCompletenessSchema,
  })
  .strict();
export type CompanyJobsResponse = z.infer<typeof companyJobsResponseSchema>;
