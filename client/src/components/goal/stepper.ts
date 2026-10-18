/** The seeker's four steps and how an ask's stage maps onto them (design/goal-ui/content.json screenC.stepper.rules).
 * Pure, so the mini stepper in a row and the full stepper in the detail can never disagree. */
export const GOAL_STEPS = ["Sent", "Under review", "Accepted", "Referred"] as const;

export type GoalStepState = "done" | "current" | "upcoming" | "referred" | "expired" | "withdrawn";
export type GoalTerminal = "expired" | "withdrawn";
export type GoalStepNode = { label: string; state: GoalStepState };

/** `stage` is the step the ask has reached (0 Sent … 3 Referred). A Referred ask shows every step done and the
 * Referred node as the only emerald one. An ended ask keeps its reached steps and shows its terminal mark in place
 * of the next step; later steps stay upcoming. */
export function goalSteps(stage: number, terminal?: { kind: GoalTerminal; label: string }): GoalStepNode[] {
  const last = GOAL_STEPS.length - 1;
  const reached = Math.max(0, Math.min(Math.trunc(stage), last));
  return GOAL_STEPS.map((label, index): GoalStepNode => {
    if (terminal) {
      if (index <= reached) return { label, state: "done" };
      if (index === reached + 1) return { label: terminal.label, state: terminal.kind };
      return { label, state: "upcoming" };
    }
    if (reached === last) return { label, state: index === last ? "referred" : "done" };
    return { label, state: index < reached ? "done" : index === reached ? "current" : "upcoming" };
  });
}
