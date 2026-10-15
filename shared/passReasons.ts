/** Kit pass reasons (queue task 15). The code is what a referrer picks; legacy maps it to the
 * existing three-value decline reason so status, routing and credit logic stay untouched. */
export const PASS_REASON_OPTIONS = [
  { code: "not_my_team", label: "Not my team or function", legacy: "role_not_a_fit" },
  { code: "needs_experience", label: "Role needs more experience", legacy: "role_not_a_fit" },
  { code: "not_enough_context", label: "Not enough context", legacy: "cannot_support" },
  { code: "at_capacity", label: "At capacity right now", legacy: "timing" },
  { code: "prefer_not_to_say", label: "Prefer not to say", legacy: "cannot_support" },
] as const;

export type PassReasonCode = (typeof PASS_REASON_OPTIONS)[number]["code"];

export function isPassReasonCode(value: unknown): value is PassReasonCode {
  return typeof value === "string" && PASS_REASON_OPTIONS.some(option => option.code === value);
}

/** Seeker-facing line, or null when the referrer chose not to share a reason. Never includes a name. */
export function passReasonSeekerLabel(code: string | null | undefined): string | null {
  const option = PASS_REASON_OPTIONS.find(item => item.code === code);
  return option && option.code !== "prefer_not_to_say" ? option.label : null;
}
