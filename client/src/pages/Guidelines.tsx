import { Link } from "wouter";
import { HeartHandshake } from "lucide-react";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /guidelines — Community guidelines.
 *
 * Real rules the product already enforces (free referrals, honest asks,
 * administrator review of reports). Mirrors the screens/web+mobile
 * `39_guidelines` design and the lovable.app footer link. Draft until
 * founder/legal review signs off.
 */
export default function Guidelines() {
  return <PolicyPageShell
    screen="guidelines"
    icon={HeartHandshake}
    eyebrow="Community Guidelines"
    title="Guidelines."
    intro="How seekers and referrers treat each other on SkipWait: free referrals, honest asks, respectful passes, zero tolerance for scams. Breaking these rules can limit or close an account."
    updated="October 8, 2026"
    status="draft"
    sections={[
      { id: "01", label: "Referrals are free" },
      { id: "02", label: "For seekers" },
      { id: "03", label: "For referrers" },
      { id: "04", label: "Respect" },
      { id: "05", label: "Scams and impersonation" },
      { id: "06", label: "What happens if rules are broken" },
    ]}
    footnote="Questions about these guidelines: write to support and a person will reply."
  >
    <section aria-label="Short version" className="rounded-2xl bg-[#f5f5f5] p-5 sm:p-6">
      <p className="text-[11px] font-bold uppercase tracking-[.16em] text-black">Short version</p>
      <ul className="mt-3 space-y-1.5 pl-5 text-sm leading-6 text-[#505050] [&_li]:list-disc [&_strong]:text-black">
        <li><strong>Never pay or charge for a referral.</strong> No money, gifts, or favours — before or after.</li>
        <li><strong>Ask for one specific role, honestly.</strong> Link the official posting and say why you fit.</li>
        <li><strong>Passing is always okay.</strong> Pressure is never okay.</li>
        <li><strong>Report anything that feels off.</strong> Reporting is confidential.</li>
      </ul>
    </section>
    <PolicySection number="01" title="Referrals are free">
      <p>No money, gifts, or favours change hands — before or after a referral. If anyone asks for payment, do not pay. <Link href="/report" className="font-semibold text-black">Report it</Link> — reports are confidential.</p>
    </PolicySection>

    <PolicySection number="02" title="For seekers">
      <ul>
        <li>Link the official job posting and write a short, specific note about why you fit that role.</li>
        <li>Be truthful about experience, location, and work authorization.</li>
        <li>Do not send identical asks in bulk or follow up more than once when there is no reply.</li>
      </ul>
    </PolicySection>

    <PolicySection number="03" title="For referrers">
      <ul>
        <li>Refer only through your employer&apos;s official process, and only people you are comfortable recommending.</li>
        <li>Never promise interviews, offers, or special handling of a profile.</li>
        <li>Keep your work-email verification current so requests reach the right company.</li>
      </ul>
    </PolicySection>

    <PolicySection number="04" title="Respect">
      <p>No harassment, discrimination, sexual content, or contacting people off-platform without their agreement. Passing on a request is always okay — pressure is never okay.</p>
    </PolicySection>

    <PolicySection number="05" title="Scams and impersonation">
      <p>Fake jobs, requests for fees or ID documents, and pretending to work somewhere you do not lead to immediate removal.</p>
    </PolicySection>

    <PolicySection number="06" title="What happens if rules are broken">
      <p>Depending on severity: a warning, a temporary restriction, or a ban. Every decision is reviewed by a person and can be appealed within 14 days through the <Link href="/support" className="font-semibold text-black">Support</Link> page or <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-black">{SUPPORT_EMAIL}</a>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
