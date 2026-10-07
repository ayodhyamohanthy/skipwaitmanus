import { AlertCircle, ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { SignInButton, useAuth } from "@/_core/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";
import { readApiJson } from "@/lib/apiResponse";
import { applySeo, jobsJsonLd } from "@/lib/seo";
import { readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl } from "@shared/referralUrl";

type JobRow = { id: number; title: string; company: string; location: string; seniority: string; workMode: string; targetRoleUrl?: string | null };
export function uniqueJobMetadata(job:JobRow){const seen=new Set<string>();return [job.company,job.location,job.seniority,job.workMode].map(v=>v?.trim()).filter((v):v is string=>Boolean(v)&&!seen.has(v.toLowerCase())&&(seen.add(v.toLowerCase()),true));}

export default function JobExplorer() {
  const { isSignedIn } = useAuth();
  const [, go] = useLocation();
  // SEO contract: the site SearchAction advertises /jobs?q={term} and the
  // sitemap deep-links /jobs?job={id}. Seed the search state and honour the
  // deep link so crawler traffic lands on the same filtered, scrollable list
  // a user gets from in-site search.
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialQuery = urlParams.get("q") ?? urlParams.get("query") ?? "";
  const initialLocation = urlParams.get("location") ?? "";
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [highlightJobId, setHighlightJobId] = useState<number | null>(() => { const jobParam = Number(urlParams.get("job")); return Number.isInteger(jobParam) && jobParam > 0 ? jobParam : null; });
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInGate, setSignInGate] = useState(false);

  const loadJobs = async (nextQuery = query, nextLocation = location) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (nextQuery.trim()) params.set("query", nextQuery.trim()); if (nextLocation.trim()) params.set("location", nextLocation.trim());
      // Keep shareable canonical search URLs (the SearchAction advertises ?q=).
      const canonicalParams = new URLSearchParams(); if (nextQuery.trim()) canonicalParams.set("q", nextQuery.trim()); if (nextLocation.trim()) canonicalParams.set("location", nextLocation.trim());
      const canonicalQuery = canonicalParams.toString();
      window.history.replaceState(null, "", canonicalQuery ? `/jobs?${canonicalQuery}` : "/jobs");
      const response = await fetch(`/api/jobs${params.size ? `?${params.toString()}` : ""}`);
      const payload = await readApiJson<{ jobs?: JobRow[]; error?: string }>(response, "We could not load the job list");
      if (!response.ok) throw new Error(payload.error || "We could not load the job list");
      setJobs(payload.jobs || []);
      applySeo({ title: "Browse roles worth a referral", description: "Search published roles and request a private referral from a verified employee. Referrers stay anonymous.", path: "/jobs", jsonLd: jobsJsonLd(payload.jobs || []) });
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "We could not load the job list"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void loadJobs(); }, []);
  useEffect(() => {
    if (!isSignedIn) { setSavedIds(new Set()); return; }
    void fetch("/api/saved-roles", { credentials: "include" }).then(async response => {
      if (!response.ok) return;
      const payload = await readApiJson<{ saved?: Array<{ jobId: number }> }>(response, "Saved roles are unavailable right now");
      setSavedIds(new Set((payload.saved ?? []).map(item => item.jobId)));
    }).catch(() => undefined);
  }, [isSignedIn]);
  // Scroll to and highlight the job requested via /jobs?job={id} deep link.
  useEffect(() => {
    if (highlightJobId == null) return;
    const timer = setTimeout(() => {
      const node = document.getElementById(`job-${highlightJobId}`);
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    return () => clearTimeout(timer);
  }, [jobs, highlightJobId]);

  const toggleSave = async (jobId: number) => {
    if (!isSignedIn) { setSignInGate(true); return; }
    const wasSaved = savedIds.has(jobId);
    setSavedIds(current => { const next = new Set(current); if (wasSaved) next.delete(jobId); else next.add(jobId); return next; });
    try {
      const response = await fetch(`/api/saved-roles/${jobId}`, { method: wasSaved ? "DELETE" : "PUT", credentials: "include" });
      const payload = await readApiJson<{ saved?: boolean; error?: string }>(response, "We could not update your saved roles");
      if (!response.ok) throw new Error(payload.error || "We could not update your saved roles");
    } catch (toggleError) {
      setSavedIds(current => { const next = new Set(current); if (wasSaved) next.add(jobId); else next.delete(jobId); return next; });
      toast(toggleError instanceof Error ? toggleError.message : "We could not update your saved roles");
    }
  };

  const requestReferral = (job: JobRow) => {
    if (!isValidTargetRoleUrl(job.targetRoleUrl)) return;
    try {
      const targetUrl = normalizeTargetRoleUrl(job.targetRoleUrl!);
      const draft = readReferralDraft();
      if (normalizeTargetRoleUrl(draft?.targetUrl || "") !== targetUrl) {
        localStorage.removeItem("bridge-target-compensation");
        localStorage.removeItem("bridge-company-confirmation");
      }
      saveReferralDraft({ name: draft?.name || "", targetUrl });
      localStorage.setItem("bridge-target-url", targetUrl);
      localStorage.removeItem("skipwait-job-source");
      go("/start");
    } catch {
      toast("We could not save this job link on your device. Copy the listing URL and paste it to continue.");
    }
  };

  const visibleJobs = useMemo(() => (savedOnly ? jobs.filter(job => savedIds.has(job.id)) : jobs), [jobs, savedOnly, savedIds]);

  if (signInGate) return <main data-skipwait-screen="job-explorer" className="h-dvh min-h-dvh overflow-hidden bg-white px-5 py-4 text-black"><div className="mx-auto flex h-full max-w-xl flex-col"><header className="flex h-10 items-center"><button type="button" onClick={() => setSignInGate(false)} className="inline-flex min-h-11 min-w-11 items-center gap-1 text-sm font-semibold text-muted-foreground"><ArrowLeft className="h-4 w-4" />Back</button></header><section className="flex min-h-0 flex-1 items-center"><div className="w-full rounded-xl border border-border bg-white p-5 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-accent text-black"><Bookmark className="h-5 w-5" /></span><h1 className="mt-5 text-2xl font-semibold tracking-[-.04em]">Sign in to save roles.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Browsing is open to everyone. Sign in to keep the roles you like and request referrals.</p><SignInButton><button type="button" className="mt-6 w-full rounded-lg bg-primary px-5 py-3 text-sm font-bold text-white">Sign in to continue</button></SignInButton></div></section></div></main>;

  return <main data-skipwait-screen="job-explorer" className="min-h-dvh bg-white px-5 py-4 text-black"><div className="mx-auto flex min-h-dvh max-w-xl flex-col sm:max-w-3xl"><header className="flex h-10 shrink-0 items-center justify-between"><Brand /><AccountMenu /></header><section className="mt-4 shrink-0"><h1 className="text-[1.65rem] font-semibold leading-[.98] tracking-[-.02em] sm:text-[2rem]">Browse roles worth a referral.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Search published roles, save the ones you like, and request a referral when you are ready.</p><form onSubmit={event => { event.preventDefault(); void loadJobs(); }} className="mt-4 flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><input aria-label="Search roles" value={query} onChange={event => setQuery(event.target.value)} placeholder="Role, company, or keyword" className="min-h-12 w-full rounded-lg border border-border py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary" /></label><input aria-label="Filter by location" value={location} onChange={event => setLocation(event.target.value)} placeholder="Location" className="min-h-12 flex-1 rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-primary" /><button type="submit" className="min-h-12 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white">Search</button></form><p className="mt-3 text-sm text-muted-foreground">Have a job link? <button type="button" onClick={() => { localStorage.setItem("skipwait-job-source", "sample"); go("/start"); }} className="inline-flex min-h-11 items-center font-semibold text-black underline decoration-[#0000ff] underline-offset-4">Paste it instead.</button></p>{isSignedIn && <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(current => !current)} className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold ${savedOnly ? "border-primary bg-primary/5 text-black" : "border-border bg-white text-muted-foreground"}`}><Bookmark className="h-3.5 w-3.5" />Saved roles ({savedIds.size})</button>}</section>{error ? <div role="alert" className="mt-5 flex items-start justify-between gap-3 rounded-xl border border-[#b45309]/30 bg-[#b45309]/10 p-4 text-sm text-[#b45309]"><span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{error}</p></span><button type="button" onClick={() => void loadJobs()} className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-[#b45309]/30 bg-white px-4 py-2 text-xs font-bold text-[#b45309]">Try again</button></div> : loading ? <div className="mt-5 grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(index => <div key={index} className="h-32 animate-pulse rounded-xl border border-border bg-white p-4"><div className="h-4 w-40 rounded bg-muted" /><div className="mt-3 h-3 w-56 rounded bg-muted" /><div className="mt-5 h-9 w-full rounded-lg bg-muted" /></div>)}</div> : !visibleJobs.length ? <div className="mt-5 rounded-xl border border-dashed border-border p-10 text-center"><p className="text-sm font-bold text-black">No jobs match. Try a broader search.</p><p className="mt-1 text-sm text-muted-foreground">Clear the location or search for a role title instead.</p></div> : <ul className="mt-5 grid gap-3 pb-8 sm:grid-cols-2">{visibleJobs.map(job => { const saved = savedIds.has(job.id); return <li key={job.id} id={`job-${job.id}`} className={`flex flex-col rounded-xl border p-4 ${highlightJobId === job.id ? "border-primary bg-primary/5/40 ring-2 ring-primary" : "border-border bg-white"}`}><div className="flex-1"><div className="flex items-start justify-between gap-3"><h2 className="text-sm font-bold text-black">{job.title}</h2>{job.company.toLowerCase() === "acme.com" ? <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">Sample role</span> : null}</div><p className="mt-1 text-[11px] text-muted-foreground">{uniqueJobMetadata(job).join(" · ")}</p></div><div className="mt-3 flex gap-2"><button type="button" aria-pressed={saved} onClick={() => void toggleSave(job.id)} className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border px-3 py-2.5 text-xs font-bold ${saved ? "border-primary bg-primary/5 text-black" : "border-input bg-white text-black hover:border-primary hover:bg-accent"}`}>{saved ? <><BookmarkCheck className="mr-1.5 h-3.5 w-3.5" />Saved</> : <><Bookmark className="mr-1.5 h-3.5 w-3.5" />Save</>}</button><button type="button" onClick={() => requestReferral(job)} disabled={!isValidTargetRoleUrl(job.targetRoleUrl)} title={!isValidTargetRoleUrl(job.targetRoleUrl) ? "This role has no job link. Use Paste it instead to add the employer’s listing." : undefined} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg bg-primary px-3 py-2.5 text-xs font-bold text-white">Request referral <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></button></div></li>; })}</ul>}</div></main>;
}
