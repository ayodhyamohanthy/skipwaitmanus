import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { pageMeta } from "@/lib/page-meta";

export const Route = createFileRoute("/guidelines")({
  head: () => pageMeta("Community guidelines", "How seekers and referrers treat each other on SkipWait: free referrals, honest asks, respectful passes, zero tolerance for scams."),
  component: () => <LegalPage eyebrow="COMMUNITY GUIDELINES" title="Guidelines" updated="6 Oct 2026" summary={["Never pay or charge for a referral.", "Ask for one specific role, honestly.", "Passing is always okay. Pressure is never okay.", "Report anything that feels off — it's confidential."]} sections={[
    { id: "free", title: "Referrals are free", body: ["No money, gifts, or favours — before or after. Seekers: if anyone asks for payment, report it. Referrers: a thank-you note is the only acceptable reward."] },
    { id: "seekers", title: "For seekers", body: ["Link the official job posting. Write a short, specific note. Be truthful about experience and work authorization.", "Don't send identical asks in bulk or follow up more than once if there's no reply."] },
    { id: "referrers", title: "For referrers", body: ["Refer only through your employer's official process and only people you're comfortable recommending.", "Don't promise outcomes, interview slots, or 'pushing' a profile. Keep your verification current."] },
    { id: "respect", title: "Respect", body: ["No harassment, discrimination, sexual content, or contacting people off-platform without their agreement."] },
    { id: "scams", title: "Scams and impersonation", body: ["Fake jobs, requests for fees or ID documents, and pretending to work somewhere lead to immediate removal."] },
    { id: "enforcement", title: "What happens if rules are broken", body: ["Depending on severity: a warning, a temporary restriction, or a ban. Every decision is reviewed by a person and can be appealed within 14 days."] },
  ]} />,
});
