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
<<<<<<< HEAD

  return (
    <main data-skipwait-screen="explore-company" className="page-content">
      <Link href="/explore" className="back-link"><ArrowLeft />All companies</Link>
      <section className="company-hero">
        <span className="company-mark large" aria-hidden="true">{company.initials}</span>
        <div>
          <span className="availability"><span />People open to referral requests{(jobs?.length ?? 0) > 0 ? ` · ${jobs!.length} open ${jobs!.length === 1 ? "role" : "roles"} listed` : ""}</span>
          <h1>{company.name}<span className="brand-dot">.</span></h1>
          <p>{company.blurb}</p>
          <div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div>
        </div>
        <Link href={`/ask?company=${encodeURIComponent(company.slug)}`} className="brand-button">Ask for a referral <ArrowRight /></Link>
      </section>

      <section className="company-detail-grid">
        <div>
          <span className="eyebrow">Before you ask</span>
          <h2>Bring the role.<br />We&apos;ll guide the request.</h2>
          <p>Find a role on the company&apos;s own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.</p>
        </div>
        <ol className="quality-list">
          <li><span>1</span><div><strong>Use the exact job link</strong><p>This keeps the request specific and current.</p></div></li>
          <li><span>2</span><div><strong>Make your fit easy to see</strong><p>Share the most relevant experience, not a generic pitch.</p></div></li>
          <li><span>3</span><div><strong>Respect the decision</strong><p>People choose what they can support. A pass stays private.</p></div></li>
        </ol>
      </section>

      <section className="privacy-preview">
        <LockKeyhole />
        <div><strong>What is shared, and when?</strong><p>Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.</p></div>
        <Link href="/safety" className="text-link">Read safety guide <ArrowRight className="size-4" /></Link>
      </section>

      <section aria-label={`Open roles at ${company.name}`}>
        <div className="directory-heading"><div><h2>{jobs === null ? "Loading roles…" : jobs.length ? `${jobs.length} open ${jobs.length === 1 ? "role" : "roles"}` : "No listed roles right now"}</h2></div></div>
        {jobs !== null && jobs.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">You can still ask with any job link from {company.name}&apos;s careers site.</p> : null}
        {jobs !== null && jobs.length > 0 ? (
          <ul className="role-list">
            {jobs.map(job => (
              <li key={job.id} className="role-row">
                <div className="min-w-0">
                  <strong className="truncate">{job.title}</strong>
                  <small>{job.location} · {job.workMode} · {job.seniority}</small>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isSignedIn ? (
                    <button type="button" aria-label={saved.has(job.id) ? `Unsave ${job.title}` : `Save ${job.title}`} aria-pressed={saved.has(job.id)} disabled={savingId === job.id} onClick={() => { void toggleSave(job.id); }} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--border)]">
                      {saved.has(job.id) ? <BookmarkCheck className="size-4 text-[var(--primary)]" /> : <Bookmark className="size-4" />}
                    </button>
                  ) : null}
                  {job.targetRoleUrl ? <a href={job.targetRoleUrl} target="_blank" rel="noreferrer" aria-label={`Open ${job.title} posting`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--border)]"><ExternalLink className="size-4" /></a> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </main>
  );
=======
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
>>>>>>> 57d8bbdec3818a6d6bb1dff1e38f9b552b201c81
}
