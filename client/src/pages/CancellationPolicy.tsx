import { Link } from "wouter";
import { CircleSlash } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";
import { BUSINESS } from "@/lib/business";

/**
 * /cancellations — Cancellation policy (its own URL for the Razorpay
 * "Cancellation" field). Mirrors real behaviour: withdraw returns the
 * reserved credit, Chargebee subscriptions cancel at end of term, unused
 * purchased credits refundable within 14 days (same as /refunds).
 */
export default function CancellationPolicy() {
  return <PolicyPageShell
    screen="cancellation-policy"
    icon={CircleSlash}
    eyebrow="Cancellation policy"
    title="Cancel any time. Here is exactly what happens."
    intro="How to cancel a referral request, a Pro or Max subscription, or a credit purchase, and when any money comes back."
    updated="September 23, 2026"
    footnote="Statutory consumer rights in your country apply in addition to this policy and are not limited by it."
  >
    <PolicySection number="01" title="Cancelling a referral request">
      <ul>
        <li>You can cancel (withdraw) a referral request from <Link href="/requests" className="font-semibold text-black">My requests</Link> <strong>at any time before a verified employee claims it</strong>.</li>
        <li>The reserved credit is <strong>returned to your balance immediately</strong>. No money is charged for a request, so there is nothing to refund.</li>
        <li>Once a Referrer has claimed or accepted the request, it can no longer be cancelled.</li>
      </ul>
    </PolicySection>

    <PolicySection number="02" title="Cancelling a Pro or Max subscription">
      <ul>
        <li>Cancel renewal <strong>at any time</strong> from <Link href="/plans" className="font-semibold text-black">Plans</Link>, or email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a> from your account email.</li>
        <li>The cancellation takes effect at the <strong>end of the current billing cycle</strong>. Your plan and monthly allowance stay active until then and <strong>no further charges are made</strong>.</li>
        <li>Partly used months are not pro-rated. If you are charged after cancelling, that charge is <strong>refunded in full</strong>.</li>
      </ul>
    </PolicySection>

    <PolicySection number="03" title="Cancelling a credit purchase">
      <ul>
        <li>You can cancel a one-off credit purchase and get a refund for <strong>unused purchased credits within 14 days</strong> of purchase. Credits already used on accepted referrals are not refundable.</li>
        <li>To cancel, email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a> from your account email with the payment reference from your receipt.</li>
      </ul>
    </PolicySection>

    <PolicySection number="04" title="Refund timeline">
      <ul>
        <li>We reply to cancellation and refund requests <strong>within 2 business days</strong>.</li>
        <li>Approved refunds are issued to the <strong>original payment method</strong> and usually reach you <strong>within 5–10 business days</strong>, depending on your bank or card provider.</li>
        <li>Full details are in the <Link href="/refunds" className="font-semibold text-black">Refunds policy</Link>.</li>
      </ul>
    </PolicySection>

    <PolicySection number="05" title="Contact">
      <p>{BUSINESS.brand} is operated by {BUSINESS.operator}{BUSINESS.address ? `, ${BUSINESS.address}` : `, ${BUSINESS.country}`}. Email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
