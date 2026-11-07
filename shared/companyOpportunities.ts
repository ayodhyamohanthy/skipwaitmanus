// D-022 referrer-posted roles contract (docs/KIT_V4_BUILD_PLAN.md section 3c,
// docs/DECISIONS.md D-022).
//
// A verified employee posts a role for their company for 30 days: "hiring now"
// with a link on the company's own careers site, or a walk-in. The projections
// below are the only shapes clients accept. A public post never carries owner
// ids, emails, last names or any work-email verification evidence; the poster
// appears as anonymous or as the first name they chose to show. When a seeker
// asks from a post, the poster alone sees that ask for the first 24 hours.
import { z } from "zod";

export const OPPORTUNITY_KINDS = ["hiring_now", "walk_in"] as const;
export const opportunityKindSchema = z.enum(OPPORTUNITY_KINDS);
export type OpportunityKind = z.infer<typeof opportunityKindSchema>;

/** A post is live for 30 days; the poster can renew it in one tap. */
export const OPPORTUNITY_TTL_DAYS = 30;
/** An ask written from a post goes to the poster alone for the first 24 hours (owner rule, Oct 25 2026). */
export const OPPORTUNITY_FIRST_LOOK_HOURS = 24;

export const OPPORTUNITY_TTL_MS = OPPORTUNITY_TTL_DAYS * 24 * 60 * 60 * 1000;
export const OPPORTUNITY_FIRST_LOOK_MS = OPPORTUNITY_FIRST_LOOK_HOURS * 60 * 60 * 1000;

/** When a post published or renewed now lapses; every publish/renew path uses this one clock. */
export function opportunityExpiresAtFrom(now: Date): Date {
  return new Date(now.getTime() + OPPORTUNITY_TTL_MS);
}

/** When the first look on an ask written now ends. */
export function firstLookUntilFrom(now: Date): Date {
  return new Date(now.getTime() + OPPORTUNITY_FIRST_LOOK_MS);
}

/**
 * A missing or unparsable expiry never hides a post (pre-0094 rows, schema
 * drift); only a known past date does. Reads must use this, not a raw compare.
 */
export function isOpportunityExpired(expiresAt: Date | string | null | undefined, nowMs: number): boolean {
  if (!expiresAt) return false;
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= nowMs;
}

/** The poster's public face: anonymous, or their chosen first name alone. */
export const opportunityPosterSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("anonymous") }),
  z.object({ kind: z.literal("firstName"), firstName: z.string().trim().min(1).max(80) }),
]);
export type OpportunityPoster = z.infer<typeof opportunityPosterSchema>;

/**
 * What any visitor sees for one post. `targetRoleUrl` is the already-public
 * verified role link carried into "/ask?post=<id>&job=<link>" (null for
 * walk-ins); the walk-in times stay in so a walk-in card reads the same as on
 * the wall.
 */
export const publicOpportunityPostSchema = z.object({
  id: z.number().int().positive(),
  companyDomain: z.string().trim().min(1).max(255),
  kind: opportunityKindSchema,
  roleTitle: z.string().trim().min(1).max(180),
  targetRoleUrl: z.string().trim().min(1).max(2048).nullable(),
  location: z.string().trim().max(180).nullable(),
  compensation: z.string().trim().max(80).nullable(),
  walkInAt: z.iso.datetime().nullable(),
  walkInEndsAt: z.iso.datetime().nullable(),
  postedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  poster: opportunityPosterSchema,
});
export type PublicOpportunityPost = z.infer<typeof publicOpportunityPostSchema>;

export const companyOpportunitiesResponseSchema = z.object({ opportunities: z.array(publicOpportunityPostSchema) });
export type CompanyOpportunitiesResponse = z.infer<typeof companyOpportunitiesResponseSchema>;

/** The poster's own list: the public shape plus the controls' facts. */
export const ownerOpportunityPostSchema = publicOpportunityPostSchema.extend({
  isActive: z.boolean(),
  expired: z.boolean(),
  /** There is something to revive: the post lapsed or the poster closed it. */
  renewable: z.boolean(),
});
export type OwnerOpportunityPost = z.infer<typeof ownerOpportunityPostSchema>;

export const myOpportunitiesResponseSchema = z.object({ opportunities: z.array(ownerOpportunityPostSchema) });
export type MyOpportunitiesResponse = z.infer<typeof myOpportunitiesResponseSchema>;

/** The extra ask-payload field a post selection adds; absent means a plain company ask. */
export const opportunityAskSelectionSchema = z.object({ opportunityId: z.number().int().positive() });
export type OpportunityAskSelection = z.infer<typeof opportunityAskSelectionSchema>;

export type OpportunityAskSearch = { opportunityId: number; jobUrl: string | null };

/**
 * "/ask?post=<id>&job=<link>": the one link a post card's "Ask for a referral"
 * opens. Returns null when there is no usable post id, so the composer behaves
 * exactly like a plain ask instead of guessing.
 */
export function parseOpportunityAskSearch(search: string): OpportunityAskSearch | null {
  const params = new URLSearchParams(search);
  const raw = params.get("post");
  // Digits only: "1e3", "1.5" or "+3" must never silently map to another post.
  if (!raw || !/^\d{1,10}$/.test(raw)) return null;
  const opportunityId = Number(raw);
  if (opportunityId <= 0) return null;
  const jobUrl = params.get("job")?.trim() || null;
  return { opportunityId, jobUrl };
}
