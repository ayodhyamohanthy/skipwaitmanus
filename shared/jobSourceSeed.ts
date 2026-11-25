// Verified job source seed (SEARCH-job-sources / D-394).
// Public Greenhouse, Ashby, and Lever boards for listed and discovered companies,
// each verified against the company's official careers evidence page.
// Free, public, documented endpoints only (D-031, D-170, D-175, D-394).
// Uncovered companies (e.g. Workday, SuccessFactors, Taleo, custom ATS) are
// recorded as not covered in the packet, never faked or left empty.

import { z } from "zod";
import { jobCatalogProviderSchema } from "./jobCatalog";

export const jobSourceSeedSchema = z
  .object({
    companySlug: z.string().min(1).max(48),
    provider: jobCatalogProviderSchema,
    boardToken: z.string().min(1).max(120),
    evidenceUrl: z.string().url().max(2048),
    verifiedAt: z.string().datetime(),
    status: z.literal("verified"),
  })
  .strict();

export type JobSourceSeed = z.infer<typeof jobSourceSeedSchema>;

const VERIFIED_AT = "2026-11-24T00:00:00.000Z";

export const JOB_SOURCE_SEED: readonly JobSourceSeed[] = [
  // Listed directory companies (shared/companyDirectoryExpansionSeed.ts)
  {
    companySlug: "stripe",
    provider: "greenhouse",
    boardToken: "stripe",
    evidenceUrl: "https://stripe.com/jobs",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "openai",
    provider: "ashby",
    boardToken: "openai",
    evidenceUrl: "https://openai.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "coinbase",
    provider: "greenhouse",
    boardToken: "coinbase",
    evidenceUrl: "https://www.coinbase.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "discord",
    provider: "greenhouse",
    boardToken: "discord",
    evidenceUrl: "https://discord.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "mongodb",
    provider: "greenhouse",
    boardToken: "mongodb",
    evidenceUrl: "https://www.mongodb.com/company/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "pinterest",
    provider: "greenhouse",
    boardToken: "pinterest",
    evidenceUrl: "https://www.pinterestcareers.com/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "snowflake",
    provider: "ashby",
    boardToken: "snowflake",
    evidenceUrl: "https://careers.snowflake.com/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "1password",
    provider: "ashby",
    boardToken: "1password",
    evidenceUrl: "https://jobs.1password.com/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "sofi",
    provider: "greenhouse",
    boardToken: "sofi",
    evidenceUrl: "https://www.sofi.com/careers/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "gemini",
    provider: "greenhouse",
    boardToken: "gemini",
    evidenceUrl: "https://www.gemini.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "nintendo",
    provider: "greenhouse",
    boardToken: "nintendo",
    evidenceUrl: "https://careers.nintendo.com/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "upstart",
    provider: "greenhouse",
    boardToken: "upstart",
    evidenceUrl: "https://www.upstart.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },

  // High-demand discovered companies frequently queried by seekers
  {
    companySlug: "figma",
    provider: "greenhouse",
    boardToken: "figma",
    evidenceUrl: "https://www.figma.com/careers/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "notion",
    provider: "ashby",
    boardToken: "notion",
    evidenceUrl: "https://www.notion.so/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "airbnb",
    provider: "greenhouse",
    boardToken: "airbnb",
    evidenceUrl: "https://careers.airbnb.com/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "lyft",
    provider: "greenhouse",
    boardToken: "lyft",
    evidenceUrl: "https://www.lyft.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "datadog",
    provider: "greenhouse",
    boardToken: "datadog",
    evidenceUrl: "https://www.datadoghq.com/careers/",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
  {
    companySlug: "reddit",
    provider: "greenhouse",
    boardToken: "reddit",
    evidenceUrl: "https://www.redditinc.com/careers",
    verifiedAt: VERIFIED_AT,
    status: "verified",
  },
];

const seedBySlug = new Map<string, JobSourceSeed>(
  JOB_SOURCE_SEED.map((s) => [s.companySlug, s])
);

export function getJobSourceForCompany(slug: string): JobSourceSeed | undefined {
  return seedBySlug.get(slug);
}
