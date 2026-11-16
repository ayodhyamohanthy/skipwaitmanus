import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /privacy — Product safeguards and existing processor disclosures under D-345.
 */
export default function TrustPrivacy() {
  return <PolicyPageShell
    screen="privacy"
    eyebrow="PRIVACY POLICY"
    title="Privacy"
    intro="A private handoff, not a public marketplace. skipwait.me is designed to help one Job Seeker and the right verified employee move a referral forward with the least necessary exposure. We do not publish resumes, Referrer identities, or private request conversations."
    updated="16 Nov 2026"
    summary={[
      "Resumes and identities stay private until a referrer accepts your request.",
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
      <p>Your resume is available only to you and the verified employee who accepts your request, while that accepted referral remains active. Claiming a request does not unlock your name or resume. It is never public.</p>
    </PolicySection>

    <PolicySection number="03" title="Conversation opens after acceptance">
      <p>Job Seekers and Referrers can message only after the Referrer accepts that specific request. On acceptance, the Job Seeker and the Referrer see each other's names, and the Referrer receives the resume. Before acceptance, neither is shown.</p>
    </PolicySection>

    <PolicySection number="04" title="Hosted payment checkout">
      <p>Payment details are handled by the payment provider’s checkout. Referral decisions never cost Referrers anything.</p>
    </PolicySection>

    <PolicySection number="05" title="What we collect">
      <p>Account details (name, email), referral content you submit (job links, notes, resumes), and transaction records (provider references, amounts, timestamps). Referrers additionally verify a company email address by one-time code.</p>
      <p>Service providers process information to run skipwait.me: WorkOS runs sign-in (account details and sign-in sessions); ZeptoMail delivers verification and notification emails (your address and message content); Sentry records errors (technical failure details, with redaction for sensitive fields and single-use links); Cloudflare hosts and delivers the site (connection and request information); and Chargebee with Razorpay and PayPal handle payments as section 06 describes.</p>
      <p>When configured, Microsoft Clarity records page interactions and session replay to help us understand use and diagnose problems. It can receive an internal account identifier rather than your email address. Your analytics cookie choice controls analytics storage as described below.</p>
    </PolicySection>

    <PolicySection number="06" title="Payments">
      <p>Card and bank details are entered only on the payment provider’s hosted checkout (Chargebee with Razorpay for India/INR and PayPal internationally). skipwait.me does not store full card numbers. Providers return transaction information such as payment status, provider references, amounts and timestamps so we can reconcile payments, balances and refunds. Legacy referral packs are paused; existing payment records and recovery remain available.</p>
    </PolicySection>

    <PolicySection number="07" title="Cookies & on-device storage">
      <p>A session cookie keeps you signed in, a short-lived security cookie protects admin checks, and an offline cache lets installed app pages open without a network. Local storage also remembers device preferences, including your cookie choice.</p>
      <p>Choose “Accept all” or “Essential only” in the cookie banner, or change your analytics cookie choice in Settings. Analytics storage for Microsoft Clarity is granted only after “Accept all”; advertising storage is denied. Essential-only mode denies analytics storage, but does not disable technical error reporting or necessarily stop all cookieless interaction telemetry.</p>
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
