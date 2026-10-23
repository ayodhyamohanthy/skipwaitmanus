// Goal /referrer-home (D-048-p3-referrer-home; packet docs/plans/D-048-referrer.md).
// Goal-first rebuild of the kit referrer home: the goal is "answer the asks
// waiting for you"; one commit per panel; record and thank-you wall stay
// private. The route is wrapped in AppShell, so this is inner content only.
// Data comes from referrerData read-only; sample rows keep the owner-directed
// inert SAMPLE behavior via ReferrerSampleRows (phonemsg-01M5FT6Z0SYN6QWFVDR3J3S2CS).
import { ArrowRight, BadgeCheck, CalendarClock, Clock3, Inbox, Pause, Play } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/_core/auth";
import { GoalButton, GoalErrorState, GoalSkeletonRows } from "@/components/goal";
import { usePersistFn } from "@/hooks/usePersistFn";
import { referrerSignInHref } from "@/lib/referrerSignIn";
import { displayJobFunction } from "@shared/jobFunctions";
import { ReferrerSampleRows } from "@/components/referrer-home/ReferrerSampleRows";
import { askCountdown, deriveReferrerHome, fetchReferrerHome, greetingFor, saveReferrerPreferences, type ReferrerHomeData, type ReferrerHomeView } from "@/components/referrer-home/referrerData";
import { reverifyCopy } from "../../ReferrerHome";

const SUBTITLE = "Here's what needs you today. Nothing here is urgent unless it says so.";

function Kicker({ children }: { children: string }) {
  return <p className="flex items-center gap-2 font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3"><span className="h-1.5 w-1.5 rounded-full bg-g-ink" aria-hidden="true" />{children}</p>;
}

