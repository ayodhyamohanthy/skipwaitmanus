// GoalDecisionBar (spec §4.7): the pinned Pass | Accept bar. Keyboard opens
// confirm steps and never commits (BRIEF.md §177,729): A focuses the accept,
// P opens the pass picker, J/K move, 1-7 pick inside the open picker.
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { GoalButton } from "./GoalButton";
import { GoalIconButton } from "./GoalIconButton";
import { GoalNum } from "./GoalNum";

export type GoalDecisionBarProps = {
  position?: { index: number; total: number; onPrev(): void; onNext(): void };
  secondary: { label: string; keyHint?: string; onClick(): void; expanded?: boolean; controlsId?: string };
  primary: { label: string; keyHint?: string; onClick(): void; busy?: boolean; busyLabel?: string; disabledReason?: string };
  passPicker?: ReactNode;
  className?: string;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
}

export function GoalDecisionBar({ position, secondary, primary, passPicker, className }: GoalDecisionBarProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "p" || event.key === "P") { event.preventDefault(); secondary.onClick(); }
      if (event.key === "a" || event.key === "A") { event.preventDefault(); primary.onClick(); }
      if (position) {
        if (event.key === "j" || event.key === "J") { event.preventDefault(); position.onNext(); }
        if (event.key === "k" || event.key === "K") { event.preventDefault(); position.onPrev(); }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [position, secondary, primary]);

  return (
    <div data-testid="goal-decision-bar" className={cn("sticky bottom-0 border-t border-g-hairline bg-g-surface", className)}>
      <div className="mx-auto flex h-[72px] items-center justify-between gap-4 px-10 max-gdesk:px-4" style={{ maxWidth: "calc(var(--g-detail-max) + 80px)" }}>
        <div className="max-gdesk:hidden">
          {position ? (
            <span className="flex items-center gap-1">
              <span className="sr-only">{`Ask ${position.index} of ${position.total}`}</span>
              <span aria-hidden="true"><GoalNum className="text-g-ink-2">{`${position.index} / ${position.total}`}</GoalNum></span>
              <GoalIconButton icon={ChevronUp} iconSize={18} aria-label="Previous ask" onClick={position.onPrev} disabledReason={position.index <= 1 ? "First ask" : undefined} />
              <GoalIconButton icon={ChevronDown} iconSize={18} aria-label="Next ask" onClick={position.onNext} disabledReason={position.index >= position.total ? "Last ask" : undefined} />
            </span>
          ) : null}
        </div>
        <div className="relative flex items-center gap-2 max-gdesk:grid max-gdesk:flex-1 max-gdesk:grid-cols-2">
          <GoalButton
            variant="ghost"
            touch="large"
            keys={secondary.keyHint ? [secondary.keyHint] : undefined}
            aria-haspopup="dialog"
            aria-expanded={secondary.expanded ?? undefined}
            aria-controls={secondary.expanded ? secondary.controlsId : undefined}
            onClick={secondary.onClick}
          >
            {secondary.label}
          </GoalButton>
          <span aria-hidden="true" className="max-gdesk:hidden h-6 w-px bg-g-hairline" />
          <GoalButton
            variant="primary"
            touch="large"
            keys={primary.keyHint ? [primary.keyHint] : undefined}
            busy={primary.busy}
            busyLabel={primary.busyLabel}
            disabledReason={primary.disabledReason}
            onClick={primary.onClick}
          >
            {primary.label}
          </GoalButton>
          {passPicker}
        </div>
      </div>
    </div>
  );
}
