import { Link } from "wouter";
import { Tag } from "lucide-react";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { ASK_COST_SENTENCE, CREDIT_RULE, REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";

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
    <PolicySection number="02" title="Extra credits (one-time)">
      <ul>
        <li><strong>₹99 per credit</strong> (India) or <strong>$1 per credit</strong> (rest of the world). Buy 1 or more.</li>
        <li>Purchased credits never expire. {CREDIT_RULE}</li>
      </ul>
    </PolicySection>
    <PolicySection number="03" title="Payment">
      <p>Payments are processed securely by our payment providers (Razorpay for INR, PayPal for USD) through Chargebee. Everything is delivered digitally and instantly; see <Link href="/shipping" className="font-semibold text-black">Shipping &amp; delivery</Link>.</p>
    </PolicySection>
    <PolicySection number="04" title="Employers">
      <p>Everything above prices the job-seeker and employee side. Companies pay separately to sponsor roles and unlock anonymized opt-in talent; see <Link href="/employer" className="font-semibold text-black">Hire on skipwait.me</Link>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
