import { Link } from "wouter";
import { Mail } from "lucide-react";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { BUSINESS } from "@/lib/business";

/** /contact — operator identity and how to reach us. Public, no sign-in. */
export default function Contact() {
  return <PolicyPageShell
    screen="contact"
    icon={Mail}
    eyebrow="Contact us"
    title="Talk to a person."
    intro="Questions about a payment, a referral request, or your account? Email us and a person will reply."
    updated="September 23, 2026"
    status="published"
  >
    <PolicySection number="01" title="Business details">
      <ul>
        <li><strong>Operated by:</strong> {BUSINESS.operator}</li>
        <li><strong>Brand:</strong> {BUSINESS.brand}</li>
        {BUSINESS.address ? <li><strong>Address:</strong> {BUSINESS.address}</li> : null}
        <li><strong>Country:</strong> {BUSINESS.country}</li>
        <li><strong>Phone:</strong> <a href={BUSINESS.phoneHref} className="font-semibold text-black">{BUSINESS.phone}</a> ({BUSINESS.hours})</li>
        <li><strong>Email:</strong> <a href={`mailto:${BUSINESS.email}`} className="font-semibold text-black">{BUSINESS.email}</a></li>
      </ul>
    </PolicySection>
    <PolicySection number="02" title="Response time">
      <p>We reply to emails within 2 business days. For payment problems, include your payment reference so we can find it quickly.</p>
    </PolicySection>
    <PolicySection number="03" title="Helpful links">
      <p>See <Link href="/support" className="font-semibold text-black">Support</Link> for self-serve help, <Link href="/refunds" className="font-semibold text-black">Refunds &amp; cancellation</Link>, and <Link href="/pricing" className="font-semibold text-black">Pricing</Link>. Hiring for a company? Start at <Link href="/employer" className="font-semibold text-black">Hire on skipwait.me</Link>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
