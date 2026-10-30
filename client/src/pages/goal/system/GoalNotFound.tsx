import { Link } from "wouter";
import { GoalButton, GoalNextStep } from "@/components/goal";

export const GOAL_PAGE = { goalLine: "This page isn't here." } as const;

export default function GoalNotFound() {
  return (
    <main data-skipwait-screen="not-found" data-goal-page="not-found" className="g-scope mx-auto flex min-h-dvh w-full max-w-[720px] flex-col items-center justify-center bg-g-canvas px-5 py-10 text-center font-g-sans text-g-ink">
      <p className="text-g-meta text-g-ink-3">404</p>
      <h1 className="mt-4 text-balance text-g-display text-g-ink">{GOAL_PAGE.goalLine}</h1>
      <p className="mt-3 max-w-md text-g-body text-g-ink-2">The page may have moved, or the link was mistyped.</p>
      <div className="mt-8 w-full max-w-sm">
        <GoalNextStep reason="Pick the door that gets you back on track.">
          <div className="mt-3 grid gap-2">
            <GoalButton variant="primary" asChild><Link href="/">Go home</Link></GoalButton>
            <GoalButton variant="ghost" asChild><Link href="/explore">Explore companies</Link></GoalButton>
          </div>
        </GoalNextStep>
      </div>
    </main>
  );
}
