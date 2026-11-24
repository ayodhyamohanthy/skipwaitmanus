// Seed loader for company job sources (SEARCH-job-sources / D-394).
// Reads JOB_SOURCE_SEED and inserts verified sources into companyJobSources
// for matching companies that do not already have a registered source.
// Free public endpoints only (D-031, D-170, D-175, D-394).

import { and, eq } from "drizzle-orm";
import { companies, companyJobSources } from "../../drizzle/schema";
import { JOB_SOURCE_SEED, type JobSourceSeed } from "../../shared/jobSourceSeed";
import type { getDb } from "../db";
import { captureServerError } from "../sentry";

export type SeedJobSourcesDb = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export async function seedJobSourcesIfMissing(
  db: SeedJobSourcesDb,
  seed: readonly JobSourceSeed[] = JOB_SOURCE_SEED
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  for (const item of seed) {
    try {
      const matchingCompanies = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.slug, item.companySlug))
        .limit(1);

      const company = matchingCompanies[0];
      if (!company) {
        skipped += 1;
        continue;
      }

      const existing = await db
        .select({ id: companyJobSources.id })
        .from(companyJobSources)
        .where(
          and(
            eq(companyJobSources.companyId, company.id),
            eq(companyJobSources.provider, item.provider),
            eq(companyJobSources.boardToken, item.boardToken)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        skipped += 1;
        continue;
      }

      await db.insert(companyJobSources).values({
        companyId: company.id,
        provider: item.provider,
        boardToken: item.boardToken,
        evidenceUrl: item.evidenceUrl,
        status: "verified",
        verifiedAt: new Date(item.verifiedAt),
      });
      inserted += 1;
    } catch (error) {
      skipped += 1;
      captureServerError(error, {
        lane: "job-sources-seed",
        companySlug: item.companySlug,
        provider: item.provider,
        boardToken: item.boardToken,
      });
    }
  }

  return { inserted, skipped };
}
