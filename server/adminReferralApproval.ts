// Administrator decision on a referral request in the approval queue
// (resolveAdminApproval in server/db.ts).
//
// "approved" means the request's referrer accepted it: the DM gate
// (server/dmReferrerGate.ts) opens messages between the seeker and that
// referrer on it (D-012 item 3, privacy page: messages open "only after the
// Referrer accepts that specific request"). So an administrator can never
// approve a request a verified employee has claimed; only that employee can
// accept it (through transitionReferralRequestTx). The administrator can
// still reject it. An unclaimed request has no referrer, so approving it
// opens no conversation.
import type { ReferralStatus } from "../shared/referral";

export const ADMIN_CANNOT_ACCEPT_CLAIMED_ERROR = "A verified employee claimed this request, so only they can accept it; you can still reject it";

export class AdminCannotAcceptClaimedReferralError extends Error {
  constructor() { super(ADMIN_CANNOT_ACCEPT_CLAIMED_ERROR); this.name = "AdminCannotAcceptClaimedReferralError"; }
}

export type AdminReferralApprovalRow = { readonly status: ReferralStatus; readonly referrerId: number | null };

/** The status an administrator's decision writes, or a throw when it may not be written. */
export function decideAdminReferralApproval(row: AdminReferralApprovalRow, decision: "approved" | "rejected"): "approved" | "declined" {
  if (row.status !== "pending") throw new Error("This record was already resolved");
  if (decision === "rejected") return "declined";
  if (row.referrerId !== null) throw new AdminCannotAcceptClaimedReferralError();
  return "approved";
}
