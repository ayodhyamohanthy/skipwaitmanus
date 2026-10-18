import type { ReactNode } from "react";
import { Link } from "wouter";
import { gcn } from "./gcn";
import { GoalNum } from "./GoalNum";

export type GoalRowDensity = "company" | "queue" | "ask";

export type GoalListRowProps = {
  density: GoalRowDensity;
  href?: string;
  onSelect?: () => void;
  selected?: boolean;
  /** false on phone lists with no detail pane: no selected styling. */
  selectable?: boolean;
  leading?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
  meta?: ReactNode;
  metaTrailing?: ReactNode;
  footer?: ReactNode;
  "aria-label"?: string;
  testId?: string;
};

const GRID: Readonly<Record<GoalRowDensity, string>> = {
  company:
    "h-[52px] grid-cols-[28px_auto_minmax(0,1fr)_auto] gap-x-3 pl-2.5 pr-3 [grid-template-areas:'lead_title_meta_trail'] " +
    "max-gdesk:h-auto max-gdesk:min-h-16 max-gdesk:grid-cols-[32px_minmax(0,1fr)_auto] max-gdesk:py-2.5 max-gdesk:[grid-template-areas:'lead_title_trail'_'lead_meta_meta']",
  queue: "min-h-16 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-3 py-2.5 [grid-template-areas:'title_title'_'meta_trail'] max-gdesk:min-h-[72px] max-gdesk:p-3",
  ask: "grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 p-3 [grid-template-areas:'title_trail'_'meta_metatrail'_'foot_foot']",
};
const TITLE: Readonly<Record<GoalRowDensity, string>> = {
  company: "truncate text-g-label text-g-ink max-gdesk:text-g-row-phone",
  queue: "text-g-label text-g-ink max-gdesk:text-g-row-phone",
  ask: "text-g-label text-g-ink max-gdesk:text-g-row-phone",
};
const META: Readonly<Record<GoalRowDensity, string>> = {
  company: "truncate text-g-meta text-g-ink-3",
  queue: "min-w-0 truncate text-g-meta text-g-ink-3",
  ask: "min-w-0 text-g-meta text-g-ink-2",
};

/** A selectable list row: the surface-selected tile and the only stripe, a 2px ink bar inside the left edge.
 * Selection is instant (no transition) and rows never carry hover actions, filled badges or coloured backgrounds. */
export function GoalListRow({ density, href, onSelect, selected = false, selectable = true, leading, title, trailing, meta, metaTrailing, footer, testId, ...aria }: GoalListRowProps) {
  const isSelected = selectable && selected;
  const className = gcn(
    "relative grid w-full items-center rounded-g-tile text-left hover:bg-g-surface-hover",
    GRID[density],
    isSelected && "bg-g-surface-selected hover:bg-g-surface-selected before:absolute before:bottom-3 before:left-0 before:top-3 before:w-0.5 before:rounded-r-[2px] before:bg-g-ink before:content-['']",
  );
  const content = (
    <>
      {leading ? <span className="[grid-area:lead] max-gdesk:self-start">{leading}</span> : null}
      <span className={gcn("[grid-area:title] min-w-0", TITLE[density])}>{title}</span>
      {meta ? <span className={gcn("[grid-area:meta]", META[density])}>{meta}</span> : null}
      {trailing ? <span className="[grid-area:trail] justify-self-end">{trailing}</span> : null}
      {metaTrailing ? <span className="[grid-area:metatrail] justify-self-end whitespace-nowrap text-g-meta text-g-ink-3">{metaTrailing}</span> : null}
      {footer ? <span className="[grid-area:foot] mt-1 text-g-meta text-g-ink-3">{footer}</span> : null}
    </>
  );
  const shared = { className, "aria-current": isSelected ? (true as const) : undefined, "data-testid": testId, "data-g-row": density, ...aria };
  return (
    <li className="list-none">
      {href ? (
        <Link href={href} {...shared} onClick={onSelect}>
          {content}
        </Link>
      ) : (
        <button type="button" {...shared} onClick={onSelect}>
          {content}
        </button>
      )}
    </li>
  );
}

const NOT_LETTER_OR_DIGIT = new RegExp("[^\\p{L}\\p{N}\\s]", "gu");

/** Company initials (no logos, DESIGN.md rule 7). */
export function goalInitials(name: string): string {
  const words = name.replace(NOT_LETTER_OR_DIGIT, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return (words.length === 1 ? words[0].slice(0, 1) : `${words[0][0]}${words[1][0]}`).toUpperCase();
}

export function GoalCompanyMark({ name, selected = false }: { name: string; selected?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={gcn(
        "grid size-7 place-items-center rounded-g-control text-[12px] font-semibold leading-4 tracking-[0.02em] text-g-ink-2 max-gdesk:size-8",
        selected ? "bg-g-surface" : "bg-g-surface-selected",
      )}
    >
      {goalInitials(name)}
    </span>
  );
}

/** A labelled group of rows: "Active · 4". */
export function GoalListSection({ id, label, count, children }: { id: string; label: string; count?: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="px-3 pb-1.5 pt-5 text-g-meta text-g-ink-3">
        {label}
        {typeof count === "number" ? (
          <>
            <span aria-hidden="true" className="px-1.5">·</span>
            <GoalNum>{count}</GoalNum>
          </>
        ) : null}
      </h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}
