// D-048-p3-profile / D-319 (4): the visibility value and its parser, extracted from the kit card so the moved goal
// pages can read the same rules without reaching `components/profile/VisibilityOptions.tsx` — a kit-styled module
// whose `border-primary`/`bg-primary/5` classes are legacy tokens, not goal tokens. This module carries no JSX and no
// className, which is what makes it legitimately `behavior-only` in the goal boundary audit.
export type ProfileVisibility = "public" | "link" | "private";

/** The stored value, parsed the one way both the kit page and the goal pages must agree on. */
export function asProfileVisibility(value: string | null | undefined): ProfileVisibility {
  return value === "public" || value === "link" ? value : "private";
}
