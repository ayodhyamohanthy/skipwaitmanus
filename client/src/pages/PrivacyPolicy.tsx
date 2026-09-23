import { Link } from "wouter";
import { Lock } from "lucide-react";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { BUSINESS } from "@/lib/business";

/**
 * /privacy-policy — the formal privacy policy (what we collect, why, who
 * processes it, retention and rights). /privacy stays the short trust page.
 * Draft until the founder signs off (POLICIES_PUBLISHED).
 */
export default function PrivacyPolicy() {
  return <PolicyPageShell
    screen="privacy-policy"
    icon={Lock}
    eyebrow="Privacy policy"
    title="What we collect, and why."
    intro={`This policy explains how ${BUSINESS.brand}, operated by ${BUSINESS.operator}, handles your personal information.`}
    updated="September 23, 2026"
  >
    <PolicySection number="01" title="Information we collect">
      <ul>
        <li><strong>Account details:</strong> your name and email address when you sign in.</li>
        <li><strong>Work email:</strong> if you are a Referrer, the company email you verify with a one-time code.</li>
        <li><strong>Referral content:</strong> job links, your resume and other documents you upload, and messages you send after a request is accepted.</li>
        <li><strong>Payment records:</strong> what you bought, the amount and the payment reference. Card, UPI and PayPal details are entered on our payment providers' pages and are never stored by us.</li>
        <li><strong>Technical data:</strong> sign-in sessions, IP address and activity logs used for security and fraud prevention.</li>
      </ul>
    </PolicySection>
    <PolicySection number="02" title="How we use it">
      <p>To run your account, deliver referral requests to verified employees at the right company, process payments and credits, prevent abuse, send service emails about your requests and payments, and help you draft a referral note when you ask for it.</p>
    </PolicySection>
    <PolicySection number="03" title="Who can see it">
      <ul>
        <li>Your resume and request are visible only to you and to verified employees at the company behind the role link. They are never public.</li>
        <li>We use service providers to run the product: sign-in (WorkOS), billing and payments (Chargebee, Razorpay, PayPal), email delivery (ZeptoMail), hosting and storage (Cloudflare, Microsoft Azure), and an AI provider for drafting referral notes you request. They process data only to provide their service to us.</li>
        <li>We do not sell your personal information.</li>
      </ul>
    </PolicySection>
    <PolicySection number="04" title="Cookies">
      <p>We use a sign-in cookie to keep you logged in. We do not use advertising or tracking cookies.</p>
    </PolicySection>
    <PolicySection number="05" title="Keeping and deleting your data">
      <p>We keep your data while your account is active. From <Link href="/settings" className="font-semibold text-black">Settings</Link> you can download your data or ask us to delete your account. Payment records may be kept longer where the law requires it.</p>
    </PolicySection>
    <PolicySection number="06" title="Contact">
      <p>Questions or requests about your data: <a href={`mailto:${BUSINESS.email}`} className="font-semibold text-black">{BUSINESS.email}</a>. See also <Link href="/contact" className="font-semibold text-black">Contact us</Link>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
