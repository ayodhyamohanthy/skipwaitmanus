// SEARCH-universal (D-394): the results under the one box. A resolved posting
// shows its company and role with "Apply on the careers site" and "Ask for a
// referral"; a title or keyword answer lists open careers-site jobs, newest
// first, each with the company, its locations, the honest presence label
// ("Referrers here" / "No referrers yet", D-360 (5)) and the same two actions.
// An empty job list while no source is live says so instead of claiming no
// such job (D-175).
import { Link } from "wouter";
import type { SearchJobHit, SearchJobLink } from "@shared/search";
import { GoalButton } from "@/components/goal";
import type { UniversalSearchState } from "./universalSearch";

const TEXT_LINK = "text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink";
const presenceLabel = (presence: SearchJobHit["referrerPresence"]) => (presence === "present" ? "Referrers here" : "No referrers yet");

export interface UniversalSearchResultsProps {
  state: UniversalSearchState;
  onOpenCompany(slug: string): void;
  onOpenJobLink(slug: string, url: string): void;
}

function JobLinkCard({ link, onOpen }: { link: SearchJobLink; onOpen(slug: string, url: string): void }) {
  const slug = link.companySlug;
  return (
    <div data-testid="universal-search-job-link" className="rounded-g-tile border border-g-hairline p-4">
      <p className="text-g-label text-g-ink">{link.roleTitle ?? "A role"}{link.companyName ? ` at ${link.companyName}` : ""}</p>
      <p className="mt-1 text-g-meta text-g-ink-3">From the posting.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center text-g-meta ${TEXT_LINK}`}>Apply on the careers site<span className="sr-only"> (opens in a new tab)</span></a>
        {slug ? <GoalButton variant="outline" onClick={() => onOpen(slug, link.url)}>Ask for a referral</GoalButton> : null}
      </div>
      {slug ? null : <p className="mt-2 text-g-meta text-g-ink-3">No referral door at this company yet. <Link href="/invite" className={TEXT_LINK}>Ask us to open the door</Link>.</p>}
    </div>
  );
}

export function UniversalSearchResults({ state, onOpenJobLink }: UniversalSearchResultsProps) {
  if (state.status !== "ready") return null;
  const { jobLink, jobs } = state;
  // No result of its own: the box's existing no-match line already says what to
  // try next (paste the job link, request the company), so this section stays
  // silent instead of repeating it.
  if (!jobLink && jobs.length === 0) return null;
  return (
    <section aria-label="Search results" data-testid="universal-search-results" className="mt-6">
      {jobLink ? <JobLinkCard link={jobLink} onOpen={onOpenJobLink} /> : null}
      {jobs.length > 0 ? (
        <ul aria-label="Jobs" className="mt-4 divide-y divide-g-hairline border-t border-g-hairline">
          {jobs.map(job => (
            <li key={job.id} className="flex gap-4 py-4 max-gdesk:flex-col max-gdesk:gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="break-words text-g-label text-g-ink">{job.title}</h3>
                <p className="mt-1 break-words text-g-meta text-g-ink-3">{job.companyName}{job.locations.length ? ` · ${job.locations.join(" · ")}` : ""}</p>
                <p className="mt-2 inline-flex items-center gap-2 text-g-meta text-g-ink-2"><span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-current" />{presenceLabel(job.referrerPresence)}</p>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-1 gdesk:items-end">
                <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" aria-label={`Apply on the careers site for ${job.title}`} className={`inline-flex min-h-11 items-center text-g-meta ${TEXT_LINK}`}>Apply on the careers site<span className="sr-only"> (opens in a new tab)</span></a>
                <GoalButton variant="outline" onClick={() => onOpenJobLink(job.companySlug, job.applyUrl)}>Ask for a referral</GoalButton>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
