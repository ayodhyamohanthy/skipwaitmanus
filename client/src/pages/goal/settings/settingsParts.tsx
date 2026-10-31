// Small goal-token building blocks shared by the goal /settings sections.
// Kit classes stay out of this tree (goalBoundary reverse check), so these
// mirror settingsUi's roles, not its styling.
import { CheckCircle2, CircleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "wouter";

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h3 className="text-g-heading text-g-ink">{title}</h3>
      {children}
    </section>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-4 border-b border-g-hairline py-3 last:border-0">
      <span className="min-w-0"><strong className="block text-g-label text-g-ink">{label}</strong>{hint ? <small className="block text-g-meta text-g-ink-3">{hint}</small> : null}</span>
      {children}
    </div>
  );
}

export function DoneNote({ children }: { children: ReactNode }) {
  return <p role="status" className="mt-3 flex items-center gap-2 text-g-meta text-g-ink"><CheckCircle2 aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />{children}</p>;
}

export function InlineError({ children }: { children: ReactNode }) {
  return <p role="alert" className="mt-3 flex items-start gap-2 text-g-meta text-g-ink"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />{children}</p>;
}

export function InlineLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="underline underline-offset-2 hover:no-underline">{children}</Link>;
}

/** The one switch geometry the goal tree uses (GoalReferrerSetup's notification row).
 * Offline it keeps showing its current value: the reason sits beside "On"/"Off",
 * never in its place, and the track dims instead of painting "off". */
export function Switch({ on, label, onChange, disabledReason }: { on: boolean; label: string; onChange(next: boolean): void; disabledReason?: string }) {
  const inert = disabledReason !== undefined;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={inert ? "true" : undefined}
      aria-label={label}
      onClick={inert ? event => event.preventDefault() : () => onChange(!on)}
      className="flex min-h-12 items-center justify-end gap-3"
    >
      {inert ? <span className="text-g-meta text-g-ink-3">{disabledReason}</span> : null}
      <span className="text-g-meta text-g-ink-3">{on ? "On" : "Off"}</span>
      <span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-100 ${on ? "bg-g-ink" : "bg-g-hairline"}${inert ? " opacity-50" : ""}`}><i className={`absolute top-0.5 block size-4 rounded-full bg-g-surface transition-all duration-100 ${on ? "left-[18px]" : "left-0.5"}`} /></span>
    </button>
  );
}
