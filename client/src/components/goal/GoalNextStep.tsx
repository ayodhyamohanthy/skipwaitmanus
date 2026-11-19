// The "Your next step" block (D-167, D-150): every goal page carries exactly
// one, and it holds the page's single black commit (a GoalButton variant
// "primary", which renders data-g-primary). Promoted from the block in
// client/src/pages/MyRequests.tsx - that page is not edited here; the local
// copies migrate when their surfaces adopt GOAL_PAGE.
import type { ReactNode } from "react";

export const GOAL_NEXT_STEP_HEADING_ID = "goal-next-step-heading";
export const GOAL_NEXT_STEP_LABEL = "Your next step";

export function GoalNextStep({ reason, children }: { reason?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={GOAL_NEXT_STEP_HEADING_ID} className="border border-g-hairline p-4 gdesk:p-5">
      <h2 id={GOAL_NEXT_STEP_HEADING_ID} className="text-g-heading text-g-ink">{GOAL_NEXT_STEP_LABEL}</h2>
      {reason ? <p className="mt-2 text-g-meta text-g-ink-2">{reason}</p> : null}
      {children}
    </section>
  );
}
