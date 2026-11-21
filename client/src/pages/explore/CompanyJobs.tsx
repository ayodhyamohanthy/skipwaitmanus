import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import type { PublicCompany } from "@shared/companies";
import type { CatalogJob, CompanyJobsResponse } from "@shared/jobCatalog";
import { JOB_LEVEL_LABELS } from "@shared/jobLevel";
import type { JobLevel } from "@shared/jobLevel";
import { SITE_ORIGIN } from "@shared/publicRoutes";
import { GoalButton, GoalField, GoalNum, GoalSkeletonRows, useOnlineStatus } from "@/components/goal";
import { trackClarityEvent } from "@/lib/clarity";
import { formatDay } from "@/lib/displayPrefs";
import { useCompanyJobs } from "./companyJobsApi";
import type { CompanyJobsFilters } from "./companyJobsApi";

export interface CompanyJobsProps {
  company: Pick<PublicCompany, "slug" | "name" | "referrerPresence">;
  onPickJob?: (job: CatalogJob) => void;
  onPasteJobLink?: () => void;
}
const EMPTY_FILTERS: CompanyJobsFilters = { location: "", level: "", function: "" };
const SELECT_CLASS = "h-(--g-control-h) w-full min-w-0 rounded-g-control border border-g-control-edge bg-g-surface px-3 text-g-body text-g-ink max-gdesk:h-12";
const TEXT_LINK = "text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink";

function isJobLevel(value: number): value is JobLevel {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}
function levelLabel(value: number): string {
  if (!isJobLevel(value)) throw new Error("Invalid catalog level");
  return JOB_LEVEL_LABELS[value];
}

// A different company starts fresh; presence updates alone retain filters and pages.
export function CompanyJobs(props: CompanyJobsProps) {
  return <CompanyJobsContent key={props.company.slug} {...props} />;
}

