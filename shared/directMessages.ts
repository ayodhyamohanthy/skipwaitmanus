// Direct-message send gate contract shared by server/dmRoutes.ts and
// client/src/pages/Messages.tsx (owner decision D-012 item 3).
//
// When either party is a verified referrer, a direct message can be sent only
// after a referral request links the two people and that request's referrer
// accepted it. No plan, follow or earlier thread opens it sooner. Messaging
// between two members who are not verified referrers keeps its own rules
// (existing thread, mutual follow or an active paid plan).
import { z } from "zod";

export const DM_REFERRER_ACCEPTANCE_REASON = "referrer_acceptance_required" as const;

/** Shown to a member writing to a verified referrer before acceptance. */
export const DM_REFERRER_ACCEPTANCE_ERROR = "Messages with a referrer open after they accept your request.";

/** Shown to a verified referrer writing to a member before they accept that member's request. */
export const DM_REFERRER_ACCEPTANCE_SENDER_IS_REFERRER_ERROR = "You can message this member after you accept their referral request.";

/** Paid-plan gate for two members who are not verified referrers (unchanged rule, no referrer promise). */
export const DM_PREMIUM_REQUIRED_ERROR = "Direct messaging is a premium feature. Upgrade to Pro, or follow each other, to message this member.";

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
});
export type DmSendBlock = z.infer<typeof dmSendBlockSchema>;

/** The 403 body and the `sendBlock` field are the same shape, so one parser reads both. */
export function dmSendBlockFor(gate: ReferrerDmGate): DmSendBlock | null {
  if (gate.kind !== "acceptance_required") return null;
  return {
    reason: DM_REFERRER_ACCEPTANCE_REASON,
    error: gate.senderRole === "referrer" ? DM_REFERRER_ACCEPTANCE_SENDER_IS_REFERRER_ERROR : DM_REFERRER_ACCEPTANCE_ERROR,
  };
}

/** Lenient client-side read: anything that is not a well-formed block means "no block". */
export function parseDmSendBlock(value: unknown): DmSendBlock | null {
  const parsed = dmSendBlockSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
