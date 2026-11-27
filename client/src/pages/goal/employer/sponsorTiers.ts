// Sponsorship tiers for the goal /employer/opportunities surface.
// Packet rule §4.1: employer money lines are never retyped. These are the values
// the kit page carried (Featured 7 days cost 10, Spotlight 30 days cost 25) and
// they are now the only copy: D-048-K-employer deleted the kit page, so
// employer.goal.test.tsx pins these two rows as literals instead of reading a
// kit source that no longer exists. A price change is the owner's call (D-123),
// so the pin fails loudly rather than letting a number drift.
// The display dialog states the cost as a plain number under a "Cost" label and
// never uses the internal unit word (rule 1a).
export type SponsorTier = { id: "featured" | "spotlight"; label: string; days: number; cost: number };

export const SPONSOR_TIERS: readonly [SponsorTier, ...SponsorTier[]] = [
  { id: "featured", label: "Featured", days: 7, cost: 10 },
  { id: "spotlight", label: "Spotlight", days: 30, cost: 25 },
];
