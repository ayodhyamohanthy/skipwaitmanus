import { Link } from "wouter";
import { ReceiptText } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";
import { BUSINESS } from "@/lib/business";

/**
 * /refunds — Refunds & cancellation.
 *
 * Mirrors the real billing behaviour: credit reservation/return on withdraw
 * and decline, end-of-term subscription cancellation (Chargebee
 * `cancel_option=end_of_term`), and administrator-reviewed refunds that
 * deduct the credited tokens.
 */
export default function RefundPolicy() {
  return <PolicyPageShell
    screen="refund-policy"
    icon={ReceiptText}
    eyebrow="Refunds & cancellation"
    title="You only pay for what actually happened."
    intro="Credits are reserved, not spent, until a Referrer acts. Subscriptions stop at the end of the cycle you already paid for. When something goes wrong with a payment, a person reviews it."
    updated="September 23, 2026"
    footnote="Statutory consumer rights in your country apply in addition to this policy and are not limited by it."
  >
    <PolicySection number="01" title="How a credit is used">
      <ul>
        <li>Sending a referral request <strong>reserves one credit</strong>. The credit is returned to your balance automatically if you <strong>withdraw before a verified employee claims</strong> the request, or if the Referrer <strong>declines</strong>.</li>
        <li>A credit is used up only when a Referrer <strong>accepts</strong> your request. Acceptance is an introduction; it does not guarantee an interview or an offer, and no refund is due for a hiring outcome.</li>
        <li>Free monthly credits reset each month and do not carry over. Purchased credits never expire.</li>
        <li><strong>Delivery.</strong> skipwait.me is a digital service: there is no physical shipping. Purchased credits appear in your account <strong>immediately after the payment provider confirms payment</strong>; plan allowances activate on the first paid invoice. If credits do not appear, section 04 explains the automatic re-check.</li>
      </ul>
    </PolicySection>

    <PolicySection number="02" title="One-off credit purchases">
      <p>Purchased credits are added only after the payment provider confirms payment. Unused purchased credits <strong>can be refunded on request within 14 days</strong> of purchase, less any credits already consumed by accepted referrals. Contact <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a> from your account email with the payment reference shown on your receipt.</p>
    </PolicySection>

    <PolicySection number="03" title="Pro and Max subscriptions">
      <ul>
        <li>Plans renew monthly until cancelled. You can <strong>cancel renewal at any time from Plans</strong>; paid access and the monthly allowance stay active <strong>until the end of the current billing cycle</strong>, and no further charges are made.</li>
        <li>We do not pro-rate partially used months. If you were charged after cancelling, or charged twice, tell us and the duplicate charge is refunded in full.</li>
        <li>Prices are shown before checkout in INR (Razorpay) or USD (PayPal) via Chargebee, including applicable taxes where the provider collects them.</li>
      </ul>
    </PolicySection>

    <PolicySection number="04" title="Failed or unconfirmed payments">
      <p>If your bank shows a charge but credits did not appear, the payment is held for administrator review rather than lost. When you return from checkout, <Link href="/premium" className="font-semibold text-black">Buy credits</Link> re-checks the payment with the provider automatically and tells you whether it was credited or needs review. If it stays unresolved, email us with the payment reference. Duplicate or unfulfillable charges are refunded to the original payment method.</p>
    </PolicySection>

    <PolicySection number="05" title="How refunds are processed">
      <ul>
        <li>Refunds are approved by a skipwait.me administrator and recorded in an auditable log; the matching credits are removed from your balance at the same time.</li>
        <li>Refunds go back to the original payment method. Provider processing usually takes <strong>5–10 business days</strong> after approval.</li>
        <li>We may decline refunds for credits obtained or used in breach of the <Link href="/terms" className="font-semibold text-black">Terms of Service</Link>.</li>
      </ul>
    </PolicySection>

    <PolicySection number="06" title="Refund timeline at a glance">
      <ul>
        <li>Refund requests for unused purchased credits: <strong>within 14 days of purchase</strong>.</li>
        <li>We reply to every refund or cancellation request <strong>within 2 business days</strong>.</li>
        <li>Approved refunds reach the original payment method <strong>within 5–10 business days</strong>.</li>
        <li>Subscription cancellations take effect at the end of the current billing cycle. See the <Link href="/cancellations" className="font-semibold text-black">Cancellation policy</Link>.</li>
      </ul>
    </PolicySection>

    <PolicySection number="07" title="Referrers">
      <p>Reviewing, accepting, and declining referral requests is free for Referrers. No Referrer credits are ever charged for a decision, including when another employee accepts the same request first.</p>
    </PolicySection>

    <PolicySection number="08" title="Contact">
      <p>{BUSINESS.brand} is operated by {BUSINESS.operator}, {BUSINESS.address}. Phone <a href={BUSINESS.phoneHref} className="font-semibold text-black">{BUSINESS.phone}</a> ({BUSINESS.hours}). Refund and cancellation requests: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
