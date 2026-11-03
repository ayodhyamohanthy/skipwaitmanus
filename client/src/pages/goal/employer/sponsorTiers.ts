// Sponsorship tiers for the goal /employer/opportunities surface.
// Packet rule §4.1: employer money lines are never retyped — these are the
// kit page's own values (client/src/pages/EmployerOpportunities.tsx,
// SPONSOR_TIERS: Featured 7 days cost 10, Spotlight 30 days cost 25). The
// display dialog states the cost as a plain number under a "Cost" label and
// never uses the internal unit word (rule 1a); the values stay identical to the
// kit and are pinned by employer.goal.test.tsx, which reads the kit source so
// a kit price change fails here instead of drifting.
export type SponsorTier = { id: "featured" | "spotlight"; label: string; days: number; cost: number };

export const SPONSOR_TIERS: readonly [SponsorTier, ...SponsorTier[]] = [
  { id: "featured", label: "Featured", days: 7, cost: 10 },
  { id: "spotlight", label: "Spotlight", days: 30, cost: 25 },
];
