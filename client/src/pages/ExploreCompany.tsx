import { ArrowLeft, ArrowRight, BriefcaseBusiness, LockKeyhole, MapPin } from "lucide-react";
import { useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/kit/button";
import { CompanyRoles } from "@/components/explore/CompanyRoles";
import { RequestDialog } from "@/components/explore/RequestDialog";
import { useCompanyJobs } from "@/components/explore/roleQueries";
import { getLaunchCompany, type LaunchCompany } from "@/lib/companies";

export default function ExploreCompany() {
  const [, params] = useRoute("/explore/:slug");
  const company = getLaunchCompany(params?.slug ?? "");
  if (!company) {
    return <main data-skipwait-screen="explore-missing" className="page-content">
      <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
      <h1 className="mt-4 text-3xl font-semibold">This door isn&apos;t open yet.</h1>
      <p className="mt-2 text-muted-foreground">More companies open as verified referrers join.</p>
    </main>;
  }
  return <CompanyPage company={company} />;
}

function CompanyPage({ company }: { company: LaunchCompany }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const jobs = useCompanyJobs(company);
  const roleCount = jobs.data?.length ?? 0;
  return <main data-skipwait-screen="explore-company" className="page-content company-page">
    <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
    <section className="company-hero"><span className="company-mark large" aria-hidden="true">{company.initials}</span><div><span className="availability"><span /> PEOPLE OPEN TO REFERRAL REQUESTS{roleCount > 0 ? ` · ${roleCount} OPEN ${roleCount === 1 ? "ROLE" : "ROLES"} LISTED` : ""}</span><h1>{company.name}<span className="brand-dot">.</span></h1><p>{company.blurb}</p><div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div></div><Button onClick={() => { setStep(0); setOpen(true); }}>Ask for a referral <ArrowRight /></Button></section>
    <section className="company-detail-grid"><div><span className="eyebrow">BEFORE YOU ASK</span><h2>Bring the role.<br />We’ll guide the request.</h2><p>Find a role on the company’s own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.</p></div><ol className="quality-list"><li><span>1</span><div><strong>Use the exact job link</strong><p>This keeps the request specific and current.</p></div></li><li><span>2</span><div><strong>Make your fit easy to see</strong><p>Share the most relevant experience, not a generic pitch.</p></div></li><li><span>3</span><div><strong>Respect the decision</strong><p>People choose what they can support. A pass stays private.</p></div></li></ol></section>
    <section className="privacy-preview"><LockKeyhole /><div><strong>What is shared, and when?</strong><p>Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.</p></div><Link href="/safety">Read safety guide <ArrowRight /></Link></section>
    <CompanyRoles company={company} />
    <RequestDialog company={company} open={open} step={step} onStepChange={setStep} onOpenChange={setOpen} />
  </main>;
}
