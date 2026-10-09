import { ArrowRight, BadgeCheck, CalendarClock, Clock3, Inbox, Pause, Play, ShieldCheck } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { SignInButton, useAuth } from "@/_core/auth";
import { usePersistFn } from "@/hooks/usePersistFn";
import { Button, buttonVariants } from "@/components/kit/button";
import { Heading, Panel } from "@/components/kit/preview-kit";
import { HomeAside } from "@/components/referrer-home/HomeAside";
import { WaitingAsks } from "@/components/referrer-home/WaitingAsks";
import { deriveReferrerHome, fetchReferrerHome, greetingFor, saveReferrerPreferences, type ReferrerHomeData } from "@/components/referrer-home/referrerData";

const SUBTITLE = "Here's what needs you today. Nothing here is urgent unless it says so.";

export default function ReferrerHome() {
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
      <main data-skipwait-screen="referrer-home-sign-in" className="page-content">
        <Heading eyebrow="REFERRER HOME" title="Your daily referrer view" text="New asks, capacity, and your private record — after you verify a work email." />
        <SignInButton className={buttonVariants()}>Sign in</SignInButton>
      </main>
    );
  }

  const nowMs = Date.now();
  const view = home.data ? deriveReferrerHome(home.data, nowMs) : null;
  const company = view?.company ?? null;
  const setPaused = (paused: boolean) => { if (!pause.isPending) pause.mutate(paused); };
  const aside = view ? (
    <div className="flex flex-wrap items-center gap-2">
      {view.verified ? <span className="flex items-center gap-1 text-sm"><BadgeCheck className="size-4 text-primary" />Verified · {company?.name ?? "work email"}</span> : null}
      <Button variant="outline" size="sm" asChild><Link href="/queue">Queue &amp; settings</Link></Button>
      {view.verified ? null : <Button variant="ghost" size="sm" asChild><Link href="/verify">Become a referrer</Link></Button>}
    </div>
  ) : undefined;

  return (
    <main data-skipwait-screen="referrer-home" className="page-content">
      <Heading eyebrow={`REFERRER HOME${company ? ` · ${company.name}` : ""}`} title={greetingFor(new Date(nowMs).getHours())} text={SUBTITLE} aside={aside} />

      <div className="mt-5">
      {home.isPending ? <p role="status" className="mt-10 text-center text-sm text-muted-foreground">Loading your referrer day…</p> : home.isError ? (
        <Panel tone="muted" className="text-center">
          <h2 className="text-xl font-semibold">We could not load your referrer day.</h2>
          <p role="alert" className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{home.error.message || "Check your connection and try again."}</p>
          <Button className="mt-4" disabled={home.isFetching} onClick={() => { void home.refetch(); }}>{home.isFetching ? "Trying again…" : "Try again"}</Button>
        </Panel>
      ) : !view || !view.verified ? (
        <Panel className="text-center">
          <h2 className="text-xl font-semibold">Verify a work email to begin.</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">A one-time code proves your company. Your identity stays hidden until you accept a request.</p>
          <Button className="mt-5" asChild><Link href="/verify">Verify work email <ArrowRight /></Link></Button>
        </Panel>
      ) : (
        <>
          {view.reverifyDue ? <Panel tone="accent" className="mb-4 flex flex-wrap items-center justify-between gap-3"><span role="status" className="flex items-center gap-2"><CalendarClock />Re-verify your {company?.name ?? "work"} email soon to keep receiving asks.</span><Button asChild size="sm"><Link href="/verify">Re-verify</Link></Button></Panel> : null}
          {view.paused ? <Panel tone="muted" className="mb-4 flex flex-wrap items-center justify-between gap-3"><span role="status" className="flex items-center gap-2"><Pause />New asks are paused. Open conversations still work.</span><Button size="sm" disabled={pause.isPending} onClick={() => setPaused(false)}><Play />{pause.isPending ? "Resuming…" : "Resume"}</Button></Panel> : null}
          {pause.isError ? <p role="alert" className="mb-4 text-sm font-semibold text-destructive">{pause.error.message || "We could not update your pause setting. Try again."}</p> : null}

          <div className="grid gap-3 sm:grid-cols-3">
            <Panel><Inbox className="mb-2 size-5" /><strong className="text-3xl">{view.waiting.length}</strong><p className="text-sm text-muted-foreground">New asks waiting</p></Panel>
            <Panel><Clock3 className="mb-2 size-5" /><strong className="text-3xl">{view.expiringSoon}</strong><p className="text-sm text-muted-foreground">Expiring within 24h</p></Panel>
            <Panel>
              <ShieldCheck className="mb-2 size-5" /><strong className="text-3xl">{view.left}<span className="text-lg text-muted-foreground">/{view.capacity}</span></strong><p className="text-sm text-muted-foreground">Capacity left this month</p>
              <div className="mt-2 h-1.5 rounded-full bg-muted" role="progressbar" aria-label="Capacity used" aria-valuenow={view.used} aria-valuemin={0} aria-valuemax={view.capacity}><span className="block h-full rounded-full bg-primary" style={{ width: `${view.capacity ? Math.min(100, (view.used / view.capacity) * 100) : 0}%` }} /></div>
            </Panel>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <WaitingAsks view={view} nowMs={nowMs} />
            <HomeAside impact={home.data?.impact ?? null} paused={view.paused} pending={pause.isPending} onToggle={() => setPaused(!view.paused)} />
          </div>
        </>
      )}
      </div>
    </main>
  );
}
