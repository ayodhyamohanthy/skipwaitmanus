// "Request a company" side of /invite (kit v4 invite.tsx). Files a real
// seeker-demand vote; it never creates a referral request. Votes are per
// seeker, so a company already asked for by someone else is still a new vote
// here, and asking twice yourself returns your existing request.
import { Building2, Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { JOB_FUNCTIONS, parseJobFunction, type JobFunction } from "@shared/jobFunctions";
import { Button } from "@/components/kit/button";
import { findListedCompanyByName, useCompanyDirectory } from "@/lib/companyDirectory";
import { requestCompany, type TokenSource } from "./referrerData";

export function CompanyRequestPanel({ fetchToken, onOtherPath }: { fetchToken: TokenSource; onOtherPath: () => void }) {
  const directory = useCompanyDirectory();
  const companies = directory.data?.companies ?? [];
  const [company, setCompany] = useState("");
  const [jobFunction, setJobFunction] = useState<JobFunction | null>(null);
  const [tooShort, setTooShort] = useState(false);
  const request = useMutation({ mutationFn: ({ name, jobFunction: fn }: { name: string; jobFunction: JobFunction | null }) => requestCompany(fetchToken, name, fn) });
  const name = company.trim();
  const listed = findListedCompanyByName(companies, name, "exact");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (listed || request.isPending) return;
    if (name.length < 2) { setTooShort(true); return; }
    request.mutate({ name, jobFunction });
  };

  if (request.isSuccess) {
    return (
      <section className="invite-panel" aria-label="Request a company">
        <div className="request-complete" role="status">
          <span className="preview-check"><Check /></span>
          <h2>That’s the growth loop.</h2>
          <p>{request.data.alreadyRecorded
            ? `You had already asked for ${request.data.companyName}, so your vote counts once. It does not create a referral request, and nothing is posted publicly.`
            : `We saved your request for ${request.data.companyName}. It does not create a referral request, and nothing is posted publicly.`}</p>
          <Button onClick={onOtherPath}>Try the other path</Button>
        </div>
      </section>
    );
  }

  return (
    <form className="invite-panel" aria-label="Request a company" onSubmit={submit} noValidate>
      <span className="eyebrow">SEEKER DEMAND</span>
      <h2>Tell us where you want to work.</h2>
      <p>Your interest helps prioritize where to welcome verified referrers next. It does not create a referral request.</p>
      <label>Company name<input value={company} maxLength={160} onChange={event => { setCompany(event.target.value); setTooShort(false); if (request.isError) request.reset(); }} placeholder="Search or enter a company" list="launch-companies" autoComplete="organization" aria-invalid={tooShort} /><datalist id="launch-companies">{companies.map(item => <option key={item.slug} value={item.name} />)}</datalist></label>
      <label>Work function<select aria-label="Work function" value={jobFunction ?? ""} onChange={event => { setJobFunction(parseJobFunction(event.target.value)); if (request.isError) request.reset(); }}>
        <option value="">Choose a function</option>
        {JOB_FUNCTIONS.map(item => <option key={item} value={item}>{item}</option>)}
      </select></label>
      {directory.isError ? <p className="text-muted-foreground">We couldn’t load the companies already on SkipWait, so suggestions are off. You can still send your request.</p> : null}
      {listed ? <p className="flex items-start gap-2"><Building2 className="mt-1 size-4 shrink-0" /><span>{listed.name} already has a door on SkipWait. <Link href={`/explore/${listed.slug}`} className="text-link">Open it</Link></span></p> : null}
      {tooShort ? <p role="alert" className="font-semibold text-destructive">Name the company you want to see.</p> : null}
      {request.isError ? <p role="alert" className="font-semibold text-destructive">{request.error.message || "We could not save this request. Try again."}</p> : null}
      <Button type="submit" disabled={request.isPending}>{request.isPending ? "Sending…" : "Send company request"}</Button>
    </form>
  );
}
