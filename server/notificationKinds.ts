// Notification kinds (task 21 part A). Metadata only: no copy, delivery or preference logic lives here.
export const NOTIFICATION_KINDS = ["ask_new", "ask_accepted", "ask_passed", "ask_claimed", "ask_expired", "ask_update", "message_new", "credits_added", "coverage_credit", "slot_open", "ask_expiring", "safety_notice", "system"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** Kind of the in-app row written by a referral transition. Unknown combinations stay null-safe as ask_update. */
export function transitionNotificationKind(action: string, toStatus: string): NotificationKind {
  if (action === "approve") return "ask_accepted";
  // D-035: a not-fixable pass is `pass_release`; it is still a pass, not a new kind.
  if (action === "pass" || action === "pass_release") return "ask_passed";
  if (action === "claim") return "ask_claimed";
  if (action === "expire") return "ask_expired";
  if (action === "review") return toStatus === "approved" ? "ask_accepted" : toStatus === "rejected" ? "ask_passed" : "ask_update";
  return "ask_update";
}
