/**
 * Employer plan catalog for /for-companies (kit screen 34, #pricing).
 * D-133 (owner, Oct 21): the advertised $199/mo Referral programme was REMOVED
 * - nothing was built behind it (D-040). Employers may buy only labeled job
 * ads (Featured listing) and tooling; the programme returns only if its
 * product exists.
 *
 * Source of truth today is the owner price book in PRICING.md, section
 * "Employers (/for-companies)"; employerPlans.test.ts fails if the two drift.
 * Every plan is sales-led: "Get started" opens the demo request. No self-serve
 * checkout or employer entitlement exists yet. The employer-plans wave moves
 * this to shared/employerPlans.ts and backs it with provider item prices.
 */
export type EmployerPlanId = "company_page" | "enterprise";

export type EmployerPlanPrice =
  | { readonly kind: "free" }
  | { readonly kind: "from"; readonly monthlyUsd: number }
  | { readonly kind: "contact" };

export type EmployerPlan = {
  readonly id: EmployerPlanId;
  readonly name: string;
  readonly price: EmployerPlanPrice;
  readonly detail: string;
  readonly featured: boolean;
};

export const EMPLOYER_PLANS: readonly EmployerPlan[] = [
  { id: "company_page", name: "Company page", price: { kind: "free" }, detail: "Claim your page, add a verified team badge and culture showcase.", featured: false },
  { id: "enterprise", name: "Enterprise", price: { kind: "contact" }, detail: "SSO, ATS integrations, multi-region teams, compliance reviews and a dedicated partner.", featured: false },
];

/** Display label for a plan price card. */
export function employerPlanPriceLabel(price: EmployerPlanPrice): string {
  switch (price.kind) {
    case "free": return "Free";
    case "from": return `From $${price.monthlyUsd}/mo`;
    case "contact": return "Talk to us";
  }
}
