// D-086.ui: the public demand list in the /explore browse state. The server
// orders it; this renders that order and nothing else, and nothing at all while
// the switch is off or a read fails (packet §5.2).
import { Link } from "wouter";
import { GoalNum } from "@/components/goal/GoalNum";
import { trackClarityEvent } from "@/lib/clarity";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { COMPANY_DEMAND_PUBLIC_ENABLED, DEMAND_LIST_HEADING, DEMAND_UNLISTED_EMPLOYEE_LINE, DEMAND_UNLISTED_SEEKER_LINE, demandCountLine, demandFewLine } from "@shared/companyDemand";
import { useCompanyDemandList } from "./useCompanyDemand";

/** One copy string, with its instruction as the link so no sentence is retyped. */
function SplitLine({ copy, href, onNavigate }: { copy: string; href: string; onNavigate?: () => void }) {
  const splitAt = copy.lastIndexOf("?");
  return (
    <p className="text-g-meta text-g-ink-2">
      {splitAt === -1 ? null : <>{copy.slice(0, splitAt + 1)} </>}
      <Link className="text-g-ink underline underline-offset-2" href={href} onClick={onNavigate}>
        {splitAt === -1 ? copy : copy.slice(splitAt + 2)}
      </Link>
    </p>
  );
}

function EntryText({ name, people }: { name: string; people: number }) {
  const sentence = demandCountLine(name, people);
  const splitAt = sentence.indexOf(" ");
  return <><GoalNum>{sentence.slice(0, splitAt)}</GoalNum>{sentence.slice(splitAt)}</>;
}

export function CompanyDemandList() {
  const { data } = useCompanyDemandList();
  if (!COMPANY_DEMAND_PUBLIC_ENABLED || !data || data.length === 0) return null;
  return (
    <section data-testid="company-demand-list" aria-label={DEMAND_LIST_HEADING} className="space-y-3">
      <h2 className="text-g-heading text-g-ink">{DEMAND_LIST_HEADING}</h2>
      <ul className="space-y-2 text-g-body">
        {data.map(entry => (
          <li key={entry.slug}>
            <Link className="text-g-ink underline underline-offset-2" href={`/explore/${entry.slug}`}>
              {entry.demand.state === "count"
                ? <EntryText name={entry.name} people={entry.demand.people} />
                : demandFewLine(entry.name)}
            </Link>
          </li>
        ))}
      </ul>
      <SplitLine copy={DEMAND_UNLISTED_SEEKER_LINE} href="/ask" />
      <SplitLine copy={DEMAND_UNLISTED_EMPLOYEE_LINE} href={referrerSignInHref()} onNavigate={() => trackClarityEvent("demand_help_clicked")} />
    </section>
  );
}
