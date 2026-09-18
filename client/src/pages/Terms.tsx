import { Link } from "wouter";
import { ScrollText } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /terms — Terms of Service.
 *
 * Every clause here restates behaviour the product already enforces (credit
 * accounting, one-referrer-per-request, private conversations, admin
 * review). Nothing is promised that the code does not do. Marked draft
 * until the founder/legal review in docs/pre-launch-checklist.md signs off.
 */
export default function Terms() {
  return <PolicyPageShell
    screen="terms"
    icon={ScrollText}
    eyebrow="Terms of Service"
    title="Plain terms for a private referral handoff."
    intro="These terms explain what skipwait.me does, what you agree to when you use it, and what we will never promise. They are written to be read, not skimmed past."
    updated="September 5, 2026"
    footnote="This draft reflects how the product works today. A jurisdiction-specific version reviewed by counsel will replace it before general launch; the product behaviour it describes will not change."
  >
    <PolicySection number="01" title="What skipwait.me is">
      <p>skipwait.me lets a <strong>Job Seeker</strong> send one private referral request for a specific role to verified employees of the company behind that role. A verified employee (a <strong>Referrer</strong>) may accept or decline. We route and record the request; we are not an employer, recruiter, or hiring agent.</p>
      <p>A referral is an introduction. <strong>We do not promise an interview, an offer, or any hiring outcome</strong>, and neither does a Referrer by accepting.</p>
    </PolicySection>

    <PolicySection number="02" title="Accounts and verification">
      <ul>
        <li>You must be at least 18 and provide accurate information.</li>
        <li>Referrers verify a company email address by one-time code. Referrer access to a company’s requests ends when that verification no longer applies.</li>
        <li>You are responsible for activity under your session. Signing out on shared devices clears your local session data.</li>
      </ul>
    </PolicySection>

    <PolicySection number="03" title="Credits, plans, and payment">
      <ul>
        <li>Every Job Seeker account includes <strong>3 free referral credits each month</strong>. One credit is reserved when a request is sent and <strong>returned automatically</strong> if you withdraw before a Referrer claims it, or if a Referrer declines.</li>
        <li>Additional credits can be bought individually and never expire. Pro and Max plans add a monthly allowance that renews each cycle.</li>
        <li>Payments are processed by a hosted checkout (Chargebee with Razorpay for India/INR and PayPal internationally). Credits are added only after the payment is verified. Refund and cancellation rules are in the <Link href="/refunds" className="font-semibold text-black">Refunds & cancellation policy</Link>.</li>
        <li>Reviewing and accepting referrals is always free for Referrers.</li>
      </ul>
    </PolicySection>

    <PolicySection number="04" title="Privacy inside a request">
      <ul>
        <li>Your resume and note are visible only to you and verified employees of the target company, and then only to the single Referrer who claims your request.</li>
        <li>Referrer identities are hidden from Job Seekers until the Referrer accepts and chooses to message.</li>
        <li>Conversations open only after acceptance and are never public. Details are in our <Link href="/privacy" className="font-semibold text-black">Privacy & trust</Link> page.</li>
      </ul>
    </PolicySection>

    <PolicySection number="05" title="Acceptable use">
      <p>Do not use skipwait.me to send unsolicited bulk requests, misrepresent your identity or employment, upload content you do not have the right to share, harass anyone, or attempt to access another person’s requests, documents, or conversations. We may pause or close accounts that do, and may withhold credits obtained through misuse.</p>
    </PolicySection>

    <PolicySection number="06" title="Administrator review">
      <p>Some actions — such as payment reconciliation, data-export and deletion requests, and reports of misuse — are reviewed by a skipwait.me administrator rather than applied silently. Reviews are logged in a privacy-safe activity record so decisions can be audited.</p>
    </PolicySection>

    <PolicySection number="07" title="Liability and changes">
      <p>The service is provided as-is. To the extent permitted by law, skipwait.me is not liable for hiring decisions, a Referrer’s or Job Seeker’s conduct, or losses that follow from an introduction. If we change these terms materially, we will show the new date here and, for signed-in users, a notice in the product before the change applies.</p>
    </PolicySection>

    <PolicySection number="08" title="Contact">
      <p>Questions about these terms: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a>, or visit the <Link href="/support" className="font-semibold text-black">Support</Link> page.</p>
    </PolicySection>
  </PolicyPageShell>;
}
