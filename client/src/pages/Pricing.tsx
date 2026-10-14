import { Link } from "wouter";
import { Tag } from "lucide-react";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { FREE_MONTHLY_ALLOWANCE } from "@shared/subscriptionPlans";
import { creditPackCards, humanProductCards } from "@/components/plans/kitPlans";
import { subscriptionPriceForPlan, type PaidSubscriptionPlan } from "@shared/subscriptionPlans";

/** /pricing — public price list. Mirrors the checkout prices; no sign-in. */
const PLAN_ROWS: ReadonlyArray<{ plan: PaidSubscriptionPlan; label: string; note: string }> = [
  { plan: "keep_warm", label: "Keep warm (12 months)", note: "5 open asks and 1 credit each month; unused credits carry over 1 month." },
  { plan: "start", label: "Start", note: "8 open asks and 10 credits every 30 days; credits carry over 1 month." },
  { plan: "momentum", label: "Momentum", note: "15 open asks and 30 credits every 30 days; credits carry over 3 months." },
  { plan: "land_100", label: "Land Focus", note: "30 open asks and 120 credits every 30 days; credits roll over while any Land pass is active; 1 written review included." },
  { plan: "land_200", label: "Land Sprint", note: "50 open asks and 300 credits every 30 days; 1 written review + 1 live session included." },
  { plan: "land_500", label: "Land Concierge (by application)", note: "75 open asks and 1,000 credits every 30 days; 6 human hours included (18 per 90 days)." },
];

function planPrice(plan: PaidSubscriptionPlan, currency: "INR" | "USD"): { monthly: string; quarterly: string; yearly?: string } {
  const out: { monthly: string; quarterly: string; yearly?: string } = { monthly: "", quarterly: "" };
  try { out.monthly = subscriptionPriceForPlan(plan, currency, "monthly").display; } catch { /* plan has no 30-day pass */ }
  try { out.quarterly = subscriptionPriceForPlan(plan, currency, "quarterly").display; } catch { /* plan has no 90-day pass */ }
  try { out.yearly = subscriptionPriceForPlan(plan, currency, "yearly").display; } catch { /* plan has no yearly pass */ }
  return out;
}

export default function Pricing() {
  const usdPacks = creditPackCards("USD");
  const inrPacks = creditPackCards("INR");
  const usdHuman = humanProductCards("USD");
  const inrHuman = humanProductCards("INR");
  return <PolicyPageShell
    screen="pricing"
    icon={Tag}
    eyebrow="Pricing"
    title="Simple prices. Start free."
    intro="Prices are in Indian rupees (INR, GST included) for India and US dollars (USD) everywhere else. The price you pay is shown before checkout. Referrals are always free on every plan, and paying never changes your place in a referrer's queue."
    updated="October 14, 2026"
    status="published"
  >
    <PolicySection number="01" title="Free">
      <p><strong>{FREE_MONTHLY_ALLOWANCE} open asks and 2 credits every 30 days, free.</strong> No card or payment method is ever asked. Reviewing and accepting requests is always free for referrers.</p>
    </PolicySection>
    <PolicySection number="02" title="Plans (30-day and 90-day passes)">
      <p>Every plan is sold as a 30-day pass or a 90-day pass. The 90-day pass costs about 2.3–2.65× the 30-day price, a saving of 12–22%.</p>
      <ul>
        {PLAN_ROWS.map(row => {
          const usd = planPrice(row.plan, "USD");
          const inr = planPrice(row.plan, "INR");
          const usdText = [usd.monthly, usd.quarterly].filter(Boolean).join(" / ");
          const inrText = [inr.monthly, inr.quarterly].filter(Boolean).join(" / ");
          return <li key={row.plan}><strong>{row.label}:</strong> {usdText} (USD) or {inrText} (INR, incl. GST). {row.note}</li>;
        })}
      </ul>
      <p>Land 90-day passes and Land Concierge never auto-renew. Plans renew until cancelled; cancel any time and access continues to the end of the paid pass. See <Link href="/refunds" className="font-semibold text-black">Refunds &amp; cancellation</Link>.</p>
    </PolicySection>
    <PolicySection number="03" title="Credit packs (one-time, never expire)">
      <p>Credits buy finished AI work — ask rewrites, profile checks, research, dossiers, mock interviews and more. Your first pack is a one-time offer that never renews. Purchased credits never expire and never change your queue position.</p>
      <ul>
        <li><strong>USD:</strong> {usdPacks.map(pack => `${pack.credits}/${pack.display}`).join(" · ")}</li>
        <li><strong>INR (incl. GST):</strong> {inrPacks.map(pack => `${pack.credits}/${pack.display}`).join(" · ")}</li>
      </ul>
    </PolicySection>
    <PolicySection number="04" title="Human expert time (separate from credits)">
      <p>Human time is sold as one-time products, never as credits.</p>
      <ul>
        <li><strong>Written expert review (within 48h):</strong> {usdHuman[0]?.display} (USD) or {inrHuman[0]?.display} (INR).</li>
        <li><strong>Live 45-minute session:</strong> {usdHuman[1]?.display} (USD) or {inrHuman[1]?.display} (INR).</li>
      </ul>
    </PolicySection>
    <PolicySection number="05" title="Payment">
      <p>Payments are processed securely by our payment providers (Razorpay for INR, PayPal for USD) through Chargebee. Everything is delivered digitally and instantly; see <Link href="/shipping" className="font-semibold text-black">Shipping &amp; delivery</Link>.</p>
    </PolicySection>
    <PolicySection number="06" title="Employers">
      <p>Everything above prices the job-seeker and employee side. Companies pay separately to sponsor roles and unlock anonymized opt-in talent; see <Link href="/employer" className="font-semibold text-black">Hire on skipwait.me</Link>.</p>
    </PolicySection>
  </PolicyPageShell>;
}

