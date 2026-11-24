// SEARCH-universal (D-394): one search box takes a job title, a job link, a
// company name or a company website and answers with careers job links,
// referrer presence, "Apply on the careers site" and "Ask for a referral".
// These contracts are shared by GET /api/search and every client reader;
// nothing else defines these shapes.
//
// Presence is the one referrer fact a public answer may carry (D-360 (5),
// D-363): whether any verified referrer has joined at the company. It is never
// a count, an id or a name, and it is never availability (D-176).
import { z } from "zod";
import { discoveredCompanySchema, publicCompanySchema } from "./companies";

/** The route's length cap: longer input is refused, never truncated. */
export const SEARCH_QUERY_MAX = 200;
/** At most this many companies in one answer (the typeahead's own limit). */
export const SEARCH_COMPANY_LIMIT = 10;
/** At most this many catalog jobs in one answer. */
export const SEARCH_JOB_LIMIT = 20;
/** One client's requests per minute; a person typing stays far below it. */
export const SEARCH_RATE_LIMIT = 60;

/** One `q`, no other keys; the route refuses anything else. */
export const searchQuerySchema = z.strictObject({ q: z.string().trim().min(1).max(SEARCH_QUERY_MAX) });

/** What the server decided the input is. */
export const searchInputKindSchema = z.enum(["job-link", "company-website", "company-name", "job-title"]);
export type SearchInputKind = z.infer<typeof searchInputKindSchema>;

/** One directory company in a search answer: the public shape plus the one presence fact. */
export const searchCompanyHitSchema = publicCompanySchema
  .omit({ openToReferrals: true })
  .extend({ referrerPresence: z.enum(["present", "none"]) })
  .strict();
export type SearchCompanyHit = z.infer<typeof searchCompanyHitSchema>;

/** One open catalog job: the careers-site link, its company and the same presence fact. */
export const searchJobHitSchema = z
  .object({
    id: z.number().int().positive(),
    companySlug: z.string().min(1).max(48),
    companyName: z.string().min(1).max(160),
    title: z.string().min(1).max(300),
    locations: z.array(z.string().min(1).max(120)).max(20),
    applyUrl: z.string().url(),
    publishedAt: z.string().datetime().nullable(),
    level: z.number().int().min(1).max(10),
    referrerPresence: z.enum(["present", "none"]),
  })
  .strict();
export type SearchJobHit = z.infer<typeof searchJobHitSchema>;

/** A posting URL the preview resolved: the company (when the directory holds it) and the role. */
export const searchJobLinkSchema = z
  .object({
    url: z.string().url(),
    companySlug: z.string().min(1).max(48).nullable(),
    companyName: z.string().min(1).max(160).nullable(),
    roleTitle: z.string().min(1).max(300).nullable(),
    employerConfidence: z.enum(["verified", "direct-domain", "ambiguous", "unreachable"]),
    status: z.enum(["fresh", "unreachable"]),
  })
  .strict();
export type SearchJobLink = z.infer<typeof searchJobLinkSchema>;

export const searchResponseSchema = z
  .object({
    kind: searchInputKindSchema,
    query: z.string().min(1).max(SEARCH_QUERY_MAX),
    companies: z.array(searchCompanyHitSchema).max(SEARCH_COMPANY_LIMIT),
    /** Worldwide candidates the directory does not hold (deduped by domain). */
    discovered: z.array(discoveredCompanySchema).max(SEARCH_COMPANY_LIMIT),
    /** Present whenever discovery ran: "degraded" means the discovery portion is incomplete. */
    discoveryState: z.enum(["ok", "degraded"]).optional(),
    jobLink: searchJobLinkSchema.nullable(),
    jobs: z.array(searchJobHitSchema).max(SEARCH_JOB_LIMIT),
    /** "unavailable" when no job source is live: an empty jobs list then says nothing about the query. */
    catalogState: z.enum(["ok", "unavailable"]),
  })
  .strict();
export type SearchResponse = z.infer<typeof searchResponseSchema>;
