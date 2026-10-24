// Company door (D-048 phase 3 W2; comp design/goal-ui/w2/company-*.png): one
// goal line in the seeker's words, one black commit opening the W1 ask drawer
// in place, then the honest facts - responsiveness (never an invented figure),
// open roles as rows with mono dates, the three ask-quality points and the
// privacy preview. Availability is the server's openToReferrals fact; a
// not-open company keeps the waiting-ask rule (COVERAGE_WAIT_DAYS) with a
// ghost "Ask anyway" and says the wait honestly. Every number from
// /api/companies/:slug, /api/companies/:slug/opportunities and the live send.
import { ArrowLeft, ArrowRight, CalendarDays, LockKeyhole } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useRoute } from "wouter";
import {
  GoalAppShell,
  GoalButton,
  GoalNum,
  GoalSkeletonRows,
} from "@/components/goal";
import { CompanyNotFoundError, useCompany, type PublicCompany } from "@/lib/companyDirectory";
import { useCompanyOpportunities, type PublicOpportunityPost } from "@/lib/companyOpportunities";
import { useCompanyResponseSignal } from "@/lib/companyResponseSignal";
import { formatDay, formatDayTime } from "@/lib/displayPrefs";
import { applySeo } from "@/lib/seo";
import type { CompanyResponseSignal } from "@shared/companyResponseSignal";
import { ASK_COST_SENTENCE } from "@shared/moneyCopy";
import { COVERAGE_WAIT_DAYS } from "@shared/referral";
import { NotFoundContent } from "./NotFound";
import { AskDrawer } from "./explore/AskDrawer";
import { useAskComposer } from "./explore/useAskComposer";

const EYEBROW = "text-[11px] font-semibold uppercase tracking-[0.14em] text-g-ink-3";

function BackLink() {
  return (
    <Link href="/explore" className="inline-flex min-h-11 items-center gap-1 text-g-meta text-g-ink-2 hover:text-g-ink">
      <ArrowLeft aria-hidden="true" className="size-4" />All companies
    </Link>
  );
}

export default function ExploreCompany() {
  const [, params] = useRoute("/explore/:slug");
  const slug = params?.slug ?? "";
  const company = useCompany(slug);
  // An unknown or hidden slug is the app's 404 (keep).
  if (company.error instanceof CompanyNotFoundError) return <NotFoundContent />;
  if (company.data) return <CompanyPage company={company.data} />;
  if (company.isError) {
    return (
      <GoalAppShell active="find" pageTitle="Find a referral">
        <div data-skipwait-screen="explore-company-error" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6">
          <BackLink />
          <div data-testid="goal-error-state" role="alert" className="mt-6">
            <p className="text-g-label text-g-ink">We couldn’t load this company.</p>
            <p className="mt-1 text-g-meta text-g-ink-2">Check your connection and try again.</p>
            <GoalButton className="mt-3" flush size="sm" variant="ghost" onClick={() => { void company.refetch(); }}>Try again</GoalButton>
          </div>
        </div>
      </GoalAppShell>
    );
  }
  return (
    <GoalAppShell active="find" pageTitle="Find a referral">
      <div data-skipwait-screen="explore-company-loading" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6" aria-busy="true">
        <BackLink />
        <div className="mt-8 flex items-center gap-3">
          <span aria-hidden="true" className="size-12 animate-pulse rounded-g-tile bg-g-surface-hover motion-reduce:animate-none" />
          <div className="grid gap-2">
            <span aria-hidden="true" className="block h-3 w-40 animate-pulse rounded bg-g-surface-hover motion-reduce:animate-none" />
            <span aria-hidden="true" className="block h-6 w-56 animate-pulse rounded bg-g-surface-hover motion-reduce:animate-none" />
          </div>
        </div>
        <GoalSkeletonRows density="company" count={3} className="mt-8 px-0" />
      </div>
    </GoalAppShell>
  );
}

