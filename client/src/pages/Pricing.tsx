import { Link } from "wouter";
import { Tag } from "lucide-react";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { ASK_COST_SENTENCE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";
import { SUBSCRIPTION_PLANS } from "@shared/subscriptionPlans";

/** /pricing — public price list. Mirrors the checkout prices; no sign-in. */
export default function Pricing() {
  const { pro, max } = SUBSCRIPTION_PLANS;
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
    <PolicySection number="02" title="Extra credits (one-time)">
      <ul>
        <li><strong>₹99 per credit</strong> (India) or <strong>$1 per credit</strong> (rest of the world). Buy 1 or more.</li>
        <li>Purchased credits never expire. A credit is only used when a Referrer accepts your request.</li>
      </ul>
    </PolicySection>
    <PolicySection number="03" title="Monthly plans">
      <ul>
        <li><strong>{pro.label}:</strong> {pro.prices.INR.display} or {pro.prices.USD.display} — {pro.monthlyAllowance} referral credits each month.</li>
        <li><strong>{max.label}:</strong> {max.prices.INR.display} or {max.prices.USD.display} — {max.monthlyAllowance} referral credits each month.</li>
        <li>Plans renew at the end of the term you chose until cancelled. Cancel any time; access continues to the end of the paid term. See <Link href="/refunds" className="font-semibold text-black">Refunds &amp; cancellation</Link>.</li>
      </ul>
    </PolicySection>
    <PolicySection number="04" title="Payment">
      <p>Payments are processed securely by our payment providers (Razorpay for INR, PayPal for USD) through Chargebee. Everything is delivered digitally and instantly; see <Link href="/shipping" className="font-semibold text-black">Shipping &amp; delivery</Link>.</p>
    </PolicySection>
    <PolicySection number="05" title="Employers">
      <p>Everything above prices the job-seeker and employee side. Companies pay separately to sponsor roles and unlock anonymized opt-in talent; see <Link href="/employer" className="font-semibold text-black">Hire on skipwait.me</Link>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
