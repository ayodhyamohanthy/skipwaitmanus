import { Link } from "wouter";
import { Info } from "lucide-react";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { BUSINESS } from "@/lib/business";

/** /about — who runs skipwait.me and what it sells. Public, no sign-in. */
export default function About() {
  return <PolicyPageShell
    screen="about"
    icon={Info}
    eyebrow="About us"
    title="Private job referrals, made simpler."
    intro="skipwait.me connects job seekers with verified employees who can refer them for a specific role at their company."
    updated="September 23, 2026"
    status="published"
  >
    <PolicySection number="01" title="What we do">
      <p>A job seeker pastes the link to a role and sends a referral request with their resume. Only employees who have verified their company email at that employer can see and review the request. If a Referrer accepts, the two can message each other privately.</p>
    </PolicySection>
    <PolicySection number="02" title="What we sell">
      <p>Job seekers get free referral credits every month. Extra credits and Pro or Max monthly plans can be bought online. Everything we sell is digital and is delivered to your account instantly. See <Link href="/pricing" className="font-semibold text-black">Pricing</Link>.</p>
    </PolicySection>
    <PolicySection number="03" title="Who runs skipwait.me">
      <p>skipwait.me is owned and operated by <strong>{BUSINESS.operator}</strong>, {BUSINESS.country}. Reach us at <a href={`mailto:${BUSINESS.email}`} className="font-semibold text-black">{BUSINESS.email}</a> or see <Link href="/contact" className="font-semibold text-black">Contact us</Link>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
