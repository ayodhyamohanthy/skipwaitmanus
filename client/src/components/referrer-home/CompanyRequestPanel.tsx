// "Request a company" side of /invite (kit v4 invite.tsx). Files a real
// seeker-demand company suggestion; it never creates a referral request.
// The kit's "Work function" select is not ported: the suggestion contract has
// no function field, and collecting a value that is then dropped would mislead.
import { Building2, Check } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { LAUNCH_COMPANIES } from "@/lib/companies";
import { requestCompany, type TokenSource } from "./referrerData";

export function CompanyRequestPanel({ fetchToken, onOtherPath }: { fetchToken: TokenSource; onOtherPath: () => void }) {
  const [company, setCompany] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const request = useMutation({ mutationFn: (name: string) => requestCompany(fetchToken, name) });
  const name = company.trim();
  const listed = LAUNCH_COMPANIES.find(item => item.name.toLowerCase() === name.toLowerCase());
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (listed || request.isPending) return;
    if (name.length < 2) { setTooShort(true); return; }
    request.mutate(name);
  };

  if (request.isSuccess) {
    return (
      <section className="invite-panel" aria-label="Request a company">
        <div className="request-complete" role="status">
          <span className="preview-check"><Check /></span>
          <h2>That’s the growth loop.</h2>
          <p>We saved your request for {request.data.companyName}. It does not create a referral request, and nothing is posted publicly.</p>
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
      <label>Company name<input value={company} maxLength={160} onChange={event => { setCompany(event.target.value); setTooShort(false); if (request.isError) request.reset(); }} placeholder="Search or enter a company" list="launch-companies" autoComplete="organization" aria-invalid={tooShort} /><datalist id="launch-companies">{LAUNCH_COMPANIES.map(item => <option key={item.slug} value={item.name} />)}</datalist></label>
      {listed ? <p className="flex items-start gap-2"><Building2 className="mt-1 size-4 shrink-0" /><span>{listed.name} already has a door on SkipWait. <Link href={`/explore/${listed.slug}`} className="text-link">Open it</Link></span></p> : null}
      {tooShort ? <p role="alert" className="font-semibold text-destructive">Name the company you want to see.</p> : null}
      {request.isError ? <p role="alert" className="font-semibold text-destructive">{request.error.message || "We could not save this request. Try again."}</p> : null}
      <Button type="submit" disabled={request.isPending}>{request.isPending ? "Sending…" : "Send company request"}</Button>
    </form>
  );
}
