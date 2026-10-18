import { Check } from "lucide-react";
import type { ReactNode } from "react";

/** A labelled checkbox: an ink check on white, never a black fill (DESIGN.md rule 1 keeps one black element per screen). */
export function GoalCheckbox({ checked, onCheckedChange, children }: { checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-g-meta text-g-ink">
      <span className="relative mt-0.5 inline-flex size-[18px] shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onCheckedChange(event.target.checked)}
          className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none rounded-g-keycap border-[1.5px] border-g-control-edge bg-g-surface checked:border-g-ink"
        />
        <Check aria-hidden="true" className="pointer-events-none absolute inset-0 m-auto size-3.5 text-g-ink opacity-0 peer-checked:opacity-100" strokeWidth={3} />
      </span>
      <span>{children}</span>
    </label>
  );
}
