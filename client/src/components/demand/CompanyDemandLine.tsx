// D-086.ui: the public demand line on a company page. It renders the server's
// payload only, and nothing at all while the switch is off, while loading, on a
// failed read, or at zero demand (packet §5.2).
import { GoalNum } from "@/components/goal/GoalNum";
import { trackClarityEvent } from "@/lib/clarity";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { COMPANY_DEMAND_PUBLIC_ENABLED, demandBonusLine, demandCountLine, demandFewLine, demandHelpLine } from "@shared/companyDemand";
import { Link } from "wouter";
import { useCompanyDemand } from "./useCompanyDemand";

/** The count sentence with its figure in mono (DESIGN.md rule 4). */
function CountedSentence({ companyName, people }: { companyName: string; people: number }) {
  const sentence = demandCountLine(companyName, people);
  const splitAt = sentence.indexOf(" ");
  return (
    <p data-testid="demand-sentence" className="text-g-body text-g-ink">
      <GoalNum>{sentence.slice(0, splitAt)}</GoalNum>{sentence.slice(splitAt)}
    </p>
  );
}

/** One copy string, with its instruction as the link so no sentence is retyped. */
function HelpLine({ companyName }: { companyName: string }) {
  const copy = demandHelpLine(companyName);
  const splitAt = copy.lastIndexOf("?");
  return (
    <p data-testid="demand-help-line" className="text-g-meta text-g-ink-2">
      {splitAt === -1 ? null : <>{copy.slice(0, splitAt + 1)} </>}
      <Link
        className="text-g-ink underline underline-offset-2"
        href={referrerSignInHref()}
        onClick={() => trackClarityEvent("demand_help_clicked")}
      >
        {splitAt === -1 ? copy : copy.slice(splitAt + 2)}
      </Link>
    </p>
  );
}

export function CompanyDemandLine({ slug, companyName }: { slug: string; companyName: string }) {
  const { data } = useCompanyDemand(slug);
  if (!COMPANY_DEMAND_PUBLIC_ENABLED || !data || data.state === "none") return null;
  return (
    <section data-testid="company-demand-line" aria-label={`Demand at ${companyName}`} className="space-y-2">
      {data.state === "count"
        ? <CountedSentence companyName={companyName} people={data.people} />
        : <p data-testid="demand-sentence" className="text-g-body text-g-ink">{demandFewLine(companyName)}</p>}
      <HelpLine companyName={companyName} />
      <p data-testid="demand-bonus-line" className="text-g-meta text-g-ink-3">{demandBonusLine(companyName)}</p>
    </section>
  );
}
