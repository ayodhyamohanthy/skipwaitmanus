import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";
import { MONEY_SENTENCE } from "@shared/moneyCopy";

/**
 * /guidelines — Community guidelines.
 *
 * Kit v4 text verbatim (app/src/routes/guidelines.tsx) in the kit legal layout:
 * short version, six numbered sections as plain paragraphs, no intro paragraph.
 * Owner decision (Oct 9 2026): Guidelines takes the kit text and is published.
 * D-063: section 01 states what asking costs instead of calling referrals free.
 */
export default function Guidelines() {
  return <PolicyPageShell
    screen="guidelines"
    eyebrow="COMMUNITY GUIDELINES"
    title="Guidelines"
    description="How seekers and referrers treat each other on SkipWait: no money between them, honest asks, respectful passes, zero tolerance for scams."
    updated="18 Oct 2026"
    summary={[
      "Never pay a referrer, and never ask a seeker for money.",
      "Ask for one specific role, honestly.",
      "Passing is always okay. Pressure is never okay.",
      "Report anything that feels off — it's confidential.",
    ]}
    sections={[
      { id: "01", label: "Referrers are never paid" },
      { id: "02", label: "For seekers" },
      { id: "03", label: "For referrers" },
      { id: "04", label: "Respect" },
      { id: "05", label: "Scams and impersonation" },
      { id: "06", label: "What happens if rules are broken" },
    ]}
  >
    <PolicySection number="01" title="Referrers are never paid">
      <p>{MONEY_SENTENCE}</p>
      <p>No money, gifts, or favours — before or after. Seekers: if anyone asks for payment, report it. Referrers: a thank-you note is the only acceptable reward.</p>
    </PolicySection>

    <PolicySection number="02" title="For seekers">
      <p>Link the official job posting. Write a short, specific note. Be truthful about experience and work authorization.</p>
      <p>Don&apos;t send identical asks in bulk or follow up more than once if there&apos;s no reply.</p>
    </PolicySection>

    <PolicySection number="03" title="For referrers">
      <p>Refer only through your employer&apos;s official process and only people you&apos;re comfortable recommending.</p>
      <p>Don&apos;t promise outcomes, interview slots, or &apos;pushing&apos; a profile. Keep your verification current.</p>
    </PolicySection>

    <PolicySection number="04" title="Respect">
      <p>No harassment, discrimination, sexual content, or contacting people off-platform without their agreement.</p>
    </PolicySection>

    <PolicySection number="05" title="Scams and impersonation">
      <p>Fake jobs, requests for fees or ID documents, and pretending to work somewhere lead to immediate removal.</p>
    </PolicySection>

    <PolicySection number="06" title="What happens if rules are broken">
      <p>Depending on severity: a warning, a temporary restriction, or a ban. Every decision is reviewed by a person and can be appealed within 14 days.</p>
    </PolicySection>
  </PolicyPageShell>;
}
