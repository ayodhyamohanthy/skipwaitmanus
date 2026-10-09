import { Link } from "wouter";
import { PolicyPageShell, PolicySection, SUPPORT_EMAIL } from "@/components/PolicyPageShell";

/**
 * /guidelines — Community guidelines.
 *
 * Real rules the product already enforces (free referrals, honest asks,
 * administrator review of reports) in the kit v4 legal layout
 * (app/src/routes/guidelines.tsx). The commitments text is pending a founder
 * decision, so it stays as written and the page keeps its draft status.
 */
export default function Guidelines() {
  return <PolicyPageShell
    screen="guidelines"
    eyebrow="COMMUNITY GUIDELINES"
    title="Guidelines"
    intro="How seekers and referrers treat each other on SkipWait: free referrals, honest asks, respectful passes, zero tolerance for scams. Breaking these rules can limit or close an account."
    updated="8 Oct 2026"
    status="draft"
    summary={[
      "Never pay or charge for a referral. No money, gifts, or favours — before or after.",
      "Ask for one specific role, honestly. Link the official posting and say why you fit.",
      "Passing is always okay. Pressure is never okay.",
      "Report anything that feels off. Reporting is confidential.",
    ]}
    sections={[
      { id: "01", label: "Referrals are free" },
      { id: "02", label: "For seekers" },
      { id: "03", label: "For referrers" },
      { id: "04", label: "Respect" },
      { id: "05", label: "Scams and impersonation" },
      { id: "06", label: "What happens if rules are broken" },
    ]}
  >
    <PolicySection number="01" title="Referrals are free">
      <p>No money, gifts, or favours change hands — before or after a referral. If anyone asks for payment, do not pay. <Link href="/report" className="font-semibold text-foreground">Report it</Link> — reports are confidential.</p>
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
      <p>Depending on severity: a warning, a temporary restriction, or a ban. Every decision is reviewed by a person and can be appealed within 14 days through the <Link href="/support" className="font-semibold text-foreground">Support</Link> page or <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold text-foreground">{SUPPORT_EMAIL}</a>.</p>
    </PolicySection>
  </PolicyPageShell>;
}
