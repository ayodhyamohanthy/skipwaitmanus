import { ScrollText } from "lucide-react";
import { Link } from "wouter";
import { PolicyPageShell, PolicySection } from "@/components/PolicyPageShell";

/**
 * Kit v4 `/guidelines` (screens/web/39_guidelines__default.png,
 * app/src/routes/guidelines.tsx).
 *
 * Reuses the live PolicyPageShell rather than porting the kit's `LegalPage`
 * component: the kit ships its own shell, but DESIGN.md says reuse components
 * and never restyle, and the live shell already carries the reading-page
 * layout, policy footer nav and SEO wiring.
 *
 * The rules restate what the product already enforces — referrals are free,
 * passing is private, reports are confidential and appealable — which is now
 * literally true: /report and the 14-day appeal window exist as of d7506a7a.
 */
export default function Guidelines() {
  return (
    <PolicyPageShell
      screen="guidelines"
      icon={ScrollText}
      eyebrow="Community guidelines"
      title="How we treat each other here."
      intro="Short version: never pay or charge for a referral, ask honestly, and passing is always allowed. These are the rules both sides agree to, and what happens when they are broken."
      updated="October 6, 2026"
    >
      <PolicySection number="1" title="Referrals are free">
        <p>No money, gifts, or favours — before or after. Seekers: if anyone asks for payment, <Link href="/report" className="text-link">report it</Link>. Referrers: a thank-you note is the only acceptable reward.</p>
      </PolicySection>
      <PolicySection number="2" title="For seekers">
        <p>Link the official job posting. Write a short, specific note. Be truthful about experience and work authorization.</p>
        <p>Don't send identical asks in bulk, or follow up more than once if there's no reply.</p>
      </PolicySection>
      <PolicySection number="3" title="For referrers">
        <p>Refer only through your employer's official process, and only people you're comfortable recommending.</p>
        <p>Don't promise outcomes, interview slots, or "pushing" a profile. Keep your verification current.</p>
      </PolicySection>
      <PolicySection number="4" title="Respect">
        <p>No harassment, discrimination, sexual content, or contacting people off-platform without their agreement.</p>
      </PolicySection>
      <PolicySection number="5" title="Scams and impersonation">
        <p>Fake jobs, requests for fees or ID documents, and pretending to work somewhere lead to immediate removal.</p>
      </PolicySection>
      <PolicySection number="6" title="What happens if rules are broken">
        <p>Depending on severity: a warning, a temporary restriction, or a ban. Every decision is reviewed by a person and can be appealed within 14 days.</p>
      </PolicySection>
    </PolicyPageShell>
  );
}
