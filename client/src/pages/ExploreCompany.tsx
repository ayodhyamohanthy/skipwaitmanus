import { ArrowLeft, ArrowRight, BriefcaseBusiness, LockKeyhole, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/kit/button";
import { RequestDialog } from "@/components/explore/RequestDialog";
import { getLaunchCompany, type LaunchCompany } from "@/lib/companies";
import { applySeo } from "@/lib/seo";
import { NotFoundContent } from "./NotFound";

export default function ExploreCompany() {
  const [, params] = useRoute("/explore/:slug");
  const company = getLaunchCompany(params?.slug ?? "");
  // Kit: an unknown slug is the app's 404. This route already sits in the shell.
  if (!company) return <NotFoundContent />;
  return <CompanyPage company={company} />;
}

function CompanyPage({ company }: { company: LaunchCompany }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  // Each "Ask for a referral" mounts a fresh dialog, so a new ask starts empty.
  const [draft, setDraft] = useState(0);
  useEffect(() => {
    applySeo({ title: `Referrals at ${company.name}`, description: `Request a free, private introduction to someone at ${company.name}.`, path: `/explore/${company.slug}` });
  }, [company]);
  return <main data-skipwait-screen="explore-company" className="page-content company-page">
    <Link className="back-link" href="/explore"><ArrowLeft />All companies</Link>
    <section className="company-hero"><span className="company-mark large" aria-hidden="true">{company.initials}</span><div><span className="availability"><span /> PEOPLE OPEN TO REFERRAL REQUESTS</span><h1>{company.name}<span className="brand-dot">.</span></h1><p>{company.blurb}</p><div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div></div><Button onClick={() => { setStep(0); setDraft(value => value + 1); setOpen(true); }}>Ask for a referral <ArrowRight /></Button></section>
    <section className="company-detail-grid"><div><span className="eyebrow">BEFORE YOU ASK</span><h2>Bring the role.<br />We’ll guide the request.</h2><p>Find a role on the company’s own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.</p></div><ol className="quality-list"><li><span>1</span><div><strong>Use the exact job link</strong><p>This keeps the request specific and current.</p></div></li><li><span>2</span><div><strong>Make your fit easy to see</strong><p>Share the most relevant experience, not a generic pitch.</p></div></li><li><span>3</span><div><strong>Respect the decision</strong><p>People choose what they can support. A pass stays private.</p></div></li></ol></section>
    <section className="privacy-preview"><LockKeyhole /><div><strong>What is shared, and when?</strong><p>Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.</p></div><Link href="/safety">Read safety guide <ArrowRight /></Link></section>
    <RequestDialog key={draft} company={company} open={open} step={step} onStepChange={setStep} onOpenChange={setOpen} />
  </main>;
}
