// D-048-p3-discovery: the goal /jobs (packet docs/plans/D-048-marketing.md §3).
// "Browse roles worth a referral." The commit is "Request a referral" on the
// chosen role; save and paste are the quiet actions; "No jobs match" is the
// honest empty state. Same endpoints, canonical ?q= URL, ?job= deep link,
// JSON-LD and referral-draft hand-off as the kit page.
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Bookmark, BookmarkCheck } from "lucide-react";
import { toast } from "sonner";
import { SignInButton, useAuth } from "@/_core/auth";
import { AccountMenu } from "@/components/AccountMenu";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalFilterChip, GoalNextStep, GoalSearchInput, GoalSkeletonRows, GoalTextInput } from "@/components/goal";
import { readApiJson } from "@/lib/apiResponse";
import { readReferralDraft, saveReferralDraft } from "@/lib/pwaContinuity";
import { applySeo, jobsJsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl } from "@shared/referralUrl";
import { DiscoveryFrame } from "./DiscoveryFrame";

export const GOAL_PAGE = { goalLine: "Browse roles worth a referral." } as const;
export const SIGN_IN_GOAL_PAGE = { goalLine: "Sign in to save roles." } as const;

type JobRow = { id: number; title: string; company: string; location: string; seniority: string; workMode: string; targetRoleUrl?: string | null };
const LOAD_ERROR = "We could not load the job list";
const SAVE_ERROR = "We could not update your saved roles";

function jobMetadata(job: JobRow) {
  const seen = new Set<string>();
  return [job.company, job.location, job.seniority, job.workMode].map(value => value?.trim()).filter((value): value is string => Boolean(value) && !seen.has(value.toLowerCase()) && (seen.add(value.toLowerCase()), true));
}

