import { Check, ChevronLeft, ExternalLink, FileText, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { gcn } from "./gcn";
import { GoalNum } from "./GoalNum";

/** An opened item: a scrolling body capped at 680px plus 80px of padding, and a dock (the locked panel, the accept
 * note and the decision bar) pushed to the bottom. */
export function GoalDetailPane({ labelledBy, subheader, children, dock, className }: {
  labelledBy: string;
  subheader?: ReactNode;
  children: ReactNode;
  dock?: ReactNode;
  className?: string;
}) {
  return (
    <article aria-labelledby={labelledBy} className={gcn("flex min-h-full min-w-0 flex-col", className)}>
      {subheader}
      <div className="w-full max-w-[calc(var(--g-detail-max)+80px)] px-10 pt-9 max-gdesk:px-4 max-gdesk:pt-5">{children}</div>
      {dock ? <div className="mt-auto pt-8 max-gdesk:pt-7">{dock}</div> : null}
    </article>
  );
}

/** Eyebrow, title (display on the queue, heading on My asks) and a wrapping meta row. */
export function GoalDetailHeader({ id, eyebrow, refId, title, size = "display", meta }: {
  id: string;
  eyebrow?: ReactNode;
  refId?: string;
  title: ReactNode;
  size?: "display" | "heading";
  meta?: ReactNode;
}) {
  return (
    <header>
      {refId && size === "heading" ? <p className="g-num text-g-ink-3">{refId}</p> : null}
      {eyebrow ? <p className="text-g-meta text-g-ink-2">{eyebrow}</p> : null}
      <h1 id={id} className={gcn("mt-1 text-balance text-g-ink", size === "display" ? "text-g-display" : "text-g-heading")}>{title}</h1>
      {meta ? <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-g-meta text-g-ink-3">{meta}</div> : null}
    </header>
  );
}

export function GoalSection({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section className={gcn("mt-8", className)}>
      <h2 className="text-g-label text-g-ink">{label}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** The seeker's numbered reasons ("01"–"03"), as the referrer reads them. */
export function GoalReasonList({ items }: { items: readonly string[] }) {
  return (
    <ol className="grid gap-3.5">
      {items.map((item, index) => (
        <li key={index} className="grid grid-cols-[32px_minmax(0,1fr)]">
          <span aria-hidden="true" className="g-num leading-6 text-g-ink-3">{String(index + 1).padStart(2, "0")}</span>
          <p className="text-pretty text-g-body text-g-ink">{item}</p>
        </li>
      ))}
    </ol>
  );
}

/** Checks on the ask (ink check icons, no pills, never a score of the person). */
export function GoalCheckList({ items, note }: { items: readonly string[]; note?: string }) {
  return (
    <>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map(item => (
          <li key={item} className="inline-flex items-center gap-1.5 text-g-meta text-g-ink-2">
            <Check aria-hidden="true" className="size-4 shrink-0 text-g-ink" strokeWidth={2} />
            {item}
          </li>
        ))}
      </ul>
      {note ? <p className="mt-2.5 text-g-meta text-g-ink-3">{note}</p> : null}
    </>
  );
}

/** Term and value rows under a hairline (single column on phones). */
export function GoalProps({ rows }: { rows: ReadonlyArray<{ term: string; value: ReactNode }> }) {
  return (
    <dl className="mt-6 grid gap-2.5 border-t border-g-hairline pt-5">
      {rows.map(row => (
        <div key={row.term} className="grid grid-cols-[120px_minmax(0,1fr)] items-baseline gap-x-4 max-gdesk:grid-cols-1 max-gdesk:gap-y-0.5">
          <dt className="text-g-meta text-g-ink-3">{row.term}</dt>
          <dd className="min-w-0 text-g-body text-g-ink">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** An external link in ink with an underline (the job posting). Opens in a new tab without a referrer. */
export function GoalExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex max-w-full items-center gap-1.5 underline decoration-g-control-edge underline-offset-[3px] hover:decoration-g-ink max-gdesk:block max-gdesk:[overflow-wrap:anywhere]"
    >
      <span className="min-w-0 truncate max-gdesk:whitespace-normal">{children}</span>
      <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-g-ink-2 max-gdesk:ml-1 max-gdesk:inline-block max-gdesk:align-[-2px]" strokeWidth={1.75} />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Before acceptance: a lock and a document COUNT only. Never file names, links, a photo, a name or a plan. */
export function GoalLockedPanel({ title, documents }: { title: string; documents?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-g-tile border border-g-hairline bg-g-surface-sunken px-4 py-3.5 max-gdesk:flex-wrap max-gdesk:items-start max-gdesk:gap-y-1.5">
      <Lock aria-hidden="true" className="size-5 shrink-0 text-g-ink-2" strokeWidth={1.75} />
      <p className="min-w-0 flex-1 text-balance text-g-label text-g-ink max-gdesk:basis-[calc(100%-32px)]">{title}</p>
      {documents ? (
        <p className="inline-flex items-center gap-1.5 whitespace-nowrap text-g-meta text-g-ink-3 max-gdesk:ml-8">
          <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />
          <GoalNum>{documents}</GoalNum>
        </p>
      ) : null}
    </div>
  );
}

/** Phone sub-header on an opened item: a 44px back link and, optionally, the position control. */
export function GoalPhoneSubheader({ backHref, backLabel, onBack, children }: { backHref?: string; backLabel: string; onBack?: () => void; children?: ReactNode }) {
  const className = "inline-flex h-11 items-center gap-1 pl-1 pr-2 text-g-label text-g-ink";
  const content = (
    <>
      <ChevronLeft aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      {backLabel}
    </>
  );
  return (
    <div className="flex h-(--g-subheader-h-phone) items-center justify-between border-b border-g-hairline bg-g-surface pl-2 pr-1 gdesk:hidden">
      {backHref ? <Link href={backHref} className={className} onClick={onBack}>{content}</Link> : <button type="button" className={className} onClick={onBack}>{content}</button>}
      {children}
    </div>
  );
}
