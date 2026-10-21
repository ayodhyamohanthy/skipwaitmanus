/**
 * The D-115/D-128 seeker plan family: Open Door, Fast Track, Insider.
 * ONE config source for display names and prices (D-124's single-source rule).
 *
 * Amounts are minor units (cents / paise), monthly, no GST (D-007). The two
 * price books follow D-122: India only when profile AND payment method are
 * both India, otherwise global - never by IP alone.
 *
 * NOTHING here is live: the legacy catalog (shared/planCatalog.ts) stays the
 * only catalog until pricing go-live, which needs the owner's one-word "A"
 * plus QA and payment-reliability checks (D-115 bar). The flag
 * (PLAN_FAMILY_V2, default off) gates every future reader of this module.
 *
 * Credit allowances per plan are intentionally absent: the owner has locked
 * names and prices only (D-128); allowances land with the pricing build
 * (D-115/D-124), same module, before go-live.
 */

export const PLAN_FAMILY_IDS = ["open_door", "fast_track", "insider"] as const;
export type PlanFamilyId = (typeof PLAN_FAMILY_IDS)[number];

export type PlanFamilyEntry = {
  id: PlanFamilyId;
  /** Locked display name (D-128). */
  label: "Open Door" | "Fast Track" | "Insider";
  /** Monthly price, USD cents (global book). */
  monthlyUsdCents: number;
  /** Monthly price, INR paise (India book). */
  monthlyInrPaise: number;
};

export const PLAN_FAMILY: readonly PlanFamilyEntry[] = [
  { id: "open_door", label: "Open Door", monthlyUsdCents: 0, monthlyInrPaise: 0 },
  { id: "fast_track", label: "Fast Track", monthlyUsdCents: 999, monthlyInrPaise: 49900 },
  { id: "insider", label: "Insider", monthlyUsdCents: 5900, monthlyInrPaise: 129900 },
] as const;

export function planFamilyEntry(id: PlanFamilyId): PlanFamilyEntry {
  const entry = PLAN_FAMILY.find(plan => plan.id === id);
  if (!entry) throw new Error(`unknown plan family id: ${id}`);
  return entry;
}

/** Server-side gate for every reader of the new family. Default off. */
export function planFamilyV2Enabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.PLAN_FAMILY_V2 ?? "").trim().toLowerCase() === "true";
}
