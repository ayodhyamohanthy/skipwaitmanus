// Kit v4 loading, error and empty states for the seeker Requests screen.
// Empty copy and layout follow app/src/routes/requests.tsx; loading and error
// keep the live screen's honest copy on kit Panel / Button surfaces.
import { LoaderCircle, Send } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/kit/button";
import { Panel } from "@/components/kit/preview-kit";
import { ZeroActivityShareCard } from "@/components/ZeroActivityShareCard";

export function RequestsLoading({ slow }: { slow: boolean }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" data-skipwait-loading="true" className="mt-6">
      <Panel>
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted"><LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Loading your requests…</p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">Routing checks usually take a second.</p>
          </div>
        </div>
        <div aria-hidden="true" className="mt-4 space-y-2">
          <div className="h-2.5 w-3/4 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="h-2.5 w-full animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        </div>
        {slow ? <p data-skipwait-loading-slow="true" className="mt-4 rounded-xl bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground">This is taking longer than expected. You can keep waiting or come back in a moment — nothing was lost.</p> : null}
      </Panel>
    </div>
  );
}

type AlertPanelProps = { title: string; detail: string; reassurance: string; retryLabel: string; onRetry: () => void; dismissLabel: string; onDismiss: () => void; className?: string };

export function RequestsAlert({ title, detail, reassurance, retryLabel, onRetry, dismissLabel, onDismiss, className = "" }: AlertPanelProps) {
  return (
    <div role="alert" data-skipwait-error="true" className={`rounded-3xl border border-destructive/30 bg-destructive/10 p-5 sm:p-6 ${className}`}>
      <p className="text-sm font-semibold text-destructive">{title}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{detail}</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{reassurance}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button type="button" onClick={onRetry}>{retryLabel}</Button>
        <Button type="button" variant="outline" onClick={onDismiss}>{dismissLabel}</Button>
      </div>
    </div>
  );
}

type EmptyProps = { tab: "active" | "closed"; firstTime: boolean };

export function RequestsEmpty({ tab, firstTime }: EmptyProps) {
  const active = tab === "active";
  const heading = !active ? "Nothing closed yet." : firstTime ? "No asks yet." : "No open asks.";
  return (
    <>
      <Panel tone="muted" className="mt-4 text-center">
        <section aria-label={firstTime ? "No referral requests" : undefined}>
          <Send className="mx-auto mb-3 size-8" aria-hidden="true" />
          <h2 className="text-lg font-semibold">{heading}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Pick a company, find a verified referrer, and write one great ask.</p>
          {active ? (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="outline" asChild><Link href="/onboarding">Finish setup</Link></Button>
              <Button asChild><Link href="/explore">Explore companies</Link></Button>
            </div>
          ) : null}
        </section>
      </Panel>
      {active && firstTime ? <div className="flex justify-center"><ZeroActivityShareCard audience="job_seeker" /></div> : null}
    </>
  );
}
