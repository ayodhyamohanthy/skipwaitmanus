// Direct-message send gate contract shared by server/dmRoutes.ts and
// client/src/pages/Messages.tsx (owner decision D-012 item 3).
//
// When either party is a verified referrer, a direct message can be sent only
// after a referral request links the two people and that request's referrer
// accepted it. No plan, follow or earlier thread opens it sooner. Messaging
// between two members who are not verified referrers opens with an existing
// thread or a mutual follow; no plan opens it (D-067 removed the paid-plan perk).
import { z } from "zod";

export const DM_REFERRER_ACCEPTANCE_REASON = "referrer_acceptance_required" as const;

/** Shown to a member writing to a verified referrer before acceptance. */
export const DM_REFERRER_ACCEPTANCE_ERROR = "Messages with a referrer open after they accept your request.";

/** Shown to a verified referrer writing to a member before they accept that member's request. */
export const DM_REFERRER_ACCEPTANCE_SENDER_IS_REFERRER_ERROR = "You can message this member after you accept their referral request.";

export const DM_FOLLOW_REQUIRED_REASON = "mutual_follow_required" as const;

/**
 * Shown to a member starting a chat with another member (neither a verified
 * referrer) when they have no thread yet and do not follow each other. No plan
 * changes this (D-067), so it never mentions one.
 */
export const DM_FOLLOW_REQUIRED_ERROR = "You can message this member once you follow each other.";

/** The 403 body for the member rule, distinct from the referrer block by its reason. */
export const dmFollowRequiredSchema = z.object({
  reason: z.literal(DM_FOLLOW_REQUIRED_REASON),
  error: z.string().min(1).max(300),
});
export type DmFollowRequired = z.infer<typeof dmFollowRequiredSchema>;

export const DM_FOLLOW_REQUIRED: DmFollowRequired = { reason: DM_FOLLOW_REQUIRED_REASON, error: DM_FOLLOW_REQUIRED_ERROR };

/** Lenient client-side read: anything that is not a well-formed member refusal means "not this refusal". */
export function parseDmFollowRequired(value: unknown): DmFollowRequired | null {
  const parsed = dmFollowRequiredSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * The gate outcome for one sender -> recipient pair.
 * - not_referrer_pair: neither person is a verified referrer; the member rules apply.
 * - accepted: an accepted referral request links them; sending is open both ways.
 * - acceptance_required: a verified referrer is involved and no accepted request
 *   links them. senderRole is "referrer" only when the sender is the verified
 *   referrer and the recipient is not, so the copy can address the right side.
 */
export type ReferrerDmGate =
  | { readonly kind: "not_referrer_pair" }
  | { readonly kind: "accepted" }
  | { readonly kind: "acceptance_required"; readonly senderRole: "referrer" | "member" };

export const dmSendBlockSchema = z.object({
  reason: z.literal(DM_REFERRER_ACCEPTANCE_REASON),
  error: z.string().min(1).max(300),
  /** "referrer" when the viewer is the referrer who has not accepted yet, so the UI points at their inbox. */
  senderRole: z.enum(["referrer", "member"]),
});
export type DmSendBlock = z.infer<typeof dmSendBlockSchema>;

/** The 403 body and the `sendBlock` field are the same shape, so one parser reads both. */
export function dmSendBlockFor(gate: ReferrerDmGate): DmSendBlock | null {
  if (gate.kind !== "acceptance_required") return null;
  return {
    reason: DM_REFERRER_ACCEPTANCE_REASON,
    error: gate.senderRole === "referrer" ? DM_REFERRER_ACCEPTANCE_SENDER_IS_REFERRER_ERROR : DM_REFERRER_ACCEPTANCE_ERROR,
    senderRole: gate.senderRole,
  };
}

/** Lenient client-side read: anything that is not a well-formed block means "no block". */
export function parseDmSendBlock(value: unknown): DmSendBlock | null {
  const parsed = dmSendBlockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
