// GoalListRow (spec §4.5): one row for company / queue / ask lists. Selected
// is a 2px ink bar inside the left edge — the only stripe in the system
// (BRIEF.md §185). Hover is instant; no filled badges, no row actions.
import type { ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { GoalNum } from "./GoalNum";

export type GoalListRowProps = {
  href?: string;
  onSelect?(): void;
  selected?: boolean;
  selectable?: boolean;
  density: "company" | "queue" | "ask";
  leading?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  metaTrailing?: ReactNode;
  footer?: ReactNode;
};

export function GoalListRow({ href, onSelect, selected = false, selectable = true, density, leading, title, trailing, meta, metaTrailing, footer }: GoalListRowProps) {
  const interactive = selectable && (href !== undefined || onSelect !== undefined);
  const body = (
    <>
      {selected && selectable ? (
        <span aria-hidden="true" className="absolute top-3 bottom-3 left-0 w-0.5 rounded-r-[2px] bg-g-ink" />
      ) : null}
      {leading}
      <span className="min-w-0">
        <span className="block truncate text-g-label text-g-ink">{title}</span>
        {meta ? <span className="block truncate text-g-meta text-g-ink-3">{meta}</span> : null}
        {footer ? <span className="mt-1 block text-g-meta text-g-ink-3">{footer}</span> : null}
      </span>
      {(trailing || metaTrailing) ? (
        <span className="ml-auto flex items-center gap-3 text-g-meta text-g-ink-3">
          {trailing}
          {metaTrailing}
        </span>
      ) : null}
    </>
  );
  const className = cn(
    "relative flex w-full items-center gap-3 rounded-g-tile px-3 text-left",
    density === "company" && "h-[52px]",
    density === "queue" && "min-h-16 py-2.5",
    density === "ask" && "min-h-[72px] py-3",
    interactive && "hover:bg-g-surface-hover",
    selected && selectable && "bg-g-surface-selected",
  );
  return (
    <li data-testid="goal-list-row">
      {href !== undefined ? (
        <Link href={href} aria-current={selected && selectable ? "true" : undefined} onClick={onSelect ? event => { event.preventDefault(); onSelect(); } : undefined} className={className}>{body}</Link>
      ) : (
        <button type="button" aria-current={selected && selectable ? "true" : undefined} onClick={onSelect} className={className}>{body}</button>
      )}
    </li>
  );
}

/** Company mark: initials only, never a logo (BRIEF.md §750). */
export function GoalCompanyMark({ initials }: { initials: string }) {
  return (
    <span aria-hidden="true" className="inline-flex size-7 shrink-0 items-center justify-center rounded-g-control bg-g-surface-selected text-[12px]/4 font-semibold tracking-[0.02em] text-g-ink-2 max-gdesk:size-8">
      {initials}
    </span>
  );
}

/** Availability dot (company rows): open = solid ink, not open = ringed. Never green or blue. */
export function GoalAvailability({ open, label }: { open: boolean; label: string }) {
  return (
    <span data-testid="goal-availability" className={cn("inline-flex items-center gap-1.5 text-g-meta", open ? "text-g-ink" : "text-g-ink-3")}>
      <span aria-hidden="true" className={cn("size-(--g-dot) rounded-full", open ? "bg-g-ink" : "border-[1.5px] border-g-control-edge")} />
      {label}
    </span>
  );
}

export function GoalListSection({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const headingId = `goal-section-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={headingId} data-testid="goal-list-section">
      <h2 id={headingId} className="px-3 pt-5 pb-1.5 text-g-meta text-g-ink-3">
        {label} · <GoalNum>{count}</GoalNum>
      </h2>
      <ul className="grid gap-0.5">{children}</ul>
    </section>
  );
}
