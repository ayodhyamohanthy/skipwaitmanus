/** Pass reasons (queue task 15, amended by D-052). The code is what a referrer picks, always
 * actively: no surface preselects one. `legacy` maps it to the existing three-value decline
 * reason so status, routing and credit logic stay untouched. `fixable` is D-052's split of
 * D-035's lists: a fixable reason names something the seeker can change before sending again.
 * The credit effect of that split ships with D-035, not here. */
export const PASS_REASON_OPTIONS = [
  { code: "not_my_team", label: "Not my team or function", legacy: "role_not_a_fit", fixable: false },
  { code: "needs_experience", label: "Role needs more experience", legacy: "role_not_a_fit", fixable: true },
  { code: "not_enough_context", label: "Not enough context", legacy: "cannot_support", fixable: true },
  { code: "at_capacity", label: "At capacity right now", legacy: "timing", fixable: false },
  { code: "role_closed", label: "Role is closed", legacy: "role_not_a_fit", fixable: false },
  { code: "only_refer_known", label: "I only refer people I know", legacy: "cannot_support", fixable: false },
  { code: "prefer_not_to_say", label: "Prefer not to say", legacy: "cannot_support", fixable: false },
] as const satisfies ReadonlyArray<{ code: string; label: string; legacy: "role_not_a_fit" | "cannot_support" | "timing"; fixable: boolean }>;

export type PassReasonOption = (typeof PASS_REASON_OPTIONS)[number];
export type PassReasonCode = PassReasonOption["code"];

export function isPassReasonCode(value: unknown): value is PassReasonCode {
  return typeof value === "string" && PASS_REASON_OPTIONS.some(option => option.code === value);
}

/** Seeker-facing line, or null when the referrer chose not to share a reason. Never includes a name. */
export function passReasonSeekerLabel(code: string | null | undefined): string | null {
  const option = PASS_REASON_OPTIONS.find(item => item.code === code);
  return option && option.code !== "prefer_not_to_say" ? option.label : null;
}

/** D-038-A/B: exclusion codes written as pass rows so a lapsed referrer is excluded everywhere
 * (inbox, preview, save, claim, review email, first look, claimed detail, documents).
 * They are not pass reasons: isPassReasonCode stays false for them, nothing shows them to anyone. */
export const REFERRER_EXCLUSION_CODES = ["lapsed_claim", "lapsed_allocation", "lapsed_referred", "stepped_back"] as const;
export type ReferrerExclusionCode = (typeof REFERRER_EXCLUSION_CODES)[number];
