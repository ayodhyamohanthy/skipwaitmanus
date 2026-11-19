// Ops display primitives (D-048-p3-admin-ops): the goal-UI tiles the read-only
// admin ops surfaces share - a panel, a labelled count, a hairline table - and
// the kit panels' own number formatters, carried over unchanged so a figure
// reads exactly as it did (D-048-admin.md §4.1: presentation only).
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { GoalNum } from "@/components/goal/GoalNum";
import { cn } from "@/lib/utils";

/** Indian-grouped counts, as the D-018 panel has always shown them. */
export const number = (value: number) => new Intl.NumberFormat("en-IN").format(value);

/** Hours to 72, then days; an empty sample reads as an em dash, never a zero (D-018). */
export function hours(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value > 72 ? `${Math.round((value / 24) * 10) / 10} d` : `${value} h`;
}

const CURRENCY_SYMBOL: Record<string, string> = { INR: "₹", USD: "$" };

/** Minor units in the kit page's exact wording: a whole amount loses the decimals. */
export function formatRevenueTotal(totalAmount: number, currency: string): string {
  const major = totalAmount / 100;
  return `${CURRENCY_SYMBOL[currency] ?? currency}${major % 1 === 0 ? major.toFixed(0) : major.toFixed(2)}`;
}

export function OpsPanel({ title, subtitle, icon: Icon, children, className }: { title: string; subtitle?: string; icon?: LucideIcon; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("border border-g-hairline bg-g-surface p-4 gdesk:p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-g-heading text-g-ink">{title}</h2>
          {subtitle ? <p className="mt-2 max-w-2xl text-g-meta text-g-ink-2">{subtitle}</p> : null}
        </div>
        {Icon ? <span className="grid size-9 shrink-0 place-items-center border border-g-hairline text-g-ink-2"><Icon aria-hidden="true" className="size-5" strokeWidth={1.75} /></span> : null}
      </div>
      {children}
    </section>
  );
}

/** One figure and what it counts; the number is mono 13px (DESIGN.md rule 4). */
export function OpsMetric({ label, value, detail, className }: { label: string; value: string; detail?: string; className?: string }) {
  return (
    <div className={cn("border border-g-hairline bg-g-surface p-4", className)}>
      <p className="text-g-label text-g-ink">{label}</p>
      <p className="mt-1"><GoalNum>{value}</GoalNum></p>
      {detail ? <p className="mt-1 text-g-meta text-g-ink-2">{detail}</p> : null}
    </div>
  );
}

/** The note a section shows when there is genuinely nothing to report. */
export function OpsNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-4 border border-dashed border-g-control-edge p-4 text-g-meta text-g-ink-2", className)}>{children}</p>;
}

export function OpsTable({ head, rows, className }: { head: string[]; rows: Array<Array<string | number>>; className?: string }) {
  return (
    <div className={cn("mt-4 overflow-x-auto", className)}>
      <table className="w-full min-w-[520px] text-left">
        <thead>
          <tr className="border-b border-g-hairline text-g-label text-g-ink-3">
            {head.map(label => <th key={label} scope="col" className="py-2 pr-4 font-medium last:pr-0">{label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${index}-${row[0]}`} className="border-b border-g-hairline last:border-b-0">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="py-3 pr-4 last:pr-0">
                  {cellIndex === 0 ? <span className="text-g-meta text-g-ink">{cell}</span> : <GoalNum>{cell}</GoalNum>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
