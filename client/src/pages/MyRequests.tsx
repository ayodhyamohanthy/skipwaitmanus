// Seeker asks (goal UI, D-048 phase 3 pilot). The list and its numbers come only
// from GET /api/company-referrals/mine (open asks against the plan's cap,
// server-counted). Each row opens its thread, where an unclaimed ask can be
// withdrawn. No preview states or invented counts ship here. Exception (owner
// override, Oct 21 11:35 PM, verified phonemsg-01M5FT6Z0SYN6QWFVDR3J3S2CS): a
// first-time seeker's empty list shows unmistakably-marked SAMPLE rows
// (GoalSampleRows) that never touch counts, slots, credits or routes.
import { LockKeyhole, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/auth";
import {
  GoalAppShell,
  GoalButton,
  GoalEmptyState,
  GoalErrorState,
  GoalListSection,
  GoalNum,
  GoalSkeletonRows,
  GoalStatus,
} from "@/components/goal";
import { askView } from "@/components/requests/askView";
import { companyIdentity } from "@/components/inbox/inboxThreads";
import { GoalSampleRows, type GoalSampleRow } from "@/components/goal/GoalSampleRows";
import { canWithdrawRequest, isClosedRequest, requestNote, slotsFullCopy } from "@/components/requests/requestModel";
import { fetchMyRequests, type ReferralRequest } from "@/components/requests/requestsApi";
import { useSlowLoad } from "@/hooks/useSlowLoad";
import { usePersistFn } from "@/hooks/usePersistFn";
import { formatDay, useDisplayPrefs } from "@/lib/displayPrefs";

const SUBTITLE = "Where each ask stands and what happens next.";

/**
 * The row's third line (my-asks comp): the next real step in plain words. Only
 * states whose next step is knowable get a sentence; everything else falls back
 * to the model's own note, so the line never promises a credit movement the
 * payload cannot prove.
 */
function askNextLine(request: ReferralRequest, nowMs: number, company: string): string {
  if (request.status === "pending") {
    const claimed = request.referrerId !== null && request.heldForReferrer !== true && request.unclaimedAssignment !== true;
    return claimed ? "Nothing to do yet. You’ll hear from us when they decide." : requestNote(request, nowMs);
  }
  if ((request.status === "approved" || request.status === "intro_made") && request.unreadMessageCount > 0) return requestNote(request, nowMs);
  if (request.status === "approved") return `Your referrer submits it through ${company}’s process, then marks it Referred.`;
  if (request.status === "intro_made") return `Watch your email for ${company}’s recruiters. Companies decide hiring.`;
  if (request.status === "declined") return request.referrerMessage ?? "The referrer declined this ask.";
  if (request.status === "withdrawn") return "You withdrew this ask.";
  if (request.status === "closed") return request.referrerId ? "This ask is closed." : "No verified employee picked it up in time.";
  return requestNote(request, nowMs);
}

/** Three lines as the comp draws them: company + status, role + date, then the next step. */
function AskRow({ request, nowMs }: { request: ReferralRequest; nowMs: number }) {
  const company = companyIdentity(request);
  const view = askView(request);
  const unclaimed = view.label === "Waiting";
  const day = formatDay(unclaimed ? request.createdAt : request.updatedAt) ?? "Recorded";
  return (
    <li data-testid="goal-list-row">
      <Link
        href={`/conversation/${request.id}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 rounded-g-tile px-3 py-3 text-left hover:bg-g-surface-hover"
      >
        <span className="min-w-0 truncate text-g-label text-g-ink">{company.name}</span>
        <span className="justify-self-end"><GoalStatus status={view.status} label={view.label} stepper={view.stepper} /></span>
        <span className="min-w-0 truncate text-g-meta text-g-ink-2">{request.title || "Referral request"}</span>
        <span className="justify-self-end whitespace-nowrap text-g-meta text-g-ink-3">{view.verb} <GoalNum>{day}</GoalNum></span>
        <span className="col-span-2 mt-1 min-w-0 text-g-meta text-g-ink-3">{askNextLine(request, nowMs, company.name)}</span>
      </Link>
    </li>
  );
}

function PageHeading({ slots, loading, failed = false, onReload, showAction = true }: { slots: Awaited<ReturnType<typeof fetchMyRequests>>["slots"]; loading: boolean; failed?: boolean; onReload: () => void; showAction?: boolean }) {
  return (
    <header className="grid gap-1 px-4 pt-6 pb-1 gdesk:px-5 gdesk:pt-7 gdesk:pb-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-g-display text-g-ink">Get your asks answered.</h1>
        {showAction ? (
          <GoalButton variant="ghost" asChild>
            <Link href="/explore"><Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />New ask</Link>
          </GoalButton>
        ) : null}
      </div>
      <p className="text-g-body text-g-ink-2">{SUBTITLE}</p>
      {loading || failed ? null : slots ? (
        <p data-testid="asks-slots" className="mt-1 text-g-meta text-g-ink-2">
          Open asks <GoalNum>{slots.open}</GoalNum> of <GoalNum>{slots.cap}</GoalNum> · {slots.planLabel} plan
        </p>
      ) : (
        <p data-testid="asks-slots-error" className="mt-1 flex items-center gap-2 text-g-meta text-g-ink-2">
          Open asks didn’t load.
          <GoalButton size="xs" variant="ghost" onClick={onReload}>Reload</GoalButton>
        </p>
      )}
    </header>
  );
}

/** This is navigation only: the existing conversation owns confirmation eligibility and mutations. */
function NextStep({ requests }: { requests: ReferralRequest[] }) {
  const target = requests.find(request => request.status === "intro_made")
    ?? requests.find(request => request.status === "approved" && request.unreadMessageCount > 0)
    ?? requests.find(request => request.status === "approved")
    ?? requests.find(request => !isClosedRequest(request));
  const referred = target?.status === "intro_made";
  const unread = target?.status === "approved" && target.unreadMessageCount > 0;
  const label = referred ? "Check referral update" : unread ? "Read update" : target ? "View ask" : "Find a company";
  const detail = referred ? "Open the conversation to check the referral update and any next steps."
    : unread ? "Your accepted ask has an unread update. Open the conversation to read it."
    : target ? "Open your ask to see its latest status and what happens next."
    : "Find a company and write one great ask. You’ll see the cost before sending.";
  return (
    <section aria-labelledby="requests-next-step" className="mx-4 my-5 border border-g-hairline p-4 gdesk:mx-5">
      <h2 id="requests-next-step" className="text-g-heading text-g-ink">Your next step</h2>
      {target ? <p className="mt-2 text-g-label text-g-ink">{companyIdentity(target).name} · {target.title || "Referral request"}</p> : null}
      <p className="mt-2 text-g-meta text-g-ink-2">{detail}</p>
      <GoalButton variant="primary" asChild className="mt-4">
        <Link href={target ? `/conversation/${target.id}` : "/explore"}>{label}</Link>
      </GoalButton>
    </section>
  );
}

/**
 * The three sample rows teach the FORWARD journey only (Waiting -> Accepted ->
 * Referred; no failure states in a first-run teaching moment). Next-step lines
 * reuse the shipped askNextLine copy verbatim so the teaching stays accurate
 * (mock design/goal-ui/captures/my-asks/myasks-sample-390). Placeholder-by-
 * inspection names; dates derive from today so they never stale.
 */
function sampleAskRows(nowMs: number): GoalSampleRow[] {
  const day = 24 * 60 * 60 * 1000;
  const at = (offsetDays: number) => formatDay(new Date(nowMs - offsetDays * day).toISOString()) ?? "";
  return [
    { company: "Sample Co.", title: "Product Designer", status: "waiting", label: "Waiting", stepper: { stage: 0 }, verb: "Sent", day: at(0), next: "Expires in 7 days if nobody picks it up. The credit comes back." },
    { company: "Example Industries", title: "Frontend Engineer", status: "accepted", label: "Accepted", stepper: { stage: 2 }, verb: "Accepted", day: at(2), next: "Your referrer submits it, then marks it Referred." },
    { company: "Placeholder Ltd.", title: "Data Analyst", status: "referred", label: "Referred", stepper: { stage: 3 }, verb: "Referred", day: at(4), next: "Watch your email for their recruiters. Companies decide hiring." },
  ];
}

export default function MyRequests() {
  const [, go] = useLocation();
  const { isLoaded, isSignedIn, userId, getToken, openSignIn } = useAuth();
  const fetchToken = usePersistFn(getToken);
  useDisplayPrefs();

  const scope = userId ?? "session";
  const requestsQuery = useQuery({ queryKey: ["requests", "mine", scope], enabled: isSignedIn, retry: false, queryFn: () => fetchMyRequests(fetchToken) });

  const loading = isSignedIn && (requestsQuery.isPending || (requestsQuery.isError && requestsQuery.isFetching));
  const { showSkeleton, isSlow } = useSlowLoad(loading);

  const shell = (body: ReactNode) => <GoalAppShell active="asks" pageTitle="My referrals">{body}</GoalAppShell>;

  if (!isLoaded) {
    return shell(
      <main data-skipwait-screen="my-requests" data-skipwait-loading="true" className="w-full max-w-[var(--g-asks-list-w)] pb-10 gdesk:min-h-[calc(100vh-var(--g-topbar-h))] gdesk:border-r gdesk:border-g-hairline">
        <PageHeading slots={null} loading onReload={() => {}} />
        <GoalSkeletonRows density="ask" count={3} className="mt-4" />
      </main>,
    );
  }

  if (!isSignedIn) {
    return shell(
      <main data-skipwait-screen="my-requests-sign-in" className="w-full max-w-[var(--g-asks-list-w)] pb-10 gdesk:min-h-[calc(100vh-var(--g-topbar-h))] gdesk:border-r gdesk:border-g-hairline">
        <PageHeading slots={null} loading onReload={() => {}} showAction={false} />
        <section className="mx-5 mt-6 border-t border-g-hairline pt-6 max-gdesk:mx-4" aria-labelledby="requests-sign-in">
          <LockKeyhole className="size-5 text-g-ink-2" aria-hidden="true" />
          <h2 id="requests-sign-in" className="mt-3 text-g-heading text-g-ink">See the real status.</h2>
          <p className="mt-1 text-g-meta text-g-ink-2">Return to your private request updates. We show routing, claim, and real decisions only.</p>
          <GoalButton variant="primary" className="mt-4" onClick={() => openSignIn()}>Secure sign in</GoalButton>
        </section>
      </main>,
    );
  }

  const requests = requestsQuery.data?.requests ?? [];
  const slots = requestsQuery.data?.slots ?? null;
  const loadError = requestsQuery.isError && !requestsQuery.isFetching ? requestsQuery.error.message : "";
  const ready = !showSkeleton && !loadError && requestsQuery.isSuccess;
  const nowMs = Date.now();
  const active = requests.filter(request => !isClosedRequest(request));
  const closed = requests.filter(isClosedRequest);
  const full = slots?.full ? slotsFullCopy(slots, requests.some(canWithdrawRequest)) : null;

  let body: ReactNode = null;
  if (showSkeleton) {
    body = (
      <div role="status" aria-busy="true" aria-live="polite" data-skipwait-loading="true" className="mt-4">
        <p className="sr-only">Loading your requests… Routing checks usually take a second.</p>
        <GoalSkeletonRows density="ask" count={3} />
        {isSlow ? <p data-skipwait-loading-slow="true" className="px-3 pt-3 text-g-meta text-g-ink-2">This is taking longer than expected. Nothing was lost — you can keep waiting or come back in a moment.</p> : null}
      </div>
    );
  } else if (loadError) {
    body = (
      <>
        <GoalErrorState
          className="mt-2"
          title="We couldn’t load your requests"
          body={`${loadError}. Your requests are still active and nothing was lost.`}
          retry={{ label: "Try again", onClick: () => { void requestsQuery.refetch(); } }}
        />
        <div className="mt-1 px-5 max-gdesk:px-4">
          <GoalButton flush size="sm" variant="ghost" onClick={() => go("/")}>Back to home</GoalButton>
        </div>
      </>
    );
  } else if (ready) {
    body = (
      <>
        <NextStep requests={requests} />
        {full ? (
          <p role="status" className="mx-4 mt-3 rounded-g-tile bg-g-surface-sunken px-3 py-2 text-g-meta text-g-ink-2 gdesk:mx-5">
            {full.lead} {full.next}
            {slots?.nextPlan ? <> <Link href="/plans" className="text-g-ink underline underline-offset-[3px]">See plans</Link></> : null}
          </p>
        ) : null}
        <div className="px-1 gdesk:px-2">
          {active.length > 0 ? (
            <GoalListSection label="Active" count={active.length}>
              {active.map(request => <AskRow key={request.id} request={request} nowMs={nowMs} />)}
            </GoalListSection>
          ) : requests.length > 0 ? (
            <section className="px-3 pt-5" aria-labelledby="no-open-asks">
              <h2 id="no-open-asks" className="text-g-label text-g-ink">No open asks.</h2>
              <p className="mt-1 text-g-meta text-g-ink-2">Pick a company, find a verified referrer, and write one great ask.</p>
            </section>
          ) : null}
          {closed.length > 0 ? (
            <GoalListSection label="Closed" count={closed.length}>
              {closed.map(request => <AskRow key={request.id} request={request} nowMs={nowMs} />)}
            </GoalListSection>
          ) : requests.length === 0 ? null : (
            <section className="px-3 pt-5" aria-labelledby="nothing-closed">
              <h2 id="nothing-closed" className="text-g-label text-g-ink">Nothing closed yet.</h2>
              <p className="mt-1 text-g-meta text-g-ink-3">Closed asks will appear here.</p>
            </section>
          )}
        </div>
        {requests.length === 0 ? (
          requestsQuery.data?.hasEverAsked === false ? (
            <>
              <GoalSampleRows rows={sampleAskRows(nowMs)} caption="Samples show what a real ask looks like. They are not counted in your open asks and disappear after your first real ask." />
              <div className="mt-3 flex flex-wrap items-center gap-4 px-3 gdesk:px-4">
                <GoalButton variant="ghost" onClick={() => go("/explore")}>Explore companies</GoalButton>
                <Link href="/onboarding" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink">Finish setup</Link>
              </div>
            </>
          ) : (
            <>
              <GoalEmptyState className="pb-3" title="No asks yet." body="Pick a company, find a verified referrer, and write one great ask." action={{ label: "Explore companies", onClick: () => go("/explore") }} />
              <p className="px-5 pb-6 max-gdesk:px-4">
                <Link href="/onboarding" className="text-g-meta text-g-ink-2 underline underline-offset-[3px] hover:text-g-ink">Finish setup</Link>
              </p>
            </>
          )
        ) : null}
      </>
    );
  }

  return shell(
    <main data-skipwait-screen="my-requests" className="w-full max-w-[var(--g-asks-list-w)] pb-10 gdesk:min-h-[calc(100vh-var(--g-topbar-h))] gdesk:border-r gdesk:border-g-hairline">
      <PageHeading slots={slots} loading={false} failed={Boolean(loadError)} onReload={() => { void requestsQuery.refetch(); }} />
      {body}
    </main>,
  );
}