export default function GoalJobs() {
  const { isSignedIn } = useAuth();
  const [, go] = useLocation();
  // SEO contract (as on the kit page): /jobs?q={term} seeds the search and
  // /jobs?job={id} selects and scrolls to that role.
  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [query, setQuery] = useState(urlParams.get("q") ?? urlParams.get("query") ?? "");
  const [location, setLocation] = useState(urlParams.get("location") ?? "");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(() => { const jobParam = Number(urlParams.get("job")); return Number.isInteger(jobParam) && jobParam > 0 ? jobParam : null; });
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [signInGate, setSignInGate] = useState(false);

  const loadJobs = async (nextQuery = query, nextLocation = location) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams(); if (nextQuery.trim()) params.set("query", nextQuery.trim()); if (nextLocation.trim()) params.set("location", nextLocation.trim());
      const canonical = new URLSearchParams(); if (nextQuery.trim()) canonical.set("q", nextQuery.trim()); if (nextLocation.trim()) canonical.set("location", nextLocation.trim());
      const canonicalQuery = canonical.toString();
      window.history.replaceState(null, "", canonicalQuery ? `/jobs?${canonicalQuery}` : "/jobs");
      const response = await fetch(`/api/jobs${params.size ? `?${params.toString()}` : ""}`);
      const payload = await readApiJson<{ jobs?: JobRow[]; error?: string }>(response, LOAD_ERROR);
      if (!response.ok) throw new Error(payload.error || LOAD_ERROR);
      setJobs(payload.jobs || []);
      applySeo({ title: "Browse roles worth a referral", description: "Search published roles and request a private referral from a verified employee. Referrers stay anonymous.", path: "/jobs", jsonLd: jobsJsonLd(payload.jobs || []) });
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : LOAD_ERROR); }
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
  useEffect(() => {
    if (selectedId == null) return;
    const timer = setTimeout(() => {
      const node = document.getElementById(`job-${selectedId}`);
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
    }, 120);
    return () => clearTimeout(timer);
  }, [jobs]);

  const toggleSave = async (jobId: number) => {
    if (!isSignedIn) { setSignInGate(true); return; }
    const wasSaved = savedIds.has(jobId);
    setSavedIds(current => { const next = new Set(current); if (wasSaved) next.delete(jobId); else next.add(jobId); return next; });
    try {
      const response = await fetch(`/api/saved-roles/${jobId}`, { method: wasSaved ? "DELETE" : "PUT", credentials: "include" });
      const payload = await readApiJson<{ saved?: boolean; error?: string }>(response, SAVE_ERROR);
      if (!response.ok) throw new Error(payload.error || SAVE_ERROR);
    } catch (toggleError) {
      setSavedIds(current => { const next = new Set(current); if (wasSaved) next.add(jobId); else next.delete(jobId); return next; });
      toast(toggleError instanceof Error ? toggleError.message : SAVE_ERROR);
    }
  };

  const pasteInstead = () => { localStorage.setItem("skipwait-job-source", "sample"); go("/start"); };

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
  const selected = visibleJobs.find(job => job.id === selectedId) ?? visibleJobs[0];
  const account = isSignedIn ? <AccountMenu /> : <SignInButton><GoalButton size="sm" variant="ghost">Sign in</GoalButton></SignInButton>;

  if (signInGate) {
    return (
      <DiscoveryFrame screen="job-explorer" page="discovery-jobs-sign-in" current="/jobs">
        <div className="mx-auto max-w-md">
          <GoalButton flush size="sm" variant="ghost" leadingIcon={ArrowLeft} onClick={() => setSignInGate(false)}>Back to roles</GoalButton>
          <h1 className="mt-4 text-g-display text-g-ink">{SIGN_IN_GOAL_PAGE.goalLine}</h1>
          <p className="mt-2 text-g-body text-g-ink-2">Browsing is open to everyone. Sign in to keep the roles you like and request referrals.</p>
          <div className="mt-6">
            <GoalNextStep>
              <div className="mt-4"><SignInButton><GoalButton variant="primary">Sign in to continue</GoalButton></SignInButton></div>
            </GoalNextStep>
          </div>
        </div>
      </DiscoveryFrame>
    );
  }

  let body;
  if (error) {
    body = <GoalErrorState className="mt-6 px-0 max-gdesk:px-0" title={error} body="Nothing was lost. Your saved roles are unchanged." retry={{ label: "Try again", onClick: () => { void loadJobs(); } }} />;
  } else if (loading) {
    body = <GoalSkeletonRows density="queue" count={4} className="mt-6 px-0" />;
  } else if (!selected) {
    body = (
      <div className="mt-6 max-w-2xl">
        <GoalEmptyState className="px-0 max-gdesk:px-0" title="No jobs match. Try a broader search." body="Clear the location or search for a role title instead." />
        <div className="mt-4">
          <GoalNextStep reason="Have the employer’s job link? Paste it and request a referral for that role.">
            <div className="mt-4"><GoalButton variant="primary" onClick={pasteInstead}>Paste a job link</GoalButton></div>
          </GoalNextStep>
        </div>
      </div>
    );
  } else {
    const canSend = isValidTargetRoleUrl(selected.targetRoleUrl);
    body = (
      <div className="mt-6 grid gap-6 gdesk:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gdesk:items-start">
        <ul aria-label="Roles" className="grid gap-1">
          {visibleJobs.map(job => {
            const saved = savedIds.has(job.id);
            const isSelected = job.id === selected.id;
            return (
              <li key={job.id} id={`job-${job.id}`} data-testid="goal-list-row" className={cn("relative flex items-center gap-2 rounded-g-tile pr-2", isSelected ? "bg-g-surface-selected" : "hover:bg-g-surface-hover")}>
                {isSelected ? <span aria-hidden="true" className="absolute top-3 bottom-3 left-0 w-0.5 rounded-r-[2px] bg-g-ink" /> : null}
                <button type="button" aria-current={isSelected ? "true" : undefined} onClick={() => setSelectedId(job.id)} className="min-h-16 min-w-0 flex-1 px-3 py-2.5 text-left">
                  <span className="block truncate text-g-label text-g-ink">{job.title}</span>
                  <span className="block truncate text-g-meta text-g-ink-3">{jobMetadata(job).join(" · ")}{job.company.toLowerCase() === "acme.com" ? " · Sample role" : ""}</span>
                </button>
                <GoalButton size="sm" variant="ghost" aria-pressed={saved} aria-label={`${saved ? "Saved" : "Save"} ${job.title}`} leadingIcon={saved ? BookmarkCheck : Bookmark} onClick={() => { void toggleSave(job.id); }}>{saved ? "Saved" : "Save"}</GoalButton>
              </li>
            );
          })}
        </ul>
        <div className="gdesk:sticky gdesk:top-6">
          <GoalNextStep>
            <p className="mt-3 text-g-meta text-g-ink-3">{jobMetadata(selected).join(" · ")}</p>
            <h3 className="mt-1 text-g-heading text-g-ink">{selected.title}</h3>
            <p className="mt-2 text-g-meta text-g-ink-2">A verified employee at the company sees your request privately. Referrers stay anonymous until they accept.</p>
            <div className="mt-4">
              <GoalButton variant="primary" onClick={() => requestReferral(selected)} disabledReason={canSend ? undefined : "No job link to send"}>Request a referral</GoalButton>
            </div>
            {canSend ? null : <p className="mt-2 text-g-meta text-g-ink-2">This role has no job link. Paste the employer’s listing instead.</p>}
          </GoalNextStep>
        </div>
      </div>
    );
  }

  return (
    <DiscoveryFrame screen="job-explorer" page="discovery-jobs" current="/jobs" account={account}>
      <header className="max-w-2xl">
        <h1 className="text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-2 text-g-body text-g-ink-2">Search published roles, save the ones you like, and request a referral when you are ready.</p>
      </header>
      <form role="search" aria-label="Search roles" onSubmit={event => { event.preventDefault(); void loadJobs(); }} className="mt-5 grid max-w-3xl gap-2 gdesk:grid-cols-[minmax(0,1fr)_220px_auto]">
        <GoalSearchInput label="Search roles" value={query} onChange={setQuery} placeholder="Role, company, or keyword" />
        <GoalTextInput aria-label="Filter by location" value={location} onChange={event => setLocation(event.target.value)} placeholder="Location" />
        <GoalButton type="submit" variant="outline">Search</GoalButton>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-g-meta text-g-ink-2">
        <span>Have a job link? <button type="button" onClick={pasteInstead} className="text-g-ink underline underline-offset-[3px]">Paste it instead.</button></span>
        {isSignedIn ? <GoalFilterChip label="Saved roles" pressed={savedOnly} onPressedChange={setSavedOnly} count={savedIds.size} /> : null}
      </div>
      {body}
    </DiscoveryFrame>
  );
}
