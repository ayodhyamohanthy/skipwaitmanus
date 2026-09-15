import { ArrowRight, HeartHandshake } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/_core/auth";

type ReferrerCredits = {
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
 * Referrer-side credit meter — mirrors SeekerCreditsCard. Referrers spend a
 * credit when they open capacity / accept a private request, so the inbox
 * shows how many monthly slots remain before an upgrade is needed.
 */
export function ReferrerCreditsCard({ compact = false }: { compact?: boolean }) {
  const { isSignedIn, getToken } = useAuth();
  const [credits, setCredits] = useState<ReferrerCredits | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/credits/summary?role=referrer", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok || !active) return;
        const data = await response.json() as { summary?: ReferrerCredits };
        if (data.summary && active) setCredits(data.summary);
      } catch { /* meter is non-critical context */ }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  if (!isSignedIn || !credits) return null;
  const used = Math.max(0, credits.monthlyAllowance - credits.monthlyCreditsRemaining);
  const outOfCredits = credits.totalAvailable <= 0;

  return (
    <section aria-label="Referral credits" className={`rounded-xl border border-[#F3D5C7] bg-[#F9E4DE]/70 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.12em] text-[#191713]">
          <HeartHandshake className="h-3.5 w-3.5" /> Referral credits
        </p>
        <p className="text-sm font-bold text-[#191713]" aria-live="polite">{credits.totalAvailable} left</p>
      </div>
      <div role="progressbar" aria-label="Monthly referral credits used" aria-valuemin={0} aria-valuemax={credits.monthlyAllowance} aria-valuenow={used} className="mt-3 h-2 overflow-hidden rounded-full bg-[#F3D5C7]">
        <span className={`block h-full rounded-full ${outOfCredits ? "bg-amber-500" : "bg-[#191713]"}`} style={{ width: `${credits.monthlyAllowance ? Math.min(100, (used / credits.monthlyAllowance) * 100) : 0}%` }} />
      </div>
      <p className="mt-3 text-sm leading-5 text-[#3F3B33]">
        {used} of {credits.monthlyAllowance} free credits used this month.
        {credits.purchasedCreditsRemaining > 0 ? <span className="block pt-1 text-[#625D52]">{credits.purchasedCreditsRemaining} purchased credit{credits.purchasedCreditsRemaining === 1 ? "" : "s"} — never expire.</span> : null}
      </p>
      {outOfCredits ? (
        <a href="/plans?role=referrer" className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#191713] px-4 py-3 text-sm font-semibold text-white">
          Increase your referral allowance <ArrowRight className="h-4 w-4" />
        </a>
      ) : null}
    </section>
  );
}
