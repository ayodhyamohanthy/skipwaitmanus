import { z } from "zod";
import { ASK_NOTE_MAX_LENGTH } from "./askNote";
import { jobFunctionSchema } from "./jobFunctions";
import { referrerLinkPartSchema } from "./referrerLink";

/**
 * Why an ask that began on a referrer's personal link went to the company
 * instead (D-017). Analytics only: it never changes routing.
 * - refused: the server refused the link (paused, invalid, another company's
 *   job) or /ask was opened with a malformed link, and the seeker chose
 *   "Send to <company> instead";
 * - opted_out: the link was usable and the seeker chose the whole company.
 */
export const REFERRER_LINK_FALLBACKS = ["refused", "opted_out"] as const;
export const referrerLinkFallbackSchema = z.enum(REFERRER_LINK_FALLBACKS);
export type ReferrerLinkFallback = z.infer<typeof referrerLinkFallbackSchema>;

/**
 * POST /api/company-referrals body as the app builds it
 * (client/src/components/ask/askApi.ts buildAskBody). The route keeps its own
 * per-field checks and error copy, which the seeker basics rely on (D-019); it
 * reads referrerLinkFallback through readReferrerLinkFallback below.
 */
export const askSendBodySchema = z.strictObject({
  targetRoleUrl: z.string().min(1).max(2048),
  attachmentIds: z.array(z.number().int().positive()).min(1),
  candidateMessage: z.string().min(1).max(ASK_NOTE_MAX_LENGTH),
  companySlug: z.string().min(1).max(64).optional(),
  compensation: z.string().min(1).max(80).optional(),
  jobFunction: jobFunctionSchema.optional(),
  fastTrackCode: referrerLinkPartSchema.optional(),
  fastTrackCompanySlug: referrerLinkPartSchema.optional(),
  fastTrackAlias: referrerLinkPartSchema.optional(),
  confirmedCompanyDomain: z.string().min(1).max(253).optional(),
  referrerLinkFallback: referrerLinkFallbackSchema.optional(),
})
  .refine(body => !(body.fastTrackCode && (body.fastTrackCompanySlug || body.fastTrackAlias)), { message: "Use one personal link at a time" })
  .refine(body => Boolean(body.fastTrackCompanySlug) === Boolean(body.fastTrackAlias), { message: "A vanity link needs both the company and the alias" })
  .refine(body => !(body.referrerLinkFallback && (body.fastTrackCode || body.fastTrackCompanySlug)), { message: "A send to the company carries no personal link" });

export type AskSendBody = z.infer<typeof askSendBodySchema>;

const fallbackFieldsSchema = z.object({
  referrerLinkFallback: referrerLinkFallbackSchema,
  fastTrackCode: z.undefined(),
  fastTrackCompanySlug: z.undefined(),
  fastTrackAlias: z.undefined(),
});

/** The fallback reason on a send to the company, or null when absent, malformed, or sent with a link. */
export function readReferrerLinkFallback(body: object): ReferrerLinkFallback | null {
  const parsed = fallbackFieldsSchema.safeParse(body);
  return parsed.success ? parsed.data.referrerLinkFallback : null;
}
