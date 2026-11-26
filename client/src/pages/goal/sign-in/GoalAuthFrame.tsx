// The frame the four goal sign-in routes share (D-048-p3-signin): a quiet
// header with the brand and one way back, then a single column that opens with
// the page's goal line as its only h1. Each state below it keeps that h1 and
// puts its own title in an h2 (packet section 4 rule 14). No data, no fetch.
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { GoalBrandMark } from "@/components/goal/GoalBrandMark";

export const NETWORK_MESSAGE = "We could not reach SkipWait. Check your connection and try again.";

/** Plain-words reason for a failed request: the server's own words when it sent any, else the fallback. */
export function serverWords(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === "string" && error.trim()) return error;
  }
  return fallback;
}

export function GoalAuthFrame({ screen, page, goalLine, lead, back = { href: "/", label: "Back to home" }, skip, children }: {
  screen: string;
  page: string;
  goalLine: string;
  lead?: ReactNode;
  back?: { href: string; label: string } | null;
  /** A skip control, first in the tab order and visible only while focused (WCAG 2.4.1 bypass). */
  skip?: { label: string; onActivate: () => void };
  children: ReactNode;
}) {
  return (
    <div data-skipwait-screen={screen} data-goal-page={page} className="g-scope relative min-h-dvh bg-g-canvas font-g-sans text-g-ink">
      {skip ? (
        <button type="button" onClick={skip.onActivate} className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-10 focus:rounded-g-control focus:border focus:border-g-ink focus:bg-g-surface focus:px-3 focus:py-2 focus:text-g-label focus:text-g-ink">
          {skip.label}
        </button>
      ) : null}
      <header className="border-b border-g-hairline">
        <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between gap-4 px-4 gdesk:px-8">
          <Link href="/" aria-label="skipwait.me home" className="inline-flex min-h-11 items-center"><GoalBrandMark /></Link>
          {back ? (
            <Link href={back.href} className="inline-flex min-h-11 items-center gap-1.5 text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink">
              <ArrowLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />{back.label}
            </Link>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-[480px] px-4 pb-16 pt-8 gdesk:pt-14">
        <h1 className="text-balance text-g-display text-g-ink">{goalLine}</h1>
        {lead ? <div className="mt-3 text-g-body text-g-ink-2">{lead}</div> : null}
        {children}
      </main>
    </div>
  );
}