function CompanyJobsContent({ company, onPickJob, onPasteJobLink }: CompanyJobsProps) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [knownFacets, setKnownFacets] = useState<CompanyJobsResponse["facets"]>();
  const online = useOnlineStatus();
  const id = useId();
  const query = useCompanyJobs(company.slug, filters, online);
  const first = query.data?.pages[0];
  const jobs = useMemo(() => query.isPlaceholderData ? [] : query.data?.pages.flatMap(page => page.jobs) ?? [], [query.data, query.isPlaceholderData]);
  const hasFilters = Boolean(filters.location || filters.level || filters.function);
  const available = Boolean(first?.source && first.source.status !== "unverified" && first.completeness !== "unavailable");
  const viewed = useRef(false);
  const companyUrl = new URL(`/explore/${encodeURIComponent(company.slug)}`, SITE_ORIGIN).href;
  const facets = first?.facets ?? knownFacets;
  const showFilters = available || Boolean(query.isError && knownFacets);

  useEffect(() => {
    if (available && first && !query.isPlaceholderData) setKnownFacets(first.facets);
  }, [available, first, query.isPlaceholderData]);

  useEffect(() => {
    if (!viewed.current && available && !query.isPlaceholderData && jobs.length > 0) {
      viewed.current = true;
      trackClarityEvent("journey_jobs_viewed");
    }
  }, [available, jobs.length, query.isPlaceholderData]);

  function changeFilter(key: keyof CompanyJobsFilters, value: string) {
    setFilters(current => ({ ...current, [key]: value }));
    trackClarityEvent("journey_jobs_filtered");
  }
  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    trackClarityEvent("journey_jobs_filtered");
  }
  async function copyCompanyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(companyUrl);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  let body: ReactNode;
  if (!online && (!first || query.isPlaceholderData)) {
    body = <p role="status" className="mt-4 text-g-meta text-g-ink-2">You’re offline. Connect to load careers-site jobs.</p>;
  } else if (query.isPending || query.isPlaceholderData) {
    body = <div role="status" aria-label="Loading careers-site jobs"><GoalSkeletonRows density="company" count={2} className="mt-4 px-0" /></div>;
  } else if (query.isError && !query.isFetchNextPageError) {
    body = <div role="alert" className="mt-4">
      <p className="text-g-meta text-g-ink-2">We couldn’t load jobs from the careers site.</p>
      <GoalButton variant="ghost" flush className="mt-1" busy={query.isFetching} busyLabel="Trying again…" disabledReason={!online ? "Go online to try again" : undefined} onClick={() => { void query.refetch(); }}>Try again</GoalButton>
    </div>;
  } else if (!available) {
    body = <p className="mt-4 text-g-meta text-g-ink-2">We can’t list careers-site jobs right now. You can still request a referral with a job link.</p>;
  } else if (jobs.length === 0) {
    body = <div className="mt-4 text-g-meta text-g-ink-2">
      <p>{hasFilters ? "No listed jobs match these filters." : "No jobs were returned by this careers source."}</p>
      {hasFilters ? <GoalButton variant="ghost" flush onClick={clearFilters}>Clear filters</GoalButton> : null}
    </div>;
  } else {
    body = <>
      {!online ? <p role="status" className="mt-4 text-g-meta text-g-ink-3">You’re offline. Showing the last loaded jobs.</p> : null}
      <ul aria-label="Careers-site jobs" className="mt-4 divide-y divide-g-hairline border-t border-g-hairline">
        {jobs.map(job => <li key={job.id} className="flex gap-4 py-4 max-gdesk:flex-col max-gdesk:gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-g-label text-g-ink">{job.title}</h3>
            <p className="mt-1 break-words text-g-meta text-g-ink-3">{job.locations.join(" · ") || job.rawLocation || "Location not stated"}{" · "}{levelLabel(job.level)}</p>
            {job.snippet ? <p className="mt-2 break-words text-g-meta text-g-ink-2">{job.snippet}</p> : null}
            {job.publishedAt ? <p className="mt-2 text-g-meta text-g-ink-3">Posted <GoalNum>{formatDay(job.publishedAt)}</GoalNum></p> : null}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-1 gdesk:items-end">
            <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={`View posting for ${job.title}`} className={`inline-flex min-h-11 items-center text-g-meta ${TEXT_LINK}`}>View posting<span className="sr-only"> (opens in a new tab)</span></a>
            {onPickJob ? <GoalButton variant="outline" onClick={() => { trackClarityEvent("journey_job_picked"); onPickJob(job); }}>Request a referral</GoalButton> : null}
          </div>
        </li>)}
      </ul>
      {query.isFetchNextPageError ? <p role="alert" className="mt-3 text-g-meta text-g-ink-2">We couldn’t load the next jobs. Your loaded results are still here.</p> : null}
      {query.hasNextPage ? <GoalButton variant="outline" className="mt-3" busy={query.isFetchingNextPage} busyLabel="Loading more…" disabledReason={!online ? "Go online to load more jobs" : query.isFetching ? "Wait for jobs to finish loading" : undefined} onClick={() => { void query.fetchNextPage(); }}>{query.isFetchNextPageError ? "Try loading more again" : "Load more jobs"}</GoalButton> : null}
    </>;
  }

  return <section aria-label="Jobs from the company careers site" className="mt-10 border-t border-g-hairline pt-6">
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-g-ink-3">From the company careers site</h2>
    {available ? <div className="mt-2 text-g-meta text-g-ink-3">
      <p>Jobs from {company.name}’s verified careers source.{first?.syncedAt ? <> Last synced <GoalNum>{formatDay(first.syncedAt)}</GoalNum>.</> : null}</p>
      <p className="mt-1">{first?.completeness === "partial" ? "This list is partial and may omit openings." : "This list covers this source only, not every company opening."}</p>
    </div> : null}
    {company.referrerPresence ? <div className="mt-4">
      <p className="inline-flex items-center gap-2 text-g-meta text-g-ink-2"><span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-current" />{company.referrerPresence === "none" ? "No referrers yet" : "Verified referrers have joined"}</p>
      {company.referrerPresence === "none" ? <div className="mt-1 text-g-meta text-g-ink-3">
        <p>Know someone who works here? Share the public company page.</p>
        <GoalButton variant="ghost" flush onClick={() => { void copyCompanyLink(); }}>Copy company link</GoalButton>
        <p role="status">{copyState === "copied" ? "Company link copied." : copyState === "failed" ? <>Copy this public link: <a className={TEXT_LINK} href={companyUrl}>{companyUrl}</a></> : null}</p>
      </div> : null}
    </div> : null}
    {showFilters ? <div className="mt-5 grid min-w-0 gap-3 gdesk:grid-cols-3">
      <GoalField label="Location" htmlFor={`${id}-location`}><select id={`${id}-location`} className={SELECT_CLASS} value={filters.location} onChange={event => changeFilter("location", event.target.value)}><option value="">All locations</option>{Object.keys(facets?.locations ?? {}).sort().map(value => <option key={value} value={value}>{value}</option>)}</select></GoalField>
      <GoalField label="Level" htmlFor={`${id}-level`}><select id={`${id}-level`} className={SELECT_CLASS} value={filters.level} onChange={event => changeFilter("level", event.target.value)}><option value="">All levels</option>{Object.keys(facets?.levels ?? {}).sort((a, b) => Number(a) - Number(b)).filter(value => isJobLevel(Number(value))).map(value => <option key={value} value={value}>{levelLabel(Number(value))}</option>)}</select></GoalField>
      <GoalField label="Job function" htmlFor={`${id}-function`}><select id={`${id}-function`} className={SELECT_CLASS} value={filters.function} onChange={event => changeFilter("function", event.target.value)}><option value="">All functions</option>{Object.keys(facets?.functions ?? {}).sort().map(value => <option key={value} value={value}>{value}</option>)}</select></GoalField>
    </div> : null}
    <div aria-live="polite">{body}</div>
    <p className="mt-4 text-g-meta text-g-ink-3">Have another role in mind?{onPasteJobLink ? <GoalButton variant="ghost" flush className="ml-1" onClick={() => onPasteJobLink()}>Paste a job link</GoalButton> : <> <Link href="/ask" className={`inline-flex min-h-11 items-center ${TEXT_LINK}`}>Paste a job link</Link></>}</p>
  </section>;
}
