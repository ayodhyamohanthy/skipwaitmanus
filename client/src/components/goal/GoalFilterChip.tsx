import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { gcn } from "./gcn";

/** A filter chip: aria-pressed, a tint when selected, never a black fill (DESIGN.md rule 1). */
export function GoalFilterChip({ pressed, onPressedChange, children }: { pressed: boolean; onPressedChange: (next: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={gcn(
        "g-hit inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-g-control border border-g-hairline px-3 text-g-label font-medium text-g-ink-2",
        "transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover",
        pressed && "border-g-surface-selected bg-g-surface-selected pl-2.5 font-semibold text-g-ink",
      )}
    >
      {pressed ? <Check aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} /> : null}
      {children}
    </button>
  );
}

export function GoalChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2 max-gdesk:gap-y-3">
      {children}
    </div>
  );
}
