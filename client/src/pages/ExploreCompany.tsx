// Company door, redesigned to the doctrine (D-048-p3-live-review-find;
// contract "Get referred at {Company}." in docs/plans/GOAL_UI_MIGRATION.md):
// one goal line in the seeker's words, one "Your next step" block whose
// single black commit ("Ask for a referral") opens the W1 ask drawer in
// place, with the cost stated before the ask from the shared money copy and
// the full money sentence beside it. Then the honest facts - responsiveness
// from the shared companySignalCopy (never an invented figure), open roles as
// rows with mono dates, the three ask-quality points, the privacy preview and
// the "Claim this company" link. A not-open company keeps the waiting-ask
// rule (COVERAGE_WAIT_DAYS) and says the wait honestly in the commit's own
// line (D-176: availability is the post-save truth, never an open/not-open
// pill). Every number from /api/companies/:slug,
// /api/companies/:slug/opportunities and the live send.
import { ArrowLeft, ArrowRight, CalendarDays, LockKeyhole } from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { Link, useRoute } from "wouter";
import {
  GoalAppShell,
  GoalButton,
  GoalNextStep,
  GoalNum,
  GoalSkeletonRows,
} from "@/components/goal";
import { CompanyNotFoundError, useCompany, type PublicCompany } from "@/lib/companyDirectory";
import { useCompanyOpportunities, type PublicOpportunityPost } from "@/lib/companyOpportunities";
import { useCompanyResponseSignal } from "@/lib/companyResponseSignal";
import { formatDay, formatDayTime } from "@/lib/displayPrefs";
import { applySeo } from "@/lib/seo";
import type { CompanyResponseSignal } from "@shared/companyResponseSignal";
import { ASK_COST_SENTENCE, MONEY_SENTENCE } from "@shared/moneyCopy";
// ASK_COST_SENTENCE stays for the SEO description below; the block states the
// cost once, through MONEY_SENTENCE.
import { COMPANY_SIGNAL_COPY } from "@shared/companySignalCopy";
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
  // An unknown or hidden slug is the app's 404 (keep), rendered inside the
  // goal frame so the seeker keeps their bearings (packet item 4).
  if (company.error instanceof CompanyNotFoundError) {
    return (
      <GoalAppShell active="find" pageTitle="Find a referral">
        <div data-skipwait-screen="explore-company-not-found" className="max-w-[696px] px-8 pt-10 pb-8 max-gdesk:px-4 max-gdesk:pt-6">
          <BackLink />
          <NotFoundContent />
        </div>
      </GoalAppShell>
    );
  }
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
  // The door's own drawer close: after a sent ask, reopening starts a new ask
  // (the sent confirmation belongs to the send, not the door) - the same
  // fresh-form rule the directory drawer applies (packet item 4).
  const closeDrawer = (next: boolean) => {
    setDrawerOpen(next);
    if (!next && composer.sent) composer.clearAfterClose();
    if (!next && composer.postSelection) composer.selectPost(null);
  };
  return (
    <GoalAppShell
      active="find"
      pageTitle={company.name}
      drawer={
        <AskDrawer
          open={drawerOpen}
          onOpenChange={closeDrawer}
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
          topUp={composer.topUp}
          onTopUp={composer.onTopUp}
          sendLabel={composer.sendLabel}
          sendBusyLabel={composer.sendBusyLabel}
          sending={composer.sending}
          sendBlocked={composer.sendBlocked}
          sendGuidance={composer.sendGuidance}
          creditRecovery={composer.creditRecovery}
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
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="inline-flex size-12 shrink-0 items-center justify-center rounded-g-tile bg-g-surface-selected text-[16px] font-semibold tracking-[0.02em] text-g-ink-2">
              {company.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-g-meta text-g-ink-3">{company.functions.join(" · ")}</p>
              <h1 className="truncate text-g-display text-g-ink">{`Get referred at ${company.name}.`}</h1>
            </div>
          </div>
        </header>

        <div className="mt-6">
          <GoalNextStep reason={open ? "One request to a verified employee of this company." : `No verified employee can see asks yet. Yours waits free until one can - up to ${COVERAGE_WAIT_DAYS} days - and no credit is used until then.`}>
            <GoalButton variant="primary" touch="large" className="gdesk:min-w-[280px]" onClick={() => setDrawerOpen(true)}>Ask for a referral</GoalButton>
            <p className="mt-3 text-g-meta text-g-ink-3">{MONEY_SENTENCE}</p>
          </GoalNextStep>
        </div>
        {!open ? <p className="mt-3 text-g-meta text-g-ink-3"><Link href="/alerts" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Alert me</Link> when this company opens up.</p> : null}
        <p className="mt-3 text-g-meta text-g-ink-3"><Link href="/company/claim" className="underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink">Claim this company</Link> if you work here.</p>

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

// Company responsiveness (D-104, packet item 4): the shared companySignalCopy
// (content.json-synced) supplies every word, including its disclaimer. Nothing
// renders while the flag is off or the read fails. With too little data, the
// honest line; never an invented figure. Shown numbers are mono, averages only.
function Responsiveness({ slug }: { slug: string }) {
  const { data } = useCompanyResponseSignal(slug);
  if (!data) return null;
  return (
    <section className="mt-10 border-t border-g-hairline pt-6" data-testid="company-response-signal" aria-label="Company responsiveness">
      <h2 className={EYEBROW}>{COMPANY_SIGNAL_COPY.intro}</h2>
      {data.state === "shown" ? (
        <>
          <ShownSignal data={data} />
          <p className="mt-3 text-g-meta text-g-ink-3">{COMPANY_SIGNAL_COPY.disclaimer}</p>
        </>
      ) : (
        <>
          <p className="mt-3 text-g-meta text-g-ink-2">{COMPANY_SIGNAL_COPY.insufficient}</p>
          <p className="mt-1 text-g-meta text-g-ink-3">{COMPANY_SIGNAL_COPY.disclaimer}</p>
        </>
      )}
    </section>
  );
}

function ShownSignal({ data }: { data: CompanyResponseSignal }) {
  if (data.state !== "shown") return null;
  const rows: [string, number, string][] = [
    [COMPANY_SIGNAL_COPY.usualFirstReply, data.usualFirstReplyDays, data.usualFirstReplyDays === 1 ? COMPANY_SIGNAL_COPY.day : COMPANY_SIGNAL_COPY.days],
    [COMPANY_SIGNAL_COPY.answeredThisMonth, data.answeredThisMonth, ""],
    [COMPANY_SIGNAL_COPY.referrersInside, data.referrersInside, ""],
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
