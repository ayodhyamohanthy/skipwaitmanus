// GoalStatus (shell.css:195-202, BRIEF.md §126-132): an 8px dot + label in one
// semantic tone. Accepted is neutral ink (an acceptance is not a referral,
// D-038); emerald starts at Referred; crimson only for ended states.
import { CircleCheck, CircleDashed, CircleDot, CircleEllipsis, CircleMinus, CircleX } from "lucide-react";
import { cn } from "@/lib/utils";

export type GoalStatusValue = "waiting" | "under_review" | "accepted" | "referred" | "expired" | "withdrawn" | "queue_new" | "queue_review";

const TONE: Record<GoalStatusValue, { text: string; dot: boolean }> = {
  waiting: { text: "text-g-amber", dot: true },
  under_review: { text: "text-g-amber", dot: true },
  accepted: { text: "text-g-ink", dot: true },
  referred: { text: "text-g-emerald", dot: true },
  expired: { text: "text-g-crimson", dot: true },
  withdrawn: { text: "text-g-ink-3", dot: true },
  queue_new: { text: "text-g-ink", dot: true },
  queue_review: { text: "text-g-ink-3", dot: false },
};

export function GoalStatus({ status, label, stepper, className }: { status: GoalStatusValue; label: string; stepper?: { stage: number; terminal?: "expired" | "withdrawn" }; className?: string }) {
  const tone = TONE[status];
  return (
    <span data-testid="goal-status" className={cn("inline-flex items-center gap-2 text-g-meta whitespace-nowrap", tone.text, className)}>
      {stepper ? <GoalMiniStepper stage={stepper.stage} terminal={stepper.terminal} status={status} /> : null}
      {!stepper && tone.dot ? <span aria-hidden="true" className="size-(--g-dot) shrink-0 rounded-full bg-current" /> : null}
      {label}
    </span>
  );
}

/** Four nodes joined by links; the current stage shares the status tone, reached stages are quiet and the rest hollow. Decorative unless a `label` is given, then it reads as an image with that name. (my-asks.css:38-49) */
export function GoalMiniStepper({ stage, terminal, status, label }: { stage: number; terminal?: "expired" | "withdrawn"; status?: GoalStatusValue; label?: string }) {
  return (
    <span {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })} data-testid="goal-mini-stepper" className={cn("inline-flex items-center", TONE[status ?? terminal ?? (stage === 3 ? "referred" : stage === 2 ? "accepted" : "waiting")].text)}>
      {[0, 1, 2, 3].map(index => {
        const isStatus = index === stage;
        const reached = index < stage;
        return (
          <span key={index} className="inline-flex items-center">
            {index > 0 ? <span className={cn("mx-0.5 h-px w-2", index <= stage ? "bg-g-ink-3" : "bg-g-control-edge opacity-50")} /> : null}
            <span
              className={cn(
                "shrink-0 rounded-full",
                isStatus ? "size-(--g-dot) bg-current" : reached ? "size-1.5 bg-g-ink-2" : "size-1.5 border border-g-control-edge",
              )}
            />
          </span>
        );
      })}
    </span>
  );
}

const STEP_LABELS = ["Sent", "Under review", "Accepted", "Referred"] as const;
const STEP_ICONS = { done: CircleCheck, current: CircleDot, upcoming: CircleDashed, expired: CircleX, withdrawn: CircleMinus } as const;

/** My-asks detail progress (my-asks.css:64-79). The current step names its tone; terminal ends the line. */
export function GoalStepper({ stage, terminal, className }: { stage: number; terminal?: "expired" | "withdrawn"; className?: string }) {
  return (
    <ol aria-label="Progress" data-testid="goal-stepper" className={cn("flex items-center border-y border-g-hairline py-4", className)}>
      {STEP_LABELS.map((label, index) => {
        const done = index < stage;
        const current = index === stage && !terminal;
        const ended = index === stage && terminal;
        const Icon = done ? STEP_ICONS.done : ended ? STEP_ICONS[terminal!] : current ? STEP_ICONS.current : STEP_ICONS.upcoming;
        return (
          <li key={label} className="flex items-center" aria-current={current ? "step" : undefined}>
            {index > 0 ? <span aria-hidden="true" className={cn("mx-3 h-px w-8", done || current ? "bg-g-ink-3" : "bg-g-control-edge opacity-50")} /> : null}
            <span className={cn("flex items-center gap-2 text-g-meta", current ? "font-semibold text-g-ink" : "text-g-ink-3")}>
              <Icon aria-hidden="true" className={cn("size-5", ended && terminal === "expired" ? "text-g-crimson" : ended ? "text-g-ink-3" : current ? "text-g-amber" : done ? "text-g-ink" : "text-g-control-edge")} strokeWidth={1.75} />
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Seeker glyph set (BRIEF.md §131), for phase-3 surfaces.
export const GOAL_STATUS_GLYPHS = { waiting: CircleDashed, under_review: CircleEllipsis, accepted: CircleDot, referred: CircleCheck, expired: CircleX, withdrawn: CircleMinus } as const;
