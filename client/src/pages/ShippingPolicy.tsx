import { Link } from "wouter";
import { Zap } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /shipping — Shipping & delivery.
 *
 * skipwait.me sells digital referral credits and subscriptions only. Nothing
 * physical ships. Payment providers (Razorpay international enablement)
 * require this page to exist and say so plainly.
 */
export default function ShippingPolicy() {
  return <PolicyPageShell
    screen="shipping-policy"
    icon={Zap}
    eyebrow="Shipping & delivery"
    title="Everything is digital. Nothing ships."
    intro="skipwait.me sells referral credits and plan subscriptions. They are delivered to your account online, usually within seconds of payment."
    updated="September 23, 2026"
  >
    <PolicySection number="01" title="What you receive">
      <ul>
        <li>Credits and Pro or Max plans are <strong>digital services</strong>. <strong>No physical goods are shipped</strong>, so there are no shipping charges, carriers, or delivery addresses.</li>
        <li>Delivery works the same for buyers in every country.</li>
      </ul>
    </PolicySection>

    <PolicySection number="02" title="When it arrives">
      <ul>
        <li>Purchased credits and plan access are <strong>added to your account instantly</strong> once the payment provider confirms the payment, usually within seconds.</li>
        <li>You get a confirmation on screen when you return from checkout, and your balance updates on <Link href="/premium" className="font-semibold text-black">Buy credits</Link>.</li>
      </ul>
    </PolicySection>

    <PolicySection number="03" title="If something doesn't arrive">
      <p>If you paid and don't see your credits or plan, open <Link href="/premium" className="font-semibold text-black">Buy credits</Link> to re-check the payment, or email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a> with the payment reference. Refunds follow our <Link href="/refunds" className="font-semibold text-black">Refunds &amp; cancellation</Link> policy.</p>
    </PolicySection>
  </PolicyPageShell>;
}
