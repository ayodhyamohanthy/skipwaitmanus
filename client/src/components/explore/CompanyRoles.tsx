import { Bookmark, BookmarkCheck, ExternalLink, RotateCw } from "lucide-react";
import { isValidTargetRoleUrl } from "@shared/referralUrl";
import { useAuth } from "@/_core/auth";
import { Button } from "@/components/kit/button";
import { usePersistFn } from "@/hooks/usePersistFn";
import type { LaunchCompany } from "@/lib/companies";
import { JOBS_ERROR, SAVE_ERROR, useCompanyJobs, useSavedRoleIds, useToggleSavedRole } from "./roleQueries";

/**
 * Live roles from the public catalog for one launch company. The kit page has
 * no roles block, so it only appears when the catalog actually lists roles;
 * zero roles leaves the kit layout untouched (the page already explains how to
 * ask with any careers-site link). Loading is silent; failure is stated.
 */
export function CompanyRoles({ company }: { company: LaunchCompany }) {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const jobs = useCompanyJobs(company);
  const saved = useSavedRoleIds(isSignedIn, userId, fetchToken);
  const toggle = useToggleSavedRole(userId, fetchToken);
  const savedIds = new Set(saved.data ?? []);
  const label = `Open roles at ${company.name}`;

  if (jobs.isPending) return <section aria-label={label} aria-busy="true"><span className="sr-only">Loading roles…</span></section>;
  if (jobs.isError) {
    return <section aria-label={label} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <p role="status">{JOBS_ERROR} You can still ask with any job link from {company.name}’s careers site.</p>
      <Button type="button" variant="link" className="h-auto min-h-11 px-0" onClick={() => { void jobs.refetch(); }}><RotateCw />Try again</Button>
    </section>;
  }
  const roles = jobs.data;
  if (!roles.length) return null;
  return <section aria-label={label}>
    <div className="directory-heading"><div><h2>{roles.length} open {roles.length === 1 ? "role" : "roles"}</h2></div></div>
    {toggle.isError ? <p role="alert" className="text-sm font-semibold text-destructive">{SAVE_ERROR}</p> : null}
    <ul className="role-list">
      {roles.map(job => {
        const isSaved = savedIds.has(job.id);
        return <li key={job.id} className="role-row">
          <div className="min-w-0">
            <strong className="truncate">{job.title}</strong>
            <small>{job.location} · {job.workMode} · {job.seniority}</small>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isSignedIn ? (
              <button type="button" aria-label={isSaved ? `Unsave ${job.title}` : `Save ${job.title}`} aria-pressed={isSaved} disabled={toggle.isPending && toggle.variables?.jobId === job.id} onClick={() => { if (!toggle.isPending) toggle.mutate({ jobId: job.id, save: !isSaved }); }} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border">
                {isSaved ? <BookmarkCheck className="size-4 text-primary" /> : <Bookmark className="size-4" />}
              </button>
            ) : null}
            {job.targetRoleUrl && isValidTargetRoleUrl(job.targetRoleUrl) ? <a href={job.targetRoleUrl} target="_blank" rel="noreferrer" aria-label={`Open ${job.title} posting`} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-border"><ExternalLink className="size-4" /></a> : null}
          </div>
        </li>;
      })}
    </ul>
  </section>;
}
