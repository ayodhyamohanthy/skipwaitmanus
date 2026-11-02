// Goal /referrer-home (D-048-p3-referrer-home; packet docs/plans/D-048-referrer.md).
// The server remains the authority for verification, request data and private impact.
import { ArrowRight, CalendarClock, Inbox, Pause, Play } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalEmptyState, GoalErrorState, GoalNextStep, GoalNum, GoalSkeletonRows, GoalVerifiedMark, useOnlineStatus } from "@/components/goal";
import { ReferrerSampleRows } from "@/components/referrer-home/ReferrerSampleRows";
import { askCountdown, deriveReferrerHome, fetchReferrerHome, saveReferrerPreferences, type InboxRow, type ReferrerHomeData, type ReferrerHomeView } from "@/components/referrer-home/referrerData";
import { usePersistFn } from "@/hooks/usePersistFn";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { displayJobFunction } from "@shared/jobFunctions";
import { REFERRER_MONEY_SENTENCE } from "@shared/moneyCopy";

export const GOAL_PAGE = { goalLine: "Help people get referred at your company." } as const;

function GoalIntro({ companyName }: { companyName?: string | null }) {
  return (
    <header className="max-w-[720px]">
      <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-3 max-w-[620px] text-g-body text-g-ink-2">Review referral requests from people looking to join your company, when you are ready.</p>
      {companyName ? <GoalVerifiedMark as="p" mutedText className="mt-3">{`Verified at ${companyName}`}</GoalVerifiedMark> : null}
      <p className="mt-3 text-g-meta text-g-ink-2">{REFERRER_MONEY_SENTENCE}</p>
    </header>
  );
}

function OfflineNotice() {
  return (
    <p data-testid="goal-offline-state" role="status" className="mt-4 flex items-center gap-2 text-g-meta text-g-ink-2">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-g-ink" />
      You’re offline. Information may be out of date until you reconnect.
    </p>
  );
}

function CountCard({ label, value, icon }: { label: string; value: number; icon?: ReactNode }) {
  return (
    <section className="rounded-g-tile border border-g-hairline p-4">
      {icon ? <span className="mb-2 block text-g-ink-3">{icon}</span> : null}
      <p><GoalNum>{value}</GoalNum></p>
      <p className="mt-1 text-g-meta text-g-ink-2">{label}</p>
    </section>
  );
}

function Countdown({ label, urgent }: { label: string; urgent: boolean }) {
  const parts = /^(\d+) (day|days) left$/.exec(label);
  return (
    <span className={`shrink-0 text-g-meta ${urgent ? "text-g-ink" : "text-g-ink-3"}`}>
      {parts ? <><GoalNum>{parts[1]}</GoalNum> {parts[2]} left</> : label}
    </span>
  );
}

function RequestTitle({ item }: { item: InboxRow }) {
  const title = item.jobTitle?.trim();
  return <strong className="block truncate text-g-label text-g-ink">{title || <>Private referral request · Ref-<GoalNum>{1000 + item.id}</GoalNum></>}</strong>;
}

