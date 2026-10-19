// The pass reasons as shipped: shared/passReasons.ts on main (commit ebf6a8f4, D-052, 18 Oct 2026),
// codes and labels verbatim, in the shipped order. A referrer always picks one actively; none is
// preselected. lib.mjs draws these whenever content.json's screenB.detail.pass.reasons differs from
// them, and says so on every build and gate run, so the comp never shows a picker the product no
// longer has. Once content.json (and BRIEF.md 3.1 rule 9) list these seven, the overlay does nothing
// and this file can go.
export const SHIPPED_PASS_REASONS = Object.freeze([
  { code: "not_my_team", label: "Not my team or function" },
  { code: "needs_experience", label: "Role needs more experience" },
  { code: "not_enough_context", label: "Not enough context" },
  { code: "at_capacity", label: "At capacity right now" },
  { code: "role_closed", label: "Role is closed" },
  { code: "only_refer_known", label: "I only refer people I know" },
  { code: "prefer_not_to_say", label: "Prefer not to say" },
]);