function Banner({ tone, children }: { tone: "accent" | "muted"; children: React.ReactNode }) {
  return <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border p-4 ${tone === "accent" ? "border-g-ink" : "border-g-hairline"}`}>{children}</div>;
}

function Waiting({ view, nowMs }: { view: ReferrerHomeView; nowMs: number }) {
  const company = view.company;
  return (
    <section aria-label="Waiting for you">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><Kicker>YOUR NEXT STEP</Kicker><h2 className="mt-2 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Answer the asks waiting for you.</h2></div>
        <Link href="/queue" className="shrink-0 text-g-small font-medium text-g-ink-2 underline underline-offset-2 hover:text-g-ink">Full queue</Link>
      </div>
      {view.atCapacity ? (
        <div className="rounded-[10px] border border-g-hairline p-5">
          <h3 className="text-g-label font-semibold">You've hit your capacity.</h3>
          <p className="mt-1 text-g-small text-g-ink-2">Finish what's open first. Raise your limit only if you really have time.</p>
          <div className="mt-3"><GoalButton variant="outline" size="sm" asChild><Link href="/referrer?view=setup">Adjust capacity</Link></GoalButton></div>
        </div>
      ) : view.waiting.length === 0 && view.showSamples ? (
        <ReferrerSampleRows
          rows={[
            { name: "A. Sample · Product Analyst", time: "2H AGO", reason: "Asked for you by name. Three lines of why, no pile.", next: "Waiting on you · releases the credit if you pass" },
            { name: "B. Example · Data Engineer", time: "1D AGO", reason: "Sent to the company queue · fits what you said you can judge.", next: "Waiting on you" },
          ]}
          caption="Samples show what a real ask looks like. They are never counted and disappear after your first real ask."
        />
      ) : view.waiting.length === 0 ? (
        <div className="rounded-[10px] border border-g-hairline p-5 text-center">
          <Inbox className="mx-auto mb-2 h-6 w-6 text-g-ink-3" aria-hidden="true" />
          <h3 className="text-g-label font-semibold">{view.isNew ? "Your first ask will appear here." : "No asks right now."}</h3>
          <p className="mt-1 text-g-small text-g-ink-2">{view.isNew ? `Seekers can now find a verified referrer${company ? ` at ${company.name}` : ""}. Share your profile to help them find you.` : "Enjoy the quiet."}</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {view.waiting.map(item => {
            const countdown = askCountdown(item, nowMs);
            const files = item.attachmentCount ?? 0;
            const name = company?.name ?? item.companyDomain;
            return (
              <li key={item.id}>
                <Link href={`/queue?request=${item.id}`} aria-label={`Private ask · Ref-${1000 + item.id}`} className="flex min-h-14 items-center gap-3 rounded-[10px] border border-g-hairline p-4 transition-colors hover:border-g-control-edge">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border border-g-hairline font-g-mono text-[12px] text-g-ink">{company?.mark ?? (item.companyDomain.charAt(0) || "?").toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-g-label text-g-ink">{item.jobTitle?.trim() || `Private ask · Ref-${1000 + item.id}`}</strong>
                    <span className="block truncate text-g-meta text-g-ink-3">{displayJobFunction(item.jobFunction) ?? name}{item.askStrength ? ` · ask strength: ${item.askStrength === "strong" ? "Strong" : item.askStrength === "good" ? "Good" : "Basic"}` : ""}{files > 0 ? ` · ${files} ${files === 1 ? "file" : "files"} attached` : ""}</span>
                  </span>
                  {countdown ? <span className={`shrink-0 font-g-mono text-[11px] uppercase ${countdown.urgent ? "text-g-ink" : "text-g-ink-3"}`}>{countdown.label}</span> : null}
                  <ArrowRight className="h-4 w-4 shrink-0 text-g-ink-3" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function GoalReferrerHome() {
  const { isSignedIn, userId, getToken } = useAuth();
  const fetchToken = usePersistFn(getToken);
  const queryClient = useQueryClient();
  const queryKey = ["referrer-home", userId ?? null] as const;
  const home = useQuery({ queryKey, queryFn: () => fetchReferrerHome(fetchToken), enabled: Boolean(isSignedIn), retry: 1, refetchOnWindowFocus: false });
  const pause = useMutation({
    mutationFn: (paused: boolean) => saveReferrerPreferences(fetchToken, { paused }),
    onSuccess: preferences => queryClient.setQueryData<ReferrerHomeData>(queryKey, current => (current ? { ...current, preferences } : current)),
  });

  if (!isSignedIn) {
    return (
      <main data-skipwait-screen="referrer-home-sign-in" className="page-content bg-white font-g-sans text-g-ink">
        <div className="max-w-[560px]">
          <Kicker>REFERRER HOME</Kicker>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em]">Your daily referrer view.</h1>
          <p className="mt-3 text-g-body leading-[1.6] text-g-ink-2">New asks, capacity, and your private record - after you verify a work email.</p>
          <div className="mt-6"><GoalButton variant="primary" asChild><Link href={referrerSignInHref("/referrer-home")}>Sign in with work email</Link></GoalButton></div>
        </div>
      </main>
    );
  }

  const nowMs = Date.now();
  const view = home.data ? deriveReferrerHome(home.data, nowMs) : null;
  const company = view?.company ?? null;
  const setPaused = (paused: boolean) => { if (!pause.isPending) pause.mutate(paused); };

  return (
    <main data-skipwait-screen="referrer-home" className="page-content bg-white font-g-sans text-g-ink">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Kicker>{`REFERRER HOME${company ? ` · ${company.name.toUpperCase()}` : ""}`}</Kicker>
          <h1 className="mt-3 text-[32px] font-semibold leading-[1.05] tracking-[-0.03em]">{greetingFor(new Date(nowMs).getHours())}</h1>
          <p className="mt-2 text-g-body leading-[1.6] text-g-ink-2">{SUBTITLE}</p>
        </div>
        {view ? (
          <div className="flex flex-wrap items-center gap-2">
            {view.verified ? <span className="flex items-center gap-1.5 text-g-small text-g-ink-2"><BadgeCheck className="h-4 w-4" aria-hidden="true" />Verified · {company?.name ?? "work email"}</span> : null}
            <GoalButton variant="outline" size="sm" asChild><Link href="/queue">Queue &amp; settings</Link></GoalButton>
            {view.verified ? null : <GoalButton variant="ghost" size="sm" asChild><Link href="/verify">Become a referrer</Link></GoalButton>}
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        {home.isPending ? <GoalSkeletonRows density="queue" count={3} /> : home.isError ? (
          <GoalErrorState title="We could not load your referrer day." body={home.error.message || "Check your connection and try again."} retry={{ label: home.isFetching ? "Trying again…" : "Try again", onClick: () => { void home.refetch(); } }} />
        ) : !view || !view.verified ? (
          <div className="max-w-[560px] rounded-[10px] border border-g-hairline p-5 gdesk:p-6">
            <Kicker>YOUR NEXT STEP</Kicker>
            <h2 className="mt-3 text-[22px] font-semibold leading-[1.15] tracking-[-0.02em]">Verify a work email to begin.</h2>
            <p className="mt-2 text-g-small leading-[1.6] text-g-ink-2">A one-time code proves your company. Your identity stays hidden until you accept a request.</p>
            <div className="mt-5"><GoalButton variant="primary" asChild><Link href="/verify">Verify work email</Link></GoalButton></div>
          </div>
        ) : (
          <>
            {view.reverifyDue ? <Banner tone="accent"><span role="status" className="flex items-center gap-2 text-g-small text-g-ink"><CalendarClock className="h-4 w-4" aria-hidden="true" />{reverifyCopy(company?.name ?? "work", view.reverifyDaysLeft)}</span><GoalButton size="sm" asChild><Link href="/verify">Re-verify</Link></GoalButton></Banner> : null}
            {view.paused ? <Banner tone="muted"><span role="status" className="flex items-center gap-2 text-g-small text-g-ink"><Pause className="h-4 w-4" aria-hidden="true" />New asks are paused. Open conversations still work.</span><GoalButton size="sm" busy={pause.isPending} busyLabel="Resuming…" onClick={() => setPaused(false)}><Play className="h-4 w-4" aria-hidden="true" />Resume</GoalButton></Banner> : null}
            {pause.isError ? <p role="alert" className="mb-4 text-g-meta text-g-ink">{pause.error.message || "We could not update your pause setting. Try again."}</p> : null}

            <div className="grid gap-3 gdesk:grid-cols-3">
              <div className="rounded-[10px] border border-g-hairline p-4"><Inbox className="mb-2 h-4 w-4 text-g-ink-3" aria-hidden="true" /><strong className="block text-[28px] font-semibold leading-none">{view.waiting.length}</strong><p className="mt-1 text-g-meta text-g-ink-3">New asks waiting</p></div>
              <div className="rounded-[10px] border border-g-hairline p-4"><Clock3 className="mb-2 h-4 w-4 text-g-ink-3" aria-hidden="true" /><strong className="block text-[28px] font-semibold leading-none">{view.expiringSoon}</strong><p className="mt-1 text-g-meta text-g-ink-3">Expiring within 24h</p></div>
              <div className="rounded-[10px] border border-g-hairline p-4"><strong className="block text-[28px] font-semibold leading-none">{view.left}<span className="text-[16px] font-normal text-g-ink-3">/{view.capacity}</span></strong><p className="mt-1 text-g-meta text-g-ink-3">Capacity left this month</p><div className="mt-2 h-1 rounded-full bg-g-hairline" role="progressbar" aria-label="Capacity used" aria-valuenow={view.used} aria-valuemin={0} aria-valuemax={view.capacity}><span className="block h-full rounded-full bg-g-ink" style={{ width: `${view.capacity ? Math.min(100, (view.used / view.capacity) * 100) : 0}%` }} /></div></div>
            </div>

            <div className="mt-6 grid gap-6 gdesk:grid-cols-[minmax(0,1fr)_320px]">
              <Waiting view={view} nowMs={nowMs} />
              <aside className="grid content-start gap-4">
                <section className="rounded-[10px] border border-g-hairline p-4" aria-label="Your thank-you wall">
                  <Kicker>YOUR THANK-YOU WALL · PRIVATE</Kicker>
                  {(home.data?.thankYous?.thankYous ?? []).length === 0 ? <p className="mt-3 text-g-small text-g-ink-2">Notes from people you help will live here. Only you can see them.</p> : (
                    <ul className="mt-3 grid gap-2">
                      {(home.data?.thankYous?.thankYous ?? []).map(note => (
                        <li key={note.id} className="rounded-[8px] bg-g-surface-sunken p-3 text-g-small">
                          “{note.message}”
                          <footer className="mt-2 text-g-meta text-g-ink-3">{[note.seekerName, note.roleTitle].filter(Boolean).join(" · ")}</footer>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                <section className="rounded-[10px] border border-g-hairline p-4" aria-label="Invite a colleague">
                  <Kicker>INVITE A COLLEAGUE</Kicker>
                  <p className="mt-2 text-g-small text-g-ink-2">More verified colleagues means faster answers for seekers.</p>
                  <Link href="/invite?mode=invite" className="mt-1 inline-block text-g-small font-medium text-g-ink underline underline-offset-2">Invite someone inside</Link>
                </section>
                <section className="rounded-[10px] border border-g-hairline p-4" aria-label="Your record">
                  <Kicker>YOUR RECORD · PRIVATE</Kicker>
                  <dl className="mt-3 grid grid-cols-2 gap-3">
                    {([["Introductions", String(home.data?.impact?.introductions ?? 0)], ["People helped", String(home.data?.impact?.approved ?? 0)], ["Replied within 3 days", typeof home.data?.impact?.repliedWithin3DaysPct === "number" ? `${home.data.impact.repliedWithin3DaysPct}%` : "—"], ["Thank-yous", home.data?.thankYous ? String(home.data.thankYous.total) : "—"]] as const).map(([label, value]) => <div key={label}><dt className="text-g-meta text-g-ink-3">{label}</dt><dd className="text-[20px] font-semibold">{value}</dd></div>)}
                  </dl>
                  <p className="mt-3 text-g-meta text-g-ink-3">Never ranked. Never public.</p>
                </section>
                <GoalButton variant="outline" busy={pause.isPending} busyLabel={view.paused ? "Resuming…" : "Pausing…"} onClick={() => setPaused(!view.paused)}>
                  {view.paused ? <><Play className="h-4 w-4" aria-hidden="true" />Resume new asks</> : <><Pause className="h-4 w-4" aria-hidden="true" />Pause new asks</>}
                </GoalButton>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
