import { HeartHandshake } from "lucide-react";
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
 * Referrer-side credit meter on the empty /queue: context only. Referrers never
 * pay (D-055, shared/referrerPurchases.ts) and nothing a referrer does spends a
 * credit (opening capacity, claiming and accepting move no credit), so the card
 * offers no purchase or upgrade. It shows the referrer wallet as the server
 * reports it, including credits bought before referrer purchases were switched off.
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
    <section aria-label="Referral credits" className={`rounded-xl border border-[#e5e5e5] bg-[#f5f5f5] ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[.12em] text-black">
          <HeartHandshake className="h-3.5 w-3.5" /> Referral credits
        </p>
        <p className="text-sm font-bold text-black" aria-live="polite">{credits.totalAvailable} left</p>
      </div>
      <div role="progressbar" aria-label="Monthly referral credits used" aria-valuemin={0} aria-valuemax={credits.monthlyAllowance} aria-valuenow={used} className="mt-3 h-2 overflow-hidden rounded-full bg-[#f0f0f0]">
        <span className={`block h-full rounded-full ${outOfCredits ? "bg-[#b45309]" : "bg-[#141414]"}`} style={{ width: `${credits.monthlyAllowance ? Math.min(100, (used / credits.monthlyAllowance) * 100) : 0}%` }} />
      </div>
      <p className="mt-3 text-sm leading-5 text-[#505050]">
        {used} of {credits.monthlyAllowance} free credits used this month.
        {credits.purchasedCreditsRemaining > 0 ? <span className="block pt-1 text-[#505050]">{credits.purchasedCreditsRemaining} purchased credit{credits.purchasedCreditsRemaining === 1 ? "" : "s"} — never expire.</span> : null}
      </p>
    </section>
  );
}
