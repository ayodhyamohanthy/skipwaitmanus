import { ArrowRight, CreditCard } from "lucide-react";
import { Link } from "wouter";
import { CREDIT_PACKS_ON_SALE } from "@shared/planCatalog";
import { planEntitlementsFor } from "@shared/planEntitlements";

export type SeekerCredits = {
  plan: string;
  monthlyAllowance: number;
  monthlyCreditsRemaining: number;
  purchasedCreditsRemaining: number;
  totalAvailable: number;
  cycleKey: string;
  subscriptionStatus: string | null;
  subscriptionCurrentTermEnd: string | null;
};

/**
 * Unified credit meter for the job-seeker surfaces.
 *
 * Shows the monthly allowance progress (3/month on the free plan, the plan's
 * credits on a catalog pass), the separate never-expiring purchased balance,
 * and the primary action: ask another referral while any credit remains,
 * otherwise buy a credit. Used by the request-success confirmation so the
 * "1 of 3 free credits used" context is always visible after a resume is
 * submitted.
 *
 * D-067: the plan name comes from the shared catalog (a retired Pro/Max or
 * unknown id reads as Free), and nothing here offers an upgrade: /plans sells
 * no plan until the D-046 passes go on sale.
 */
export function SeekerCreditsCard({ credits, compact = false }: { credits: SeekerCredits; compact?: boolean }) {
  const used = Math.max(0, credits.monthlyAllowance - credits.monthlyCreditsRemaining);
  const entitlements = planEntitlementsFor(credits.plan);
  const isFreePlan = entitlements.plan === "free";
  const hasPurchased = credits.purchasedCreditsRemaining > 0;
  const outOfCredits = credits.totalAvailable <= 0;
  const renewText = credits.subscriptionCurrentTermEnd
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(credits.subscriptionCurrentTermEnd))
    : null;

  return (
    <section
      aria-label="Referral credits"
      className={`rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-black">
          {entitlements.planLabel} plan
          {hasPurchased ? <span className="ml-1 font-semibold text-[#505050]">+ pack credits</span> : null}
        </p>
        <p className="text-sm font-bold text-black" aria-live="polite">
          {credits.totalAvailable} left
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={isFreePlan ? "Monthly free referral credits used" : "Monthly plan credits used"}
        aria-valuemin={0}
        aria-valuemax={credits.monthlyAllowance}
        aria-valuenow={used}
        className="mt-3 h-2 overflow-hidden rounded-full bg-[#f0f0f0]"
      >
        <span
          className={`block h-full rounded-full ${outOfCredits ? "bg-[#b45309]" : "bg-[#141414]"}`}
          style={{ width: `${credits.monthlyAllowance ? Math.min(100, (used / credits.monthlyAllowance) * 100) : 0}%` }}
        />
      </div>

      <p className="mt-3 text-sm leading-5 text-[#505050]">
        {used} of {credits.monthlyAllowance} {isFreePlan ? "free" : "plan"} credits used this month.
        {hasPurchased ? (
          <span className="block pt-1 text-[#505050]">
            {credits.purchasedCreditsRemaining} purchased credit{credits.purchasedCreditsRemaining === 1 ? "" : "s"} — these never expire.
          </span>
        ) : null}
        {!isFreePlan && renewText ? (
          <span className="block pt-1 text-[#505050]">Plan renews {renewText}.</span>
        ) : null}
      </p>

      <div className="mt-4 grid gap-2">
        {outOfCredits ? (
          CREDIT_PACKS_ON_SALE ? <Link href="/premium?role=job_seeker"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white"
          >
            <CreditCard className="h-4 w-4" /> Add a credit for $1 <ArrowRight className="h-4 w-4" />
          </Link> : null
        ) : (
          <Link
            href="/start"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#141414] px-4 py-3 text-sm font-semibold text-white"
          >
            Ask another referral <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
