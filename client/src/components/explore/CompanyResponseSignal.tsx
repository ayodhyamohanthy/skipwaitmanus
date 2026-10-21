import { useCompanyResponseSignal } from "@/lib/companyResponseSignal";
import { COMPANY_SIGNAL_COPY as copy } from "@shared/companySignalCopy";

/** D-104: company-level aggregates only. Renders nothing while the flag is off (server 404) or on any failure. */
export function CompanyResponseSignal({ slug }: { slug: string }) {
  const { data } = useCompanyResponseSignal(slug);
  if (!data) return null;
  return <section className="company-signal" data-testid="company-response-signal" aria-label="Company responsiveness">
    <p>{copy.intro}</p>
    {data.state === "shown"
      ? <dl>
        <div><dt>{copy.usualFirstReply}</dt><dd>{data.usualFirstReplyDays} {data.usualFirstReplyDays === 1 ? copy.day : copy.days}</dd></div>
        <div><dt>{copy.answeredThisMonth}</dt><dd>{data.answeredThisMonth}</dd></div>
        <div><dt>{copy.referrersInside}</dt><dd>{data.referrersInside}</dd></div>
      </dl>
      : <p className="company-signal-empty">{copy.insufficient}</p>}
    <small>{copy.source}</small>
    <small>{copy.disclaimer}</small>
  </section>;
}
