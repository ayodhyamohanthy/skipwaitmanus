import { ArrowLeft, ArrowRight, Bell, BriefcaseBusiness, LockKeyhole, MapPin, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/kit/button";
import { RequestDialog } from "@/components/explore/RequestDialog";
import { CompanyNotFoundError, useCompany, type PublicCompany } from "@/lib/companyDirectory";
import { applySeo } from "@/lib/seo";
import { NotFoundContent } from "./NotFound";

export default function ExploreCompany() {
  const [, params] = useRoute("/explore/:slug");
  const slug = params?.slug ?? "";
  const company = useCompany(slug);
  // Kit: an unknown or hidden slug is the app's 404. This route already sits in the shell.
  if (company.error instanceof CompanyNotFoundError) return <NotFoundContent />;
  if (company.data) return <CompanyPage company={company.data} />;
  if (company.isError) {
    return <main data-skipwait-screen="explore-company-error" className="page-content company-page">
      <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
      <section className="no-results" role="alert"><LockKeyhole /><h2>We couldn’t load this company.</h2><p>{company.error.message}</p><div><Button variant="outline" onClick={() => { void company.refetch(); }} disabled={company.isFetching}><RefreshCw />Try again</Button></div></section>
    </main>;
  }
  return <main data-skipwait-screen="explore-company-loading" className="page-content company-page" aria-busy="true">
    <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
    <section className="company-hero" aria-label="Loading company"><span className="company-mark large animate-pulse bg-muted motion-reduce:animate-none" aria-hidden="true" /><div className="space-y-4"><span className="block h-2.5 w-48 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><span className="block h-10 w-3/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /><span className="block h-3 w-4/5 animate-pulse rounded-full bg-muted motion-reduce:animate-none" /></div></section>
  </main>;
}

function CompanyPage({ company }: { company: PublicCompany }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // Each "Ask for a referral" mounts a fresh dialog, so a new ask starts empty.
  const [draft, setDraft] = useState(0);
  useEffect(() => {
    applySeo({ title: `Referrals at ${company.name}`, description: `Request a free, private introduction to someone at ${company.name}.`, path: `/explore/${company.slug}` });
  }, [company.name, company.slug]);
  return <main data-skipwait-screen="explore-company" className="page-content company-page">
    <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
    <section className="company-hero"><span className="company-mark large" aria-hidden="true">{company.initials}</span><div>{company.openToReferrals ? <span className="availability"><span /> PEOPLE OPEN TO REFERRAL REQUESTS</span> : <Link href="/alerts" className="availability text-muted-foreground hover:text-foreground"><Bell className="size-3" aria-hidden="true" />Get told when a door opens</Link>}<h1>{company.name}<span className="brand-dot">.</span></h1><p>{company.blurb}</p><div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div></div><Button onClick={() => { setStep(0); setDraft(value => value + 1); setOpen(true); }}>Ask for a referral <ArrowRight /></Button></section>
    <section className="company-detail-grid"><div><span className="eyebrow">BEFORE YOU ASK</span><h2>Bring the role.<br />We’ll guide the request.</h2><p>Find a role on the company’s own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.</p></div><ol className="quality-list"><li><span>1</span><div><strong>Use the exact job link</strong><p>This keeps the request specific and current.</p></div></li><li><span>2</span><div><strong>Make your fit easy to see</strong><p>Share the most relevant experience, not a generic pitch.</p></div></li><li><span>3</span><div><strong>Respect the decision</strong><p>People choose what they can support. A pass stays private.</p></div></li></ol></section>
    <section className="privacy-preview"><LockKeyhole /><div><strong>What is shared, and when?</strong><p>Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.</p></div><Link href="/safety">Read safety guide <ArrowRight /></Link></section>
    <RequestDialog key={draft} company={company} open={open} step={step} onStepChange={setStep} onOpenChange={setOpen} />
  </main>;
}
