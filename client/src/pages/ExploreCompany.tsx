import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, BriefcaseBusiness, ExternalLink, LockKeyhole, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useAuth } from "@/_core/auth";
import { getLaunchCompany, companySlugForJobCompany } from "@/lib/companies";
import { readApiJson } from "@/lib/apiResponse";

type Job = { id: number; title: string; company: string; location: string; seniority: string; workMode: string; targetRoleUrl: string | null };

export default function ExploreCompany() {
  const [, params] = useRoute("/explore/:slug");
  const { isSignedIn, getToken } = useAuth();
  const company = getLaunchCompany(params?.slug ?? "");
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [savingId, setSavingId] = useState<number | null>(null);

  useEffect(() => {
    if (!company) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/jobs?query=${encodeURIComponent(company.name)}`);
        if (!response.ok) { if (active) setJobs([]); return; }
        const payload = (await response.json()) as { jobs?: Job[] };
        const matches = Array.isArray(payload.jobs) ? payload.jobs.filter(job => companySlugForJobCompany(job.company) === company.slug) : [];
        if (active) setJobs(matches);
      } catch { if (active) setJobs([]); }
    })();
    return () => { active = false; };
  }, [company]);

  useEffect(() => {
    if (!isSignedIn) return;
    let active = true;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch("/api/saved-roles", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!response.ok) return;
        const payload = await readApiJson<{ saved?: Array<{ jobId: number }> }>(response, "");
        if (active && Array.isArray(payload.saved)) setSaved(new Set(payload.saved.map(item => item.jobId)));
      } catch { /* save toggles stay unsigned */ }
    })();
    return () => { active = false; };
  }, [getToken, isSignedIn]);

  const toggleSave = async (jobId: number) => {
    if (savingId !== null) return;
    const adding = !saved.has(jobId);
    setSavingId(jobId);
    try {
      const token = await getToken();
      const response = await fetch(`/api/saved-roles/${jobId}`, { method: adding ? "PUT" : "DELETE", credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!response.ok) return;
      setSaved(current => {
        const next = new Set(current);
        if (adding) next.add(jobId); else next.delete(jobId);
        return next;
      });
    } finally { setSavingId(null); }
  };

  if (!company) {
    return (
      <main data-skipwait-screen="explore-missing" className="page-content">
        <Link href="/explore" className="back-link"><ArrowLeft />All companies</Link>
        <h1 className="mt-4 text-3xl font-semibold">This door isn&apos;t open yet.</h1>
        <p className="mt-2 text-[var(--muted-foreground)]">More companies open as verified referrers join.</p>
      </main>
    );
  }

  return (
    <main data-skipwait-screen="explore-company" className="page-content">
      <Link href="/explore" className="back-link"><ArrowLeft />All companies</Link>
      <section className="company-hero">
        <span className="company-mark large" aria-hidden="true">{company.initials}</span>
        <div>
          {(jobs?.length ?? 0) > 0 ? <span className="availability"><span />{jobs!.length} open {jobs!.length === 1 ? "role" : "roles"} listed</span> : null}
          <h1>{company.name}<span className="brand-dot">.</span></h1>
          <p>{company.blurb}</p>
          <div className="company-meta"><span><BriefcaseBusiness />{company.industry}</span><span><MapPin />{company.location}</span></div>
        </div>
        <Link href="/ask" className="brand-button">Ask for a referral <ArrowRight /></Link>
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
}
