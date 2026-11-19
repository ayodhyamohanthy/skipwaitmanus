// Pricing plan-family flag (D-132), moved unchanged out of goalFlags.ts in
// D-048-F-flags (D-134).
//
// Oct 25 2026 owner freeze (phonemsg-01M5SNVZEY1P8K169J48T2HGTJ, push
// phonemsg-01M5SNY88BXE470FEN4Z0K7KWF): the frozen banded pricing DISPLAY is
// published read-only - /plans shows PlansV2 by default. This flag gates
// display only. Billing stays off: no plan checkout exists for the banded
// model, legacy pack purchases are paused (LEGACY_PACK_SALES_PAUSED), and the
// page's buttons only explain that checkout is not switched on yet. Set
// VITE_PLAN_FAMILY_V2=false to fall back to the legacy plans page.
export const PLAN_FAMILY_V2_CLIENT = import.meta.env.VITE_PLAN_FAMILY_V2 !== "false";
