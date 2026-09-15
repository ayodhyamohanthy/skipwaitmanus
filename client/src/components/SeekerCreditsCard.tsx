import { ArrowRight, CreditCard } from "lucide-react";
import { Link } from "wouter";

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
 * Shows the monthly free allowance progress (3/month on the free plan), the
 * separate never-expiring purchased balance, and the primary action: ask
 * another referral while any credit remains, otherwise buy credits / upgrade.
 * Used by the requests dashboard and the request-success confirmation so the
 * "1 of 3 free credits used" context is always visible after a resume is
 * submitted.
 */
export function SeekerCreditsCard({ credits, compact = false }: { credits: SeekerCredits; compact?: boolean }) {
  const used = Math.max(0, credits.monthlyAllowance - credits.monthlyCreditsRemaining);
  const isFreePlan = credits.plan === "free";
  const hasPurchased = credits.purchasedCreditsRemaining > 0;
  const outOfCredits = credits.totalAvailable <= 0;
  const renewText = credits.subscriptionCurrentTermEnd
    ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(credits.subscriptionCurrentTermEnd))
    : null;

  return (
    <section
      aria-label="Referral credits"
      className={`rounded-xl border border-[#F3D5C7] bg-[#F9E4DE]/70 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-[#191713]">
          {isFreePlan ? "Free plan" : `${credits.plan} plan`}
          {hasPurchased ? <span className="ml-1 font-semibold text-[#625D52]">+ pack credits</span> : null}
        </p>
        <p className="text-sm font-bold text-[#191713]" aria-live="polite">
          {credits.totalAvailable} left
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Monthly free referral credits used"
        aria-valuemin={0}
        aria-valuemax={credits.monthlyAllowance}
        aria-valuenow={used}
        className="mt-3 h-2 overflow-hidden rounded-full bg-[#F3D5C7]"
      >
        <span
          className={`block h-full rounded-full ${outOfCredits ? "bg-amber-500" : "bg-[#191713]"}`}
          style={{ width: `${credits.monthlyAllowance ? Math.min(100, (used / credits.monthlyAllowance) * 100) : 0}%` }}
        />
      </div>

      <p className="mt-3 text-sm leading-5 text-[#3F3B33]">
        {used} of {credits.monthlyAllowance} free credits used this month.
        {hasPurchased ? (
          <span className="block pt-1 text-[#625D52]">
            {credits.purchasedCreditsRemaining} purchased credit{credits.purchasedCreditsRemaining === 1 ? "" : "s"} — these never expire.
          </span>
        ) : null}
        {!isFreePlan && renewText ? (
          <span className="block pt-1 text-[#625D52]">Plan renews {renewText}.</span>
        ) : null}
      </p>

      <div className="mt-4 grid gap-2">
        {outOfCredits ? (
          <>
            <Link
              href="/premium?role=job_seeker"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-semibold text-white"
            >
              <CreditCard className="h-4 w-4" /> Add a credit for $1 <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/plans?role=job_seeker"
              className="text-center text-sm font-semibold text-[#191713]"
            >
              Or upgrade for more monthly referrals
            </Link>
          </>
        ) : (
          <Link
            href="/start"
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-semibold text-white"
          >
            Ask another referral <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
