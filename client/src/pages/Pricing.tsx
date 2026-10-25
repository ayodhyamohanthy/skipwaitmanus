import { Link } from "wouter";
import { ArrowRight, Tag } from "lucide-react";
import { Button } from "@/components/kit/button";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { ASK_COST_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { PLAN_FAMILY, planFeeMinor } from "@shared/planFamily";
import { money } from "@/components/plans/format";
/** /pricing — public price list. Mirrors the checkout prices; no sign-in. */
export default function Pricing() {
  return <PolicyPageShell
    screen="pricing"
    icon={Tag}
    eyebrow="Pricing"
    title="Simple prices. Start free."
    intro="Prices are in Indian rupees (INR) for India and US dollars (USD) everywhere else. The price you pay is shown before checkout."
    updated="October 18, 2026"
    status="published"
  >
    <PolicySection number="01" title="Free">
      <p><strong>{ASK_COST_SENTENCE}</strong> The free credits reset each month. {REFERRER_MONEY_SENTENCE}</p>
    </PolicySection>
    <PolicySection number="02" title="Plans (frozen October 25, 2026)">
      <ul>
        {PLAN_FAMILY.map(plan => (
          <li key={plan.id}><strong>{plan.label}</strong>: founding price <strong>{money(planFeeMinor(plan.id, "INR"), "INR")}</strong> a month in India, <strong>{money(planFeeMinor(plan.id, "USD"), "USD")}</strong> a month everywhere else. Includes monthly referrals inside its band.</li>
        ))}
        <li>Extra referrals are priced per referrer level with volume discounts; the full list is on the plans page. Checkout is not switched on yet; the old credit packs are paused, and credits already bought still work.</li>
      </ul>
    </PolicySection>
    <PolicySection number="03" title="Payment">
      <p>Payments are processed securely by our payment providers (Razorpay for INR, PayPal for USD) through Chargebee. Everything is delivered digitally: credits are added to your account once the payment provider confirms the payment; see <Link href="/shipping" className="font-semibold text-black">Shipping &amp; delivery</Link>.</p>
    </PolicySection>
    <PolicySection number="04" title="Employers">
      <p>Everything above prices the job-seeker and employee side. Companies pay separately to sponsor roles and unlock anonymized opt-in talent; see <Link href="/employer" className="font-semibold text-black">Hire on skipwait.me</Link>.</p>
    </PolicySection>
    <div className="pt-4">
      <Button asChild size="lg" className="brand-button">
        <Link href="/plans">See plans and prices <ArrowRight className="size-4" /></Link>
      </Button>
    </div>
  </PolicyPageShell>;
}
