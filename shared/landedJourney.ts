// Kit landed journey + private thank-you wall (docs/KIT_V4_BUILD_PLAN.md §3b row
// 20 slices C/D). One contract for the seeker's write and the referrer's read, so
// a malformed payload is a shown error rather than a fabricated note on a wall.
import { z } from "zod";

/** The two pay-it-forward answers the kit offers. Nothing here sends anything. */
export const PAY_FORWARD_CHOICES = ["yes", "later"] as const;
export type PayForwardChoice = (typeof PAY_FORWARD_CHOICES)[number];

/** The kit textarea caps at 600 characters; the server trims to the same bound. */
export const THANK_YOU_MAX_LENGTH = 600;

/**
 * POST /api/landed/journey. Every field except the request id is optional because
 * the seeker moves through the journey in two steps: the note when they thank, the
 * pay-it-forward answer afterwards. Sending nothing to record is a 400, not a no-op.
 */
export const landedJourneyRequestSchema = z
  .object({
    referralRequestId: z.number().int().positive(),
    message: z.string().trim().min(1).max(THANK_YOU_MAX_LENGTH).optional(),
    shareOnWall: z.boolean().optional(),
    payForward: z.enum(PAY_FORWARD_CHOICES).optional(),
  })
  .refine(value => value.message !== undefined || value.shareOnWall !== undefined || value.payForward !== undefined, {
    message: "Record a thank-you or a pay-it-forward choice",
  });
export type LandedJourneyRequest = z.infer<typeof landedJourneyRequestSchema>;

/** The row state returned to the seeker after every accepted write. */
export const landedJourneyStateSchema = z.object({
  referralRequestId: z.number().int().positive(),
  thankYouMessage: z.string().nullish().transform(value => value ?? null),
  shareOnWall: z.boolean(),
  payForward: z.enum(PAY_FORWARD_CHOICES).nullish().transform(value => value ?? null),
  /** False only when the note was recorded but has not reached the conversation. */
  delivered: z.boolean(),
});
export type LandedJourneyState = z.infer<typeof landedJourneyStateSchema>;

/**
 * One shared note on a referrer's private wall. The name and role are the ones that
 * referrer already saw on the ask they worked; nothing here is public.
 */
export const referrerThankYouWallItemSchema = z.object({
  id: z.number().int().positive(),
  message: z.string(),
  seekerName: z.string().nullish().transform(value => value ?? null),
  roleTitle: z.string().nullish().transform(value => value ?? null),
  createdAt: z.string(),
});
export type ReferrerThankYouWallItem = z.infer<typeof referrerThankYouWallItemSchema>;

export const referrerThankYouWallSchema = z.object({
  /** Notes the seekers let this referrer keep, newest first. */
  thankYous: z.array(referrerThankYouWallItemSchema),
  /** Thank-yous this referrer received, shared to the wall or not. */
  total: z.number().int().nonnegative(),
});
export type ReferrerThankYouWall = z.infer<typeof referrerThankYouWallSchema>;
