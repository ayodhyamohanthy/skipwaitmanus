import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /privacy — Privacy & trust, in the kit v4 legal layout
 * (app/src/routes/privacy.tsx). Every safeguard and disclosure is the live
 * text, restructured into numbered sections; nothing here describes a control
 * the product does not have.
 */
export default function TrustPrivacy() {
  return <PolicyPageShell
    screen="privacy"
    eyebrow="PRIVACY POLICY"
    title="Privacy"
    intro="A private handoff, not a public marketplace. skipwait.me is designed to help one Job Seeker and the right verified employee move a referral forward with the least necessary exposure. We do not publish resumes, Referrer identities, or private request conversations."
    updated="8 Oct 2026"
    summary={[
      "Resumes and identities stay private until a referrer accepts your ask.",
      "Requests reach only verified employees of the company behind the role.",
      "Payments run on hosted checkout; skipwait.me never sees card numbers.",
      "Export or delete your data anytime from Settings.",
    ]}
    sections={[
      { id: "01", label: "Company-matched by design" },
      { id: "02", label: "Documents stay private" },
      { id: "03", label: "Conversation opens after acceptance" },
      { id: "04", label: "Hosted payment checkout" },
      { id: "05", label: "What we collect" },
      { id: "06", label: "Payments" },
      { id: "07", label: "Cookies & on-device storage" },
      { id: "08", label: "Retention & your rights" },
      { id: "09", label: "Your account controls" },
    ]}
    footnote="This page explains product safeguards and available controls. It is not a substitute for jurisdiction-specific legal notices or formal compliance certification."
  >
    <PolicySection number="01" title="Company-matched by design">
      <p>A referral request is visible only to verified employees at the company behind the role link.</p>
    </PolicySection>

    <PolicySection number="02" title="Documents stay private">
      <p>Your resume is available only to you and the Referrer assigned to your request. It is never public.</p>
    </PolicySection>

    <PolicySection number="03" title="Conversation opens after acceptance">
      <p>Job Seekers and Referrers can message only after the Referrer accepts that specific request.</p>
    </PolicySection>

    <PolicySection number="04" title="Hosted payment checkout">
      <p>Payment details are handled by the payment provider’s checkout. Referral decisions are always free for Referrers.</p>
    </PolicySection>

    <PolicySection number="05" title="What we collect">
      <p>Account details (name, email), referral content you submit (job links, notes, resumes), and transaction records (provider references, amounts, timestamps). Referrers additionally verify a company email address by one-time code.</p>
    </PolicySection>

    <PolicySection number="06" title="Payments">
      <p>Card and bank details are entered only on the payment provider’s hosted checkout (Chargebee with Razorpay for India/INR and PayPal internationally). skipwait.me never sees, touches, or stores card numbers; providers share back only the payment result and reference needed to credit your account.</p>
    </PolicySection>

    <PolicySection number="07" title="Cookies & on-device storage">
      <p>A session cookie keeps you signed in, a short-lived security cookie protects admin checks, and an offline cache lets installed app pages open without a network. No advertising cookies and no cross-site tracking.</p>
    </PolicySection>

    <PolicySection number="08" title="Retention & your rights">
      <p>Account and referral data is kept while your account is active and as needed for fraud prevention and financial records. You can export your data or request account deletion review anytime from Settings; payment disputes follow the <Link href="/refunds" className="font-semibold text-foreground">Refunds & cancellation policy</Link>. Grievance and privacy questions: <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-foreground">{SUPPORT_EMAIL}</a>.</p>
    </PolicySection>

    <PolicySection number="09" title="Your account controls">
      <p>When signed in, Settings gives you a copy of the personal data held for your account and lets you request account deletion review. Requests are reviewed rather than silently deleting records that may need reconciliation or security handling.</p>
      <Button asChild variant="outline" className="text-foreground"><Link href="/settings">Open privacy controls</Link></Button>
    </PolicySection>
  </PolicyPageShell>;
}
