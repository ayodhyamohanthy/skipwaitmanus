import type { LucideIcon } from "lucide-react";
import { gcn } from "./gcn";

/** A keycap is a letter or one of lucide `command`, `corner-down-left`, `arrow-up`, `arrow-down` (never a Unicode glyph). */
export type GoalKey = string | LucideIcon;

export function GoalKeycap({ value, onPrimary = false }: { value: GoalKey; onPrimary?: boolean }) {
  return (
    <kbd
      className={gcn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-g-keycap border px-[5px] font-g-sans text-g-badge tracking-normal",
        onPrimary ? "border-g-on-primary-edge bg-transparent text-g-on-primary" : "border-g-control-edge bg-g-surface text-g-ink-2",
      )}
    >
      {typeof value === "string" ? value : <KeyIcon icon={value} />}
    </kbd>
  );
}

function KeyIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden="true" className="size-3" strokeWidth={1.75} />;
}

/** Keycap hints: desktop only, hidden from assistive tech. Keycaps are hints, never the only label. */
export function GoalKeycaps({ keys, onPrimary = false }: { keys: readonly GoalKey[]; onPrimary?: boolean }) {
  if (keys.length === 0) return null;
  return (
    <span aria-hidden="true" data-g-keycaps="" className="ml-0.5 inline-flex gap-1 max-gdesk:hidden">
      {keys.map((key, index) => (
        <GoalKeycap key={index} value={key} onPrimary={onPrimary} />
      ))}
    </span>
  );
}
