import { RefreshCw, WifiOff } from "lucide-react";
import { readReferralDraft } from "@/lib/pwaContinuity";
import { GoalButton, GoalNextStep } from "@/components/goal";

export const GOAL_PAGE = { goalLine: "You're offline." } as const;

export default function GoalOffline() {
  const draft = typeof window !== "undefined" ? readReferralDraft() : null;
  const hasDraft = Boolean(draft?.targetUrl);
  return (
    <main data-skipwait-screen="offline" data-goal-page="offline" className="g-scope flex min-h-dvh flex-col bg-g-canvas font-g-sans text-g-ink">
      <div role="status" aria-live="polite" className="flex items-center gap-3 bg-g-surface px-5 py-3 text-g-meta text-g-ink-2">
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        You're offline. Showing saved info.
      </div>
      <section className="m-auto w-full max-w-sm px-5 py-10 text-center">
        <span className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-g-surface">
          <WifiOff aria-hidden="true" className="size-7 text-g-ink-3" />
        </span>
        <h1 className="text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
        <p className="mt-2 text-g-body text-g-ink-2">Your drafts are saved on this device. Send them when you're back online.</p>
        {hasDraft ? <p role="status" className="mt-4 break-words rounded-g-tile border border-g-hairline bg-g-surface px-4 py-3 text-g-meta font-semibold text-g-ink">{draft?.targetUrl}</p> : null}
        <div className="mt-6">
          <GoalNextStep reason="Reconnect, then retry.">
            <GoalButton variant="primary" className="w-full" onClick={() => { const from = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("from") : null; if (from && from.startsWith("/") && !from.startsWith("//")) window.location.assign(from); else window.location.reload(); }}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Try again
            </GoalButton>
          </GoalNextStep>
        </div>
      </section>
    </main>
  );
}
