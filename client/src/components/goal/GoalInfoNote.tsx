// GoalInfoNote: an explicit info affordance that opens a small note on hover,
// keyboard focus and tap. Toggletip pattern: hover/focus open the note
// transiently, a click pins it open (a second click unpins), the note stays
// open while focus is anywhere inside, Escape closes.
import { Info } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function GoalInfoNote({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = pinned || hovered || focused;
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={root}
      className={cn("relative inline-flex items-center", className)}
      onPointerEnter={event => { if (event.pointerType === "mouse") setHovered(true); }}
      onPointerLeave={event => { if (event.pointerType === "mouse") setHovered(false); }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={event => { if (!root.current?.contains(event.relatedTarget as Node | null)) setFocused(false); }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned(current => !current)}
        onKeyDown={event => {
          if (event.key === "Escape") {
            setPinned(false);
            setHovered(false);
            setFocused(false);
            event.currentTarget.blur();
            event.stopPropagation();
          }
        }}
        className="g-hit inline-flex items-center justify-center rounded-g-control text-g-ink-3 transition-colors duration-(--g-dur-hover) ease-g-out hover:text-g-ink focus-visible:text-g-ink"
      >
        <Info aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
      </button>
      {open ? (
        <span
          role="note"
          id={id}
          className="absolute top-full right-0 z-30 mt-2 w-56 rounded-g-control border border-g-hairline bg-g-surface p-3 text-left text-g-meta text-g-ink-2 shadow-g-popover"
        >
          {children}
        </span>
      ) : null}
    </span>
  );
}
