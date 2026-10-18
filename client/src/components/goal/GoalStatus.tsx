import { CircleCheck, CircleDashed, CircleDot, CircleMinus, CircleX, Clock, type LucideIcon } from "lucide-react";
import { gcn } from "./gcn";
import { goalSteps, type GoalStepNode, type GoalStepState, type GoalTerminal } from "./stepper";

/** Status is a dot plus text in one hue, coloured by role only (DESIGN.md rule 5). Screens pass a semantic kind;
 * the role colours live here, never in a screen. */
export type GoalStatusKind = "waiting" | "under_review" | "accepted" | "referred" | "expired" | "withdrawn" | "queue_new" | "queue_review";

export const GOAL_STATUS_TONE: Readonly<Record<GoalStatusKind, string>> = {
  waiting: "text-g-amber",
  under_review: "text-g-amber",
  accepted: "text-g-ink",
  referred: "text-g-emerald",
  expired: "text-g-crimson",
  withdrawn: "text-g-ink-3",
  queue_new: "text-g-ink",
  queue_review: "text-g-ink-3",
};

export function GoalStatus({ status, label, stepper, className }: {
  status: GoalStatusKind;
  label: string;
  /** Renders the mini stepper before the label; its node in the status tone is the status dot. */
  stepper?: { stage: number; terminal?: GoalTerminal };
  className?: string;
}) {
  const showDot = !stepper && status !== "queue_review";
  return (
    <span data-g-status={status} className={gcn("inline-flex items-center gap-2 whitespace-nowrap text-g-meta", GOAL_STATUS_TONE[status], className)}>
      {stepper ? <GoalMiniStepper nodes={goalSteps(stepper.stage, stepper.terminal ? { kind: stepper.terminal, label } : undefined)} /> : null}
      {showDot ? <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-current" /> : null}
      <span>{label}</span>
    </span>
  );
}

const MINI_NODE: Readonly<Record<GoalStepState, string>> = {
  done: "size-1.5 bg-g-ink-2",
  current: "size-(--g-dot) bg-current",
  upcoming: "size-1.5 border border-g-control-edge",
  referred: "size-(--g-dot) bg-g-emerald",
  expired: "size-(--g-dot) bg-g-crimson",
  withdrawn: "size-(--g-dot) bg-g-ink-3",
};

export function GoalMiniStepper({ nodes }: { nodes: readonly GoalStepNode[] }) {
  return (
    <span aria-hidden="true" data-g-mini-stepper="" className="inline-flex items-center">
      {nodes.map((node, index) => (
        <span key={index} className="inline-flex items-center">
          {index > 0 ? <span className={gcn("h-px w-2 shrink-0", node.state === "upcoming" ? "bg-g-control-edge/50" : "bg-g-ink-3")} /> : null}
          <span data-g-node={node.state} className={gcn("shrink-0 rounded-full", MINI_NODE[node.state])} />
        </span>
      ))}
    </span>
  );
}

const STEP_ICON: Readonly<Record<GoalStepState, LucideIcon>> = {
  done: CircleCheck,
  current: CircleDot,
  upcoming: CircleDashed,
  referred: CircleCheck,
  expired: CircleX,
  withdrawn: CircleMinus,
};
const STEP_TEXT: Readonly<Record<GoalStepState, string>> = {
  done: "text-g-ink-2",
  current: "font-semibold text-g-ink",
  upcoming: "text-g-ink-3",
  referred: "text-g-emerald",
  expired: "text-g-crimson",
  withdrawn: "text-g-ink-3",
};
const STEP_NODE: Readonly<Record<Exclude<GoalStepState, "current">, string>> = {
  done: "text-g-ink",
  upcoming: "text-g-control-edge",
  referred: "text-g-emerald",
  expired: "text-g-crimson",
  withdrawn: "text-g-ink-3",
};
const STEP_SR: Readonly<Record<GoalStepState, string>> = {
  done: "done",
  current: "current step",
  upcoming: "not reached",
  referred: "done",
  expired: "ended",
  withdrawn: "ended",
};

/** The full stepper on an opened ask: Sent → Under review → Accepted → Referred. */
export function GoalStepper({ stage, status, label, terminal }: { stage: number; status: GoalStatusKind; label: string; terminal?: GoalTerminal }) {
  const nodes = goalSteps(stage, terminal ? { kind: terminal, label } : undefined);
  return (
    <ol aria-label="Progress" className="flex items-center border-y border-g-hairline py-4">
      {nodes.map((node, index) => {
        const Icon = STEP_ICON[node.state];
        const last = index === nodes.length - 1;
        const reached = node.state === "done" || node.state === "referred";
        return (
          <li
            key={index}
            aria-current={node.state === "current" ? "step" : undefined}
            className={gcn("flex min-w-0 items-center gap-2 whitespace-nowrap text-g-meta", last ? "flex-none" : "flex-1", STEP_TEXT[node.state])}
          >
            <Icon aria-hidden="true" className={gcn("size-5 shrink-0", node.state === "current" ? GOAL_STATUS_TONE[status] : STEP_NODE[node.state])} strokeWidth={1.75} />
            <span>
              {node.label}
              <span className="sr-only">, {STEP_SR[node.state]}</span>
            </span>
            {!last ? <span aria-hidden="true" className={gcn("mx-3 h-px min-w-3 flex-1", reached ? "bg-g-ink-3" : "bg-g-control-edge/50")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/** Company availability (DESIGN.md Colors): open is a solid ink dot with ink text; not open is a ring with ink-3 text.
 * Never green, never blue. */
export function GoalAvailability({ open, label }: { open: boolean; label: string }) {
  return (
    <span className={gcn("inline-flex items-center gap-2 whitespace-nowrap text-g-meta", open ? "text-g-ink" : "text-g-ink-3")}>
      <span aria-hidden="true" className={gcn("size-(--g-dot) shrink-0 rounded-full", open ? "bg-g-ink" : "border-[1.5px] border-g-control-edge")} />
      <span>{label}</span>
    </span>
  );
}

/** A day-level clock ("2 days left", DESIGN.md rule 14). Amber at 2 days or fewer; never crimson (it sits in the referrer queue). */
export function GoalClock({ daysLeft, children, withIcon = false, className }: { daysLeft: number; children: string; withIcon?: boolean; className?: string }) {
  const tone = daysLeft <= 2 ? "text-g-amber" : "text-g-ink-3";
  if (!withIcon) return <span className={gcn("g-num", tone, className)}>{children}</span>;
  return (
    <span className={gcn("inline-flex items-center gap-1.5", tone, className)}>
      <Clock aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
      <span className="g-num">{children}</span>
    </span>
  );
}