function Waiting({ view, nowMs }: { view: ReferrerHomeView; nowMs: number }) {
  const company = view.company;
  return (
    <section aria-labelledby="referrer-requests-heading" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <h2 id="referrer-requests-heading" className="text-g-heading text-g-ink">Referral requests waiting for your review</h2>
        <Link href="/queue" className="text-g-meta font-medium text-g-ink underline underline-offset-2">Full referral queue</Link>
      </div>
      {view.atCapacity ? (
        <GoalEmptyState title="You have reached your referral capacity." body="Review open referral requests before taking on more." />
      ) : view.waiting.length === 0 && view.showSamples ? (
        <ReferrerSampleRows
          kick="SAMPLE · NOT REAL REFERRAL REQUESTS"
          rows={[
            { name: "A. Sample · Product Analyst", time: "RECENT", reason: "They named you and shared why you may be a fit.", next: "Waiting for your review." },
            { name: "B. Example · Data Engineer", time: "EARLIER", reason: "Sent to your company’s referral queue.", next: "Review the details before deciding." },
          ]}
          caption="Examples only; these rows do not count toward your capacity or private record."
        />
      ) : view.waiting.length === 0 ? (
        <GoalEmptyState
          title={view.isNew ? "Your first referral request will appear here." : "No referral requests right now."}
          body={view.isNew ? `People can find verified referrers${company ? ` at ${company.name}` : ""}. Share your profile when you are ready.` : "Your queue is clear for now."}
        />
      ) : (
        <ul className="grid gap-2">
          {view.waiting.map(item => {
            const countdown = askCountdown(item, nowMs);
            const files = item.attachmentCount ?? 0;
            const companyName = company?.name ?? item.companyDomain;
            const fit = item.askStrength === "strong" ? "Strong" : item.askStrength === "good" ? "Good" : item.askStrength === "basic" ? "Basic" : null;
            return (
              <li key={item.id}>
                <Link href={`/queue?request=${item.id}`} aria-label={`Private referral request · Ref-${1000 + item.id}`} className="flex min-h-14 items-center gap-3 rounded-g-tile border border-g-hairline p-4 transition-colors hover:border-g-control-edge">
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-g-control border border-g-hairline text-g-meta text-g-ink">{company?.mark ?? (item.companyDomain.charAt(0) || "?").toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <RequestTitle item={item} />
                    <span className="block truncate text-g-meta text-g-ink-3">
                      {displayJobFunction(item.jobFunction) ?? companyName}
                      {fit ? ` · referral fit: ${fit}` : ""}
                      {files > 0 ? <> · <GoalNum>{files}</GoalNum> attached {files === 1 ? "file" : "files"}</> : null}
                    </span>
                  </span>
                  {countdown ? <Countdown label={countdown.label} urgent={countdown.urgent} /> : null}
                  <ArrowRight className="size-4 shrink-0 text-g-ink-3" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Goal-local re-verify sentence. The goal page keeps its own copy instead of importing the
// kit page's formatter and regex-patching the retired noun out of it afterwards.
function reverifyCopyGoal(company: string, daysLeft: number | null): string {
  if (daysLeft === null || daysLeft <= 0) return `Re-verify your ${company} email now to keep receiving referral requests.`;
  return `Re-verify your ${company} email within ${daysLeft} ${daysLeft === 1 ? "day" : "days"} to keep receiving referral requests.`;
}

function ReverifyNotice({ companyName, daysLeft }: { companyName: string; daysLeft: number | null }) {
  const message = reverifyCopyGoal(companyName, daysLeft);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-g-tile border border-g-hairline p-4">
      <span role="status" className="flex items-center gap-2 text-g-meta text-g-ink">
        <CalendarClock className="size-4 shrink-0" aria-hidden="true" />
        {message}
      </span>
      <GoalButton variant="ghost" size="sm" asChild><Link href="/verify">Re-verify</Link></GoalButton>
    </div>
  );
}

function Metric({ label, value }: { label: ReactNode; value: string | number }) {
  return (
    <div>
      <dt className="text-g-meta text-g-ink-3">{label}</dt>
      <dd className="mt-1 text-g-ink">{value === "—" ? "—" : <GoalNum>{value}</GoalNum>}</dd>
    </div>
  );
}

export default function GoalReferrerHome() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const queryKey = ["referrer-home", userId ?? null] as const;
  const home = useQuery({ queryKey, queryFn: () => fetchReferrerHome(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false });
  const pause = useMutation({
    mutationFn: (paused: boolean) => saveReferrerPreferences(fetchToken, { paused }),
    onSuccess: preferences => queryClient.setQueryData<ReferrerHomeData>(queryKey, current => (current ? { ...current, preferences } : current)),
  });

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-home-sign-in" data-goal-page="referrer-home" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
        <GoalIntro />
        <div className="mt-6 max-w-[640px]">
          <GoalNextStep reason="Sign in with your work email to review referral requests for your company.">
            <GoalButton variant="primary" touch="large" asChild><Link href={referrerSignInHref("/referrer-home")}>Sign in with work email</Link></GoalButton>
          </GoalNextStep>
        </div>
      </main>
    );
  }

  const nowMs = Date.now();
  const view = home.data ? deriveReferrerHome(home.data, nowMs) : null;
  const company = view?.company ?? null;
  const setPaused = (paused: boolean) => { if (!pause.isPending && online) pause.mutate(paused); };
  const nextStep = view?.atCapacity
    ? { reason: "Review open referral requests before taking on more.", href: "/queue", label: "Review open referrals" }
    : view?.waiting.length
      ? { reason: "Review the referral requests waiting for you.", href: "/queue", label: "Open referral queue" }
      : view?.paused
        ? { reason: "Your referral queue is paused. Update your preferences when you are ready.", href: "/referrer-setup", label: "Review referral settings" }
        : { reason: "Set your roles and monthly capacity so people can find the right referrer.", href: "/referrer-setup", label: "Set referral preferences" };

  return (
    <main data-skipwait-screen="referrer-home" data-goal-page="referrer-home" className="g-scope mx-auto w-full max-w-[1120px] bg-g-canvas px-4 py-6 font-g-sans text-g-ink gdesk:px-8 gdesk:py-8">
      <GoalIntro companyName={view?.verified ? company?.name ?? "work email" : undefined} />
      {!online ? <OfflineNotice /> : null}

      <div className="mt-6 max-w-[760px]">
        {home.isPending ? (
          <>
            <GoalNextStep reason="We are checking your verified access and referral queue.">
              <GoalButton variant="primary" touch="large" asChild><Link href="/queue">Open referral queue</Link></GoalButton>
            </GoalNextStep>
            <GoalSkeletonRows density="queue" count={3} className="mt-5 px-0" />
          </>
        ) : home.isError ? (
          <>
            <GoalNextStep reason="You can still open your referral queue while we reconnect.">
              <GoalButton variant="primary" touch="large" asChild><Link href="/queue">Open referral queue</Link></GoalButton>
            </GoalNextStep>
            <GoalErrorState className="mt-3 px-0" title="We could not load your referral home." body={home.error.message || "Check your connection and try again."} retry={{ label: home.isFetching ? "Trying again…" : "Try again", onClick: () => { void home.refetch(); } }} />
          </>
        ) : !view || !view.verified ? (
          <>
            <GoalNextStep reason="Verify your work email to review referral requests from your company.">
              <GoalButton variant="primary" touch="large" asChild><Link href="/verify">Verify work email</Link></GoalButton>
            </GoalNextStep>
            <GoalEmptyState className="mt-3" title="Verify a work email to begin." body="A one-time work-email code confirms your company. Your identity stays hidden until you accept a referral request." />
            <GoalButton className="mt-2" variant="ghost" asChild><Link href="/verify">Become a referrer</Link></GoalButton>
          </>
        ) : (
          <>
            <GoalNextStep reason={nextStep.reason}>
              <GoalButton variant="primary" touch="large" asChild><Link href={nextStep.href}>{nextStep.label}</Link></GoalButton>
            </GoalNextStep>

            {view.reverifyDue ? <ReverifyNotice companyName={company?.name ?? "work"} daysLeft={view.reverifyDaysLeft} /> : null}
            {view.paused ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-g-tile border border-g-hairline p-4">
                <p role="status" className="flex items-center gap-2 text-g-meta text-g-ink"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-g-amber" />New referral requests are paused. Open conversations remain available.</p>
                <GoalButton variant="ghost" size="sm" busy={pause.isPending} busyLabel="Resuming…" disabledReason={!online ? "Reconnect to update your referral settings." : undefined} onClick={() => setPaused(false)}><Play className="size-4" aria-hidden="true" />Resume</GoalButton>
              </div>
            ) : null}
            {pause.isError ? <p role="alert" className="mt-3 text-g-meta text-g-ink">{pause.error.message || "We could not update your referral settings. Try again."}</p> : null}

            <div className="mt-5 grid gap-2 gdesk:grid-cols-3">
              <CountCard label="Referral requests waiting" value={view.waiting.length} icon={<Inbox className="size-4" aria-hidden="true" />} />
              <CountCard label="Expiring soon" value={view.expiringSoon} icon={<CalendarClock className="size-4" aria-hidden="true" />} />
              <section className="rounded-g-tile border border-g-hairline p-4">
                <p><GoalNum>{view.left}</GoalNum><span className="text-g-meta text-g-ink-3"> / </span><GoalNum>{view.capacity}</GoalNum></p>
                <p className="mt-1 text-g-meta text-g-ink-2">Monthly capacity remaining</p>
                <div className="mt-2 h-1 rounded-full bg-g-hairline" role="progressbar" aria-label="Referral capacity used" aria-valuenow={view.used} aria-valuemin={0} aria-valuemax={view.capacity}>
                  <span className="block h-full rounded-full bg-g-ink" style={{ width: `${view.capacity ? Math.min(100, (view.used / view.capacity) * 100) : 0}%` }} />
                </div>
              </section>
            </div>

            <div className="mt-6 grid gap-6 gdesk:grid-cols-[minmax(0,1fr)_320px]">
              <Waiting view={view} nowMs={nowMs} />
              <aside className="grid content-start gap-4">
                <section className="rounded-g-tile border border-g-hairline p-4" aria-label="Your private thank-you notes">
                  <h2 className="text-g-label font-semibold text-g-ink">Thank-you notes</h2>
                  <p className="mt-1 text-g-meta text-g-ink-3">Private to you</p>
                  {(home.data?.thankYous?.thankYous ?? []).length === 0 ? <p className="mt-3 text-g-meta text-g-ink-2">Notes from people you help will appear here. Only you can see them.</p> : (
                    <ul className="mt-3 grid gap-2">
                      {(home.data?.thankYous?.thankYous ?? []).map(note => (
                        <li key={note.id} className="rounded-g-tile bg-g-surface-sunken p-3 text-g-meta text-g-ink">“{note.message}”<footer className="mt-2 text-g-meta text-g-ink-3">{[note.seekerName, note.roleTitle].filter(Boolean).join(" · ")}</footer></li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="rounded-g-tile border border-g-hairline p-4" aria-label="Invite a colleague">
                  <h2 className="text-g-label font-semibold text-g-ink">Invite a colleague</h2>
                  <p className="mt-2 text-g-meta text-g-ink-2">More verified colleagues can help more people find a referral.</p>
                  <Link href="/invite?mode=invite" className="mt-2 inline-block text-g-meta font-medium text-g-ink underline underline-offset-2">Invite someone inside</Link>
                </section>
                <section className="rounded-g-tile border border-g-hairline p-4" aria-label="Your private referral record">
                  <h2 className="text-g-label font-semibold text-g-ink">Your private record</h2>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    <Metric label="Introductions" value={home.data?.impact?.introductions ?? 0} />
                    <Metric label="People helped" value={home.data?.impact?.approved ?? 0} />
                    <Metric label={<>Replied within <GoalNum>3</GoalNum> days</>} value={typeof home.data?.impact?.repliedWithin3DaysPct === "number" ? `${home.data.impact.repliedWithin3DaysPct}%` : "—"} />
                    <Metric label="Thank-yous" value={home.data?.thankYous ? home.data.thankYous.total : "—"} />
                  </dl>
                  <p className="mt-3 text-g-meta text-g-ink-3">Never ranked. Never public.</p>
                </section>
                <GoalButton variant="ghost" busy={pause.isPending} busyLabel={view.paused ? "Resuming…" : "Pausing…"} disabledReason={!online ? "Reconnect to update your referral settings." : undefined} onClick={() => setPaused(!view.paused)}>
                  {view.paused ? <><Play className="size-4" aria-hidden="true" />Resume referral requests</> : <><Pause className="size-4" aria-hidden="true" />Pause referral requests</>}
                </GoalButton>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
