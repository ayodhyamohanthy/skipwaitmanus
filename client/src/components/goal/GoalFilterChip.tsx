// GoalFilterChip (shell.css:184-193): aria-pressed, never a black fill.
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function GoalFilterChip({ label, pressed, onPressedChange, count }: { label: string; pressed: boolean; onPressedChange?(pressed: boolean): void; count?: number }) {
  return (
    <button
      type="button"
      data-testid="goal-filter-chip"
      aria-pressed={pressed}
      onClick={() => onPressedChange?.(!pressed)}
      className={cn(
        "g-hit inline-flex h-8 items-center gap-1.5 rounded-g-control border border-g-hairline px-3 text-g-label font-medium text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover",
        pressed && "border-g-surface-selected bg-g-surface-selected pl-2.5 font-semibold text-g-ink",
      )}
    >
      {pressed ? <Check aria-hidden="true" className="size-4" strokeWidth={1.75} /> : null}
      {label}
      {count !== undefined ? <span className="g-num text-g-ink-3">{count}</span> : null}
    </button>
  );
}
