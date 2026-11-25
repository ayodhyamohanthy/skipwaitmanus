import { Link } from "wouter";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";
import { CREDIT_RULE } from "@shared/moneyCopy";

/**
 * /terms — Terms of Service.
 *
 * Product disclosures and standard clauses within the owner's D-345 approval.
 * Existing policy layout and refund rights are preserved.
 */
export default function Terms() {
  return <PolicyPageShell
    screen="terms"
    eyebrow="TERMS OF SERVICE"
    title="Terms"
    intro="Plain terms for a private referral handoff. These terms explain what skipwait.me does, what you agree to when you use it, and what we will never promise. They are written to be read, not skimmed past. By creating an account or using skipwait.me, you agree to these terms."
    updated="16 Nov 2026"
    status="published"
    summary={[
      "A request uses your referral balance only when a verified employee can see it. Any payment covers the service, never an employee's decision or a hiring outcome.",
      "Referrers decide each request. A referral is an introduction, never a promise of an interview or a job.",
      "Private by default. Resumes and referrer identities stay hidden until a referrer accepts.",
      "Be honest. Misuse — unsolicited bulk requests, misrepresentation, harassment — can limit or close an account.",
    ]}
    sections={[
      { id: "01", label: "What skipwait.me is" },
      { id: "02", label: "Accounts and verification" },
      { id: "03", label: "Credits, plans, and payment" },
      { id: "04", label: "Privacy inside a request" },
      { id: "05", label: "Acceptable use" },
      { id: "06", label: "Administrator review" },
      { id: "07", label: "Liability and changes" },
      { id: "08", label: "Contact" },
      { id: "09", label: "Business identity" },
      { id: "10", label: "Governing law" },
      { id: "11", label: "Grievance officer" },
    ]}
    footnote="These terms describe how the product works today. If we change them, we will update the date above."
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
        <li>The free allowance is <strong>3 referral requests per calendar month</strong>, subject to account eligibility and card verification when required. Unused monthly allowance does not carry forward. {CREDIT_RULE}</li>
        <li>Legacy referral packs are paused, and new paid plans are not on sale right now. Existing balances and already-started payments remain subject to their applicable terms and recovery process. If you have an existing renewing plan, cancellation stops renewal at the end of its paid term.</li>
        <li>Payments are processed by a hosted checkout (Chargebee with Razorpay for India/INR and PayPal internationally). Purchased referral balance is added only after the payment is verified. Refund and cancellation rules are in the <Link href="/refunds" className="font-semibold text-foreground">Refunds & cancellation policy</Link>.</li>
        <li>Basic reviewing and referring is free for Referrers. Employees are never paid by skipwait.me for a referral and decide independently under their employer's own process.</li>
      </ul>
    </PolicySection>

    <PolicySection number="04" title="Privacy inside a request">
      <ul>
        <li>Your note is visible to verified employees at the company behind the role while your request is open. Your resume is visible only to you and the verified employee who accepts your request, while that accepted referral remains active. Claiming a request does not unlock your name or resume.</li>
        <li>Referrer identities are hidden from Job Seekers until the Referrer accepts. After acceptance, the Job Seeker and the Referrer see each other's names, and the Referrer receives the resume. Before acceptance, a Referrer sees neither the Job Seeker's name nor resume.</li>
        <li>Conversations open only after acceptance and are never public. Details are in our <Link href="/privacy" className="font-semibold text-foreground">Privacy & trust</Link> page.</li>
      </ul>
    </PolicySection>

    <PolicySection number="05" title="Acceptable use">
      <p>Do not use skipwait.me to send unsolicited bulk requests, misrepresent your identity or employment, upload content you do not have the right to share, harass anyone, or attempt to access another person’s requests, documents, or conversations. We may pause or close accounts that do, and may withhold referral balance obtained through misuse. Account closure does not remove any refund or consumer right that applies by law.</p>
    </PolicySection>

    <PolicySection number="06" title="Administrator review">
      <p>Some actions — such as payment reconciliation, data-export and deletion requests, and reports of misuse — are reviewed by a skipwait.me administrator rather than applied silently. Reviews are logged in a privacy-safe activity record so decisions can be audited.</p>
    </PolicySection>

    <PolicySection number="07" title="Liability and changes">
      <p>The service is provided as-is and as available. To the extent permitted by law, skipwait.me is not liable for hiring decisions, a Referrer’s or Job Seeker’s conduct, or losses that follow from an introduction. Nothing in these terms excludes liability or consumer rights that cannot lawfully be excluded. Changes to these terms will be published on this page with an updated date.</p>
    </PolicySection>

    <PolicySection number="08" title="Contact">
      <p>Questions about these terms: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-foreground">{SUPPORT_EMAIL}</a>, or visit the <Link href="/support" className="font-semibold text-foreground">Support</Link> page.</p>
    </PolicySection>

    <PolicySection number="09" title="Business identity">
      <p>skipwait.me is operated by a sole proprietor based in India, trading as skipwait.me.</p>
      <p>The business is not GST-registered. We do not charge GST.</p>
      <ul>
        <li>Address: D-No. 14-440, Laxmi Nagar, Gopalapatnam, Visakhapatnam, Andhra Pradesh 530027, India.</li>
        <li>Phone: <a href="tel:+919513064808" className="font-semibold text-foreground">+91 95130 64808</a> (Mon–Fri, IST business hours).</li>
        <li>Email: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-foreground">{SUPPORT_EMAIL}</a>.</li>
      </ul>
    </PolicySection>

    <PolicySection number="10" title="Governing law">
      <p>These terms are governed by the laws of India.</p>
    </PolicySection>

    <PolicySection number="11" title="Grievance officer">
      <p>Grievance officer: the Proprietor, skipwait.me. Phone <a href="tel:+919513064808" className="font-semibold text-foreground">+91 95130 64808</a>. Email <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-foreground">{SUPPORT_EMAIL}</a>. We acknowledge complaints within 48 hours and resolve them within one month.</p>
    </PolicySection>
  </PolicyPageShell>;
}
