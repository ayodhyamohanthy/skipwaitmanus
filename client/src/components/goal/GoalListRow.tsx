// GoalListRow (spec §4.5): one row for company / queue / ask lists. Selected
// is a 2px ink bar inside the left edge — the only stripe in the system
// (BRIEF.md §185). Hover is instant; no filled badges, no row actions.
import type { ReactNode } from "react";
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
  // The company row is the comp's grid (find-a-referral.css `.co-row`): one line
  // on desktop — mark, name, functions, availability — and two lines on phones
  // (name and availability above, functions below). The queue and ask rows keep
  // their stacked shape.
  const body = density === "company" ? (
    <>
      {selected && selectable ? (
        <span aria-hidden="true" className="absolute top-3 bottom-3 left-0 w-0.5 rounded-r-[2px] bg-g-ink" />
      ) : null}
      {leading ? <span className="flex max-gdesk:col-start-1 max-gdesk:row-start-1 max-gdesk:row-span-2">{leading}</span> : null}
      <span className="block truncate text-g-label text-g-ink max-gdesk:col-start-2 max-gdesk:row-start-1 max-gdesk:text-g-row-phone">{title}</span>
      {meta ? <span className="block truncate text-g-meta text-g-ink-3 max-gdesk:col-start-2 max-gdesk:row-start-2 max-gdesk:col-span-2">{meta}</span> : null}
      {(trailing || metaTrailing) ? (
        <span className="flex shrink-0 items-center gap-3 whitespace-nowrap text-g-meta text-g-ink-3 max-gdesk:col-start-3 max-gdesk:row-start-1 max-gdesk:justify-self-end">
          {trailing}
          {metaTrailing}
        </span>
      ) : null}
    </>
  ) : (
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
    density === "company" && "grid h-[52px] grid-cols-[28px_auto_minmax(0,1fr)_auto] items-center gap-x-3 pl-2.5 max-gdesk:h-auto max-gdesk:min-h-16 max-gdesk:grid-cols-[32px_minmax(0,1fr)_auto] max-gdesk:grid-rows-[auto_auto] max-gdesk:gap-y-0 max-gdesk:py-2.5 max-gdesk:pr-3",
    density === "queue" && "min-h-16 py-2.5",
    density === "ask" && "min-h-[72px] py-3",
    interactive && "hover:bg-g-surface-hover",
    selected && selectable && "bg-g-surface-selected",
  );
  return (
    <li data-testid="goal-list-row">
      {href !== undefined ? (
        <a href={href} aria-current={selected && selectable ? "true" : undefined} onClick={onSelect ? event => { event.preventDefault(); onSelect(); } : undefined} className={className}>{body}</a>
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
