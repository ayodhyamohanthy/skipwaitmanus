// SEARCH-job-sources (D-394): the reviewed public careers boards of the listed companies.
//
// Each entry is a company's own public board on a provider the catalog sync reads (Greenhouse, Ashby, Lever),
// with the page that proves the board is the company's. Researched Nov 24 2026: 14 of the 39 listed companies
// have such a board; the other 25 use Workday, SuccessFactors, Taleo, SmartRecruiters, Avature, Jobvite, Keka,
// RippleHire, Oleeo, Radancy or their own portals and are recorded as not covered in
// docs/plans/SEARCH-job-sources.md, never shown as an empty list called complete.
//
// `verified: false` keeps an entry out of the sync until a person confirms it (the sync reads only verified
// and failing sources): Coinbase's careers site refused automated reads, so its evidence is a search-indexed
// posting plus the board linking back to coinbase.com.
import { z } from "zod";
import { jobCatalogProviderSchema } from "./jobCatalog";

export const jobSourceEvidenceSchema = z.enum(["direct-link", "job-id-match", "title-match", "needs-review"]);

export const jobSourceSeedEntrySchema = z.object({
  companySlug: z.string().min(1).max(48),
  provider: jobCatalogProviderSchema,
  boardToken: z.string().min(1).max(120),
  evidenceUrl: z.string().url().startsWith("https://"),
  evidence: jobSourceEvidenceSchema,
  verified: z.boolean(),
}).strict();
export type JobSourceSeedEntry = z.infer<typeof jobSourceSeedEntrySchema>;

export const JOB_SOURCE_SEED: readonly JobSourceSeedEntry[] = [
  { companySlug: "discord", provider: "greenhouse", boardToken: "discord", evidenceUrl: "https://discord.com/careers", evidence: "direct-link", verified: true },
  { companySlug: "mongodb", provider: "greenhouse", boardToken: "mongodb", evidenceUrl: "https://www.mongodb.com/company/careers/see-jobs", evidence: "direct-link", verified: true },
  { companySlug: "openai", provider: "ashby", boardToken: "openai", evidenceUrl: "https://openai.com/careers/search/", evidence: "direct-link", verified: true },
  { companySlug: "1password", provider: "ashby", boardToken: "1password", evidenceUrl: "https://1password.com/careers", evidence: "direct-link", verified: true },
  { companySlug: "kraken", provider: "ashby", boardToken: "kraken.com", evidenceUrl: "https://www.kraken.com/careers", evidence: "direct-link", verified: true },
  { companySlug: "snowflake", provider: "ashby", boardToken: "snowflake", evidenceUrl: "https://careers.snowflake.com/us/en/search-results", evidence: "direct-link", verified: true },
  { companySlug: "stripe", provider: "greenhouse", boardToken: "stripe", evidenceUrl: "https://stripe.com/jobs/search", evidence: "job-id-match", verified: true },
  { companySlug: "gemini", provider: "greenhouse", boardToken: "gemini", evidenceUrl: "https://www.gemini.com/careers", evidence: "job-id-match", verified: true },
  { companySlug: "sofi", provider: "greenhouse", boardToken: "sofi", evidenceUrl: "https://www.sofi.com/careers/", evidence: "job-id-match", verified: true },
  { companySlug: "nintendo", provider: "greenhouse", boardToken: "nintendo", evidenceUrl: "https://careers.nintendo.com/jobs/", evidence: "job-id-match", verified: true },
  { companySlug: "capco", provider: "greenhouse", boardToken: "capco", evidenceUrl: "https://www.capco.com/Careers/Job-Search", evidence: "job-id-match", verified: true },
  { companySlug: "pinterest", provider: "greenhouse", boardToken: "pinterest", evidenceUrl: "https://www.pinterestcareers.com/departments/engineering/", evidence: "job-id-match", verified: true },
  { companySlug: "upstart", provider: "greenhouse", boardToken: "upstart", evidenceUrl: "https://careers.upstart.com/jobs/search", evidence: "title-match", verified: true },
  { companySlug: "coinbase", provider: "greenhouse", boardToken: "coinbase", evidenceUrl: "https://www.coinbase.com/careers/positions/8289787", evidence: "needs-review", verified: false },
];
