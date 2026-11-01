import type { ReferralStatus } from "./referral";

/**
 * D-180: the seeker conversation's fact-only terminal and withdraw-confirm lines.
 * No amount, refund outcome, expiry clock, slot or availability claim: the thread
 * payload cannot verify a refund, so the server's notice states the true outcome.
 */

export const CLOSED_UNCLAIMED_LINE = "Nobody could take it. This referral request is closed.";
export const DECLINED_LINE = "It’s not a judgment of you. This referral request was declined.";
export const WITHDRAWN_LINE = "You withdrew this referral request.";
export const WITHDRAW_CONFIRM_AWAITING = "It never reached a verified employee, so nothing was used for this referral request.";
export const WITHDRAW_CONFIRM_VISIBLE = "It leaves the referrer’s queue and no longer counts toward your open referral requests.";

/** Structural copy of the thread's queueStatus union: shared/ never imports from client/. */
export type ConversationQueueStatus = "available_for_review" | "waiting_for_coverage" | "held_for_credit" | null | undefined;

export const SUPPORTING_COPY_FORBIDDEN: readonly RegExp[] = [
  /slot/i,
  /credits?\b/i,
  /refund|came back|comes back|returned/i,
  /\b\d+\s*days?\b/i,
  /try another|available|open to/i,
  /\basks?\b/i,
];

export function seekerTerminalLine(status: ReferralStatus, { claimed }: { claimed: boolean }): string | null {
  switch (status) {
    case "declined":
      return DECLINED_LINE;
    case "withdrawn":
      return WITHDRAWN_LINE;
    case "closed":
      return claimed ? null : CLOSED_UNCLAIMED_LINE;
    default:
      return null;
  }
}

export function withdrawConfirmLine(queueStatus: ConversationQueueStatus): string {
  return queueStatus === "waiting_for_coverage" || queueStatus === "held_for_credit"
    ? WITHDRAW_CONFIRM_AWAITING
    : WITHDRAW_CONFIRM_VISIBLE;
}