function CompanyPage({ company }: { company: PublicCompany }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const composer = useAskComposer(company);
  useEffect(() => {
    applySeo({ title: `Referrals at ${company.name}`, description: `Request a private introduction to someone at ${company.name}. ${ASK_COST_SENTENCE}`, path: `/explore/${company.slug}` });
  }, [company.name, company.slug]);
  const open = company.openToReferrals;
  return (
    <GoalAppShell
      active="find"
      pageTitle={company.name}
      drawer={
        <AskDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          company={company}
          context={composer.sent ? null : composer.context}
          signedIn={composer.signedIn}
          url={composer.url}
          onUrlChange={composer.onUrlChange}
          onUrlBlur={composer.onUrlBlur}
          hint={composer.hint}
          resume={composer.resumeView}
          onPickResume={composer.pickResume}
          resumeError={composer.resumeError}
          reasons={composer.reasons}
          onReasonChange={composer.onReasonChange}
          reasonsError={composer.reasonsError}
          work={composer.work}
          watch={composer.watch}
          cost={composer.cost}
          sendLabel={composer.sendLabel}
          sendBusyLabel={composer.sendBusyLabel}
          sending={composer.sending}
          sendBlocked={composer.sendBlocked}
          onSend={composer.send}
          onSaveDraft={composer.onSaveDraft}
          draftState={composer.draftState}
          error={composer.sendError}
          sent={composer.sent}
          onAnother={() => setDrawerOpen(false)}
        />
      }
    >
      <div data-skipwait-screen="explore-company" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6 max-gdesk:pb-6">
        <BackLink />
        <header className="mt-6">
          {open ? (
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-g-ink-2">
              <span aria-hidden="true" className="size-(--g-dot) rounded-full bg-g-ink" />
              People open to referral requests
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-g-ink-3">
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true" className="size-(--g-dot) rounded-full border-[1.5px] border-g-control-edge" />
                Not open yet
              </span>
              <Link href="/alerts" className="font-normal normal-case tracking-normal text-g-meta text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Alert me</Link>
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-g-tile bg-g-surface-selected text-[16px] font-semibold tracking-[0.02em] text-g-ink-2">
              {company.initials}
            </span>
            <div className="min-w-0">
              <h1 className="text-g-display text-g-ink">Get referred at {company.name}.</h1>
              <h2 className="mt-2 text-g-meta text-g-ink-2">{company.name}</h2>
              <p className="truncate text-g-meta text-g-ink-3">{company.functions.join(" · ")}</p>
            </div>
          </div>
        </header>

        <p className="mt-6 text-pretty text-g-body text-g-ink-2">Ask a verified employee. Your name and resume stay private until they accept.</p>
        <section aria-label="Your next step" className="mt-6 border border-g-control-edge p-5">
          <h2 className="text-g-label text-g-ink">Your next step</h2>
          <p className="mt-2 text-g-meta text-g-ink-2">Bring the exact job link and show why your experience fits. Prepare your ask here.</p>
        <div className="mt-5 max-gdesk:grid">
          {open ? (
            <GoalButton variant={drawerOpen ? "ghost" : "primary"} touch="large" className="gdesk:min-w-[280px]" onClick={() => setDrawerOpen(true)}>Ask for a referral</GoalButton>
          ) : (
            <GoalButton variant="outline" touch="large" className="gdesk:min-w-[280px]" onClick={() => setDrawerOpen(true)}>Ask anyway</GoalButton>
          )}
        </div>
        <p className="mt-3 text-g-meta text-g-ink-3">
          {open ? ASK_COST_SENTENCE : `No verified employee can see asks yet. Yours waits free until one can - up to ${COVERAGE_WAIT_DAYS} days - and no credit is used until then.`}
        </p>
        </section>

        <Responsiveness slug={company.slug} />
        <CompanyOpenings
          slug={company.slug}
          companyName={company.name}
          onAsk={post => {
            // D-174: pick a job, then ask - in place on the door. The pick
            // replaces the whole composer selection: the role's verified link
            // prefills when the post has one, and a linkless post clears any
            // stale link from an earlier pick. The post id travels with the
            // send so the poster sees the ask first (D-022).
            composer.selectPost({ opportunityId: post.id, jobUrl: post.targetRoleUrl });
            setDrawerOpen(true);
          }}
        />

        <section className="mt-10" aria-label="Before you ask">
          <h2 className={EYEBROW}>Before you ask</h2>
          <p className="mt-3 text-balance text-g-heading text-g-ink">Bring the role.<br />We’ll guide the request.</p>
          <p className="mt-2 text-pretty text-g-body text-g-ink-2">Find a role on the company’s own careers site, copy its link, and explain why your experience fits. A focused request is easier to review.</p>
          <ol className="mt-4 divide-y divide-g-hairline border-t border-g-hairline">
            {[
              ["Use the exact job link", "This keeps the request specific and current."],
              ["Make your fit easy to see", "Share the most relevant experience, not a generic pitch."],
              ["Respect the decision", "People choose what they can support. A pass stays private."],
            ].map(([title, body], index) => (
              <li key={title} className="flex gap-4 py-4">
                <span aria-hidden="true" className="font-g-mono text-g-meta text-g-ink-3">{`0${index + 1}`}</span>
                <div className="min-w-0">
                  <p className="text-g-label text-g-ink">{title}</p>
                  <p className="mt-0.5 text-g-meta text-g-ink-3">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10 flex flex-wrap items-center gap-4 rounded-g-tile border border-g-hairline p-5" aria-label="Privacy preview">
          <LockKeyhole aria-hidden="true" className="size-5 shrink-0 text-g-ink-2" />
          <div className="min-w-0 flex-1 basis-64">
            <p className="text-g-label text-g-ink">What is shared, and when?</p>
            <p className="mt-1 text-g-meta text-g-ink-2">Your job link and note are shared with an available referrer. Personal contact details and documents remain private until a request is accepted.</p>
          </div>
          <Link href="/safety" className="inline-flex min-h-11 items-center gap-1 text-g-label text-g-ink">Read safety guide <ArrowRight aria-hidden="true" className="size-4" /></Link>
        </section>
      </div>
    </GoalAppShell>
  );
}

// Company responsiveness (D-104): keep the shipped read - nothing renders
// while the flag is off or the read fails. With too little data, the honest
// line; never an invented figure. Shown numbers are mono, averages only.
function Responsiveness({ slug }: { slug: string }) {
  const { data } = useCompanyResponseSignal(slug);
  if (!data) return null;
  return (
    <section className="mt-10 border-t border-g-hairline pt-6" data-testid="company-response-signal" aria-label="Company responsiveness">
      <h2 className={EYEBROW}>Company responsiveness</h2>
      {data.state === "shown" ? <ShownSignal data={data} /> : (
        <p className="mt-3 text-g-meta text-g-ink-2">Not enough requests yet to show a response signal. We never show a number we can’t back.</p>
      )}
    </section>
  );
}

function ShownSignal({ data }: { data: CompanyResponseSignal }) {
  if (data.state !== "shown") return null;
  const rows: [string, number, string][] = [
    ["usual first reply", data.usualFirstReplyDays, data.usualFirstReplyDays === 1 ? "day" : "days"],
    ["asks answered this month", data.answeredThisMonth, ""],
    ["referrers inside", data.referrersInside, ""],
  ];
  return (
    <dl className="mt-3 grid gap-2">
      {rows.map(([label, value, unit]) => (
        <div key={label} className="flex items-baseline gap-2">
          <dt className="text-g-meta text-g-ink-3">{label}</dt>
          <dd className="text-g-meta text-g-ink"><GoalNum>{value}</GoalNum>{unit ? ` ${unit}` : ""}</dd>
        </div>
      ))}
    </dl>
  );
}

// D-022: roles posted by verified employees of this company, between the hero
// and "Before you ask". Rows, not cards; an empty read invites employees to
// post, and a failed one never blocks the page (keep).
function CompanyOpenings({ slug, companyName, onAsk }: { slug: string; companyName: string; onAsk: (post: PublicOpportunityPost) => void }) {
  const openings = useCompanyOpportunities(slug);
  const [filter, setFilter] = useState("");
  const posts = openings.data ?? [];
  // D-174: the seeker filters the company's roles (location/seniority words
  // live in the title/location text today - no invented seniority field).
  const needle = filter.trim().toLowerCase();
  const shown = needle ? posts.filter(post => post.roleTitle.toLowerCase().includes(needle) || (post.location ?? "").toLowerCase().includes(needle)) : posts;
  let body: ReactNode;
  if (openings.isPending) {
    body = <GoalSkeletonRows density="company" count={2} className="mt-3 px-0" />;
  } else if (openings.isError) {
    body = (
      <div role="alert" className="mt-3">
        <p className="text-g-label text-g-ink">We couldn’t load open roles.</p>
        <p className="mt-0.5 text-g-meta text-g-ink-3">{openings.error.message}</p>
        <GoalButton className="mt-2" flush size="sm" variant="ghost" onClick={() => { void openings.refetch(); }}>Try again</GoalButton>
      </div>
    );
  } else if (posts.length > 0 && shown.length === 0) {
    body = (
      <p className="mt-3 text-g-meta text-g-ink-3">
        No roles match that filter.{" "}
        <button type="button" className="text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink" onClick={() => setFilter("")}>Clear filter</button>
      </p>
    );
  } else if (posts.length === 0) {
    body = (
      <p className="mt-3 text-g-meta text-g-ink-3">
        No open roles from employees yet.{" "}
        <Link href="/post-opportunity" className="text-g-ink-2 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">{`Work at ${companyName}? Share a role`}</Link>
      </p>
    );
  } else {
    body = <ul className="mt-2 divide-y divide-g-hairline border-t border-g-hairline">{shown.map(post => <OpenRoleRow key={post.id} post={post} onAsk={onAsk} />)}</ul>;
  }
  return (
    <section className="mt-10" aria-label={`Open roles from verified employees at ${companyName}`}>
      <h2 className={EYEBROW}>Open roles from verified employees</h2>
      {posts.length > 1 ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor="goal-role-filter">Filter roles</label>
          <input
            id="goal-role-filter"
            type="search"
            role="searchbox"
            aria-label="Filter roles"
            value={filter}
            onChange={event => setFilter(event.target.value)}
            placeholder="Filter by role or location"
            className="w-full rounded-g-tile border border-g-control-edge bg-transparent px-3 py-2 text-g-meta text-g-ink placeholder:text-g-ink-3"
          />
        </div>
      ) : null}
      {body}
    </section>
  );
}

// Each segment stays on one line; the wrap happens between segments, so a
// line never ends on a separator. A walk-in's date-time is its own line.
function metaSegments(post: PublicOpportunityPost, posted: string | null): ReactNode[] {
  const segments: ReactNode[] = [];
  if (post.location) segments.push(<span className="whitespace-nowrap">{post.location}</span>);
  if (posted) segments.push(<span className="whitespace-nowrap font-g-mono uppercase tracking-wide">Posted {posted}</span>);
  segments.push(<span className="whitespace-nowrap">{post.poster.kind === "firstName" ? `Posted by ${post.poster.firstName}` : "Posted by a verified employee"}</span>);
  return segments;
}

function OpenRoleRow({ post, onAsk }: { post: PublicOpportunityPost; onAsk: (post: PublicOpportunityPost) => void }) {
  const posted = formatDay(post.postedAt);
  const walkIn = post.kind === "walk_in" && post.walkInAt ? formatDayTime(post.walkInAt) : null;
  return (
    <li className="flex items-center gap-3 py-4 max-gdesk:flex-col max-gdesk:items-stretch">
      <div className="min-w-0 flex-1">
        <p className="text-g-label text-g-ink">{post.roleTitle}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-g-meta text-g-ink-3">
          {metaSegments(post, posted).map((segment, index) => (
            <Fragment key={index}>{index > 0 ? <span aria-hidden="true">·</span> : null}{segment}</Fragment>
          ))}
        </p>
        {walkIn ? (
          <p className="mt-0.5 flex items-center gap-1 font-g-mono uppercase tracking-wide text-g-meta text-g-ink-3"><CalendarDays aria-hidden="true" className="size-3.5" /> Walk-in · {walkIn}</p>
        ) : null}
      </div>
      <GoalButton variant="outline" className="shrink-0 max-gdesk:w-full" onClick={() => onAsk(post)}>
        Ask for a referral <ArrowRight aria-hidden="true" className="size-4" />
      </GoalButton>
    </li>
  );
}
