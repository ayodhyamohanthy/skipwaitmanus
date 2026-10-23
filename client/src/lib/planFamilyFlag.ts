// Pricing plan-family flag (D-132), moved unchanged out of goalFlags.ts in
// D-048-F-flags (D-134). Off everywhere until pricing go-live; the D-132
// enable owns its lifecycle.
export const PLAN_FAMILY_V2_CLIENT = import.meta.env.VITE_PLAN_FAMILY_V2 === "true";
