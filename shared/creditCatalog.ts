/**
 * Credit-action costs (§3.1 "What credits buy") and regional tier multipliers
 * (§3.3). Data only; derived alongside the plan catalog so the /plans, /billing
 * and /pricing screens and any metered tool read one source of truth.
 *
 * Credits buy AI-made finished work. Human expert review and live sessions are
 * NOT credits — they are sold as one-time products (HUMAN_PRODUCTS in
 * planCatalog.ts) so paid human time can never be confused with tool credits.
 *
 * Changeable data.
 */

/** One finished unit of AI work costs this many credits (§3.1). */
export type CreditAction = {
  id: string;
  label: string;
  cost: number;
};

export const CREDIT_ACTIONS: readonly CreditAction[] = [
  { id: "ask_rewrite", label: "Ask rewrite", cost: 1 },
  { id: "profile_check", label: "Profile check", cost: 1 },
  { id: "thank_you_pack", label: "Thank-you pack", cost: 1 },
  { id: "ask_one_pager", label: "Ask One-Pager", cost: 2 },
  { id: "extra_open_ask", label: "Extra open ask for 30 days", cost: 2 },
  { id: "company_research", label: "Company research", cost: 3 },
  { id: "resume_overhaul", label: "Resume overhaul", cost: 3 },
  { id: "offer_comparison", label: "Offer comparison", cost: 3 },
  { id: "interview_dossier", label: "Interview dossier", cost: 4 },
  { id: "ai_mock_interview", label: "AI mock interview", cost: 5 },
  { id: "salary_coach", label: "Salary coach", cost: 5 },
];

export function creditActionCost(id: string): number | undefined {
  return CREDIT_ACTIONS.find(action => action.id === id)?.cost;
}

/**
 * Regional tiers (§3.3). The tier is assigned from Cloudflare's CF-IPCountry
 * header and locked to the billing country at checkout; the multipliers below
 * scale the Tier-1 (global USD) Start/Momentum, Land and credit prices.
 *
 * Reference data for display and enforcement policy; the live checkout rails
 * charge the exact item prices in the catalog, not these multipliers.
 */
export type RegionalTier = {
  id: string;
  label: string;
  /** Start/Momentum, Land, and credit multipliers applied to the Tier-1 USD base. */
  multipliers: { start: number; land: number; credits: number };
  /** Smallest USD floor for Start in this tier (T4 uses $2.99). */
  startFloorUsd?: number;
  currency: "USD" | "EUR" | "INR";
  markets: readonly string[];
};

export const REGIONAL_TIERS: readonly RegionalTier[] = [
  { id: "T1", label: "Tier 1", multipliers: { start: 1, land: 1, credits: 1 }, currency: "USD",
    markets: ["US", "CA", "GB", "IE", "DE", "FR", "NL", "BE", "AT", "DK", "SE", "NO", "FI", "IS", "CH", "AU", "NZ", "SG", "IL", "JP"] },
  { id: "T2", label: "Tier 2", multipliers: { start: 0.7, land: 0.85, credits: 0.85 }, currency: "USD",
    markets: ["AE", "SA", "QA", "KW", "BH", "OM", "PL", "CZ", "PT", "GR", "HU", "RO", "HR", "CL", "UY"] },
  { id: "T3", label: "Tier 3", multipliers: { start: 0.45, land: 0.65, credits: 0.7 }, currency: "USD",
    markets: ["BR", "MX", "CO", "AR", "PE", "ID", "PH", "TH", "VN", "MY", "TR", "ZA"] },
  { id: "IN", label: "India", multipliers: { start: 0.4, land: 0.6, credits: 0.58 }, currency: "INR",
    markets: ["IN"] },
  { id: "T4", label: "Tier 4", multipliers: { start: 0.35, land: 0.6, credits: 0.6 }, startFloorUsd: 2.99, currency: "USD",
    markets: ["NG", "PK", "BD", "EG", "KE", "LK", "NP", "GH"] },
];

export function regionalTierForCountry(country: string | undefined | null): RegionalTier | undefined {
  if (!country) return undefined;
  const code = country.toUpperCase();
  return REGIONAL_TIERS.find(tier => tier.markets.includes(code));
}
