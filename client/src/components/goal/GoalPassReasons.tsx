// GoalPassReasons (spec §4.7): the 7 shipped reasons from
// shared/passReasons.ts, none preselected, Pass stays aria-disabled until a
// pick. Keys 1-7 check a reason and never confirm (BRIEF.md §177).
import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useState } from "react";
import { PASS_REASON_OPTIONS, type PassReasonCode } from "@shared/passReasons";
import { cn } from "@/lib/utils";
import { GoalButton } from "./GoalButton";
import { GoalKeycap } from "./GoalKeycap";

export type GoalPassReasonsProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description: string;
  note?: string;
  cancelLabel: string;
  confirmLabel: string;
  onConfirm(reason: PassReasonCode): void;
  onCancel(): void;
};

export function GoalPassReasons({ open, onOpenChange, title, description, note, cancelLabel, confirmLabel, onConfirm, onCancel }: GoalPassReasonsProps) {
  const titleId = useId();
  const [picked, setPicked] = useState<PassReasonCode | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > PASS_REASON_OPTIONS.length) return;
      const option = PASS_REASON_OPTIONS[digit - 1];
      if (option) { event.preventDefault(); setPicked(option.code); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor data-testid="goal-pass-anchor" className="pointer-events-none absolute right-0 bottom-0" />
      <Popover.Portal>
      <Popover.Content
        side="top"
        align="end"
        sideOffset={8}
        data-testid="goal-pass-reasons"
        className="g-scope animate-g-fade-in w-[368px] rounded-[12px] bg-g-surface p-4 pt-3 shadow-g-popover motion-reduce:animate-none"
      >
        <p id={titleId} className="px-2 text-g-heading text-g-ink">{title}</p>
        <p className="px-2 text-g-meta text-g-ink-2">{description}</p>
        <div role="radiogroup" aria-labelledby={titleId} className="mt-2">
          {PASS_REASON_OPTIONS.map((option, index) => (
            <button
              key={option.code}
              type="button"
              role="radio"
              aria-checked={picked === option.code}
              onClick={() => setPicked(option.code)}
              className="flex h-10 w-full items-center gap-3 rounded-g-control px-2 text-left text-g-body text-g-ink transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover"
            >
              <span aria-hidden="true" className={cn("size-[18px] shrink-0 rounded-full border-[1.5px] border-g-control-edge", picked === option.code && "border-[5px] border-g-ink")} />
              {option.label}
              <span className="ml-auto max-gdesk:hidden"><GoalKeycap>{index + 1}</GoalKeycap></span>
            </button>
          ))}
        </div>
        {note ? <p className="mt-1 px-2 text-g-meta text-g-ink-3">{note}</p> : null}
        <div className="mt-3 flex items-center justify-end gap-2 border-t border-g-hairline pt-3">
          <GoalButton size="sm" variant="ghost" onClick={onCancel}>{cancelLabel}</GoalButton>
          <GoalButton size="sm" variant="outline" disabledReason={picked === null ? "Pick a reason first" : undefined} onClick={() => { if (picked) onConfirm(picked); }}>
            {confirmLabel}
          </GoalButton>
        </div>
      </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
