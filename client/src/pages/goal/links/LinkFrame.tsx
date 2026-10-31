// Shared frame and states for the goal link landings (D-048-p3-links; packet
// docs/plans/D-048-public.md). The three link routes are signed-out intent
// landings, not wrapped in AppShell: one centred tile, the brand mark home,
// the goal line, then one "Your next step" block with the single black commit.
// Load errors are ink (R3), never crimson; copy arrives as props.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { GoalButton } from "@/components/goal";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";
import { GoalNextStep } from "@/components/goal/GoalNextStep";

export function LinkFrame({ screen, children }: { screen: string; children: ReactNode }) {
  return (
    <main data-skipwait-screen={screen} className="grid min-h-dvh place-items-center bg-g-canvas px-5 py-6 font-g-sans text-g-ink">
      <section className="w-full min-w-0 max-w-[560px] [overflow-wrap:anywhere] rounded-g-tile border border-g-hairline bg-g-surface p-6 gdesk:p-8">
        <Link href="/" aria-label="SkipWait.me home" className="inline-flex">
          <GoalBrandMark />
        </Link>
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}

export function LinkEyebrow({ children }: { children: ReactNode }) {
  return <p className="font-g-mono text-[11px] uppercase tracking-[0.14em] text-g-ink-3">{children}</p>;
}

export function LinkLoading({ screen, label }: { screen: string; label: string }) {
  return (
    <LinkFrame screen={screen}>
      <div role="status" aria-busy="true" aria-live="polite" className="grid gap-3">
        <span className="sr-only">{label}</span>
        <div aria-hidden="true" className="h-4 w-32 rounded bg-g-surface-hover" />
        <div aria-hidden="true" className="h-9 w-4/5 rounded bg-g-surface-hover" />
        <div aria-hidden="true" className="h-16 rounded bg-g-surface-hover" />
        <div aria-hidden="true" className="mt-3 h-28 rounded bg-g-surface-hover" />
      </div>
    </LinkFrame>
  );
}

/** Honest unavailable state: what happened, that nothing changed, a retry and one way forward. */
export function LinkUnavailable({ screen, eyebrow, title, message, detail, onRetry }: {
  screen: string;
  eyebrow: string;
  title: string;
  message: string;
  detail: string;
  onRetry(): void;
}) {
  return (
    <LinkFrame screen={screen}>
      <LinkEyebrow>{eyebrow}</LinkEyebrow>
      <h1 className="mt-3 text-g-display">{title}</h1>
      <div role="alert" className="mt-3">
        <p className="text-g-label text-g-ink">{message}</p>
        <p className="mt-1 text-g-meta text-g-ink-2">{detail}</p>
      </div>
      <GoalButton className="mt-3" flush size="sm" variant="ghost" onClick={onRetry}>Try again</GoalButton>
      <div className="mt-5">
        <GoalNextStep reason="You can still start from the job link you want a referral for.">
          <div className="mt-3">
            <GoalButton variant="primary" asChild className="w-full">
              <Link href="/start">Start a referral request</Link>
            </GoalButton>
          </div>
        </GoalNextStep>
      </div>
    </LinkFrame>
  );
}

/** Plain-words reason for a failed load; the link code never leaves this page (no telemetry). */
export function loadFailureMessage(reason: unknown, fallback: string): string {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You’re offline. Reconnect, then try again.";
  if (reason instanceof TypeError) return "We couldn’t reach SkipWait.me. Check your connection, then try again.";
  return reason instanceof Error && reason.message ? reason.message : fallback;
}
