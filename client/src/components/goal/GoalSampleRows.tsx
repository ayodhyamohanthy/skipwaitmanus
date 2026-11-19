/**
 * Sample-filled empty states (owner override, Oct 21 11:35 PM IST, verified
 * phonemsg-01M5FT6Z0SYN6QWFVDR3J3S2CS): when a surface has NO real rows and the
 * user has never used the feature, show clearly-marked SAMPLE rows so the page
 * teaches the anatomy. Hard rules (spec sample-empty-spec-f099d6a9):
 * - every row is visibly tagged SAMPLE under a "SAMPLE · NOT REAL ASKS" kick;
 * - placeholder-by-inspection names only (never real companies/people/metrics);
 * - rows are inert: no link, no onClick, cursor default, aria-hidden, untabbable;
 * - samples never touch counts, slots, credits, unread, routes or withdraw.
 */
import { GoalStatus, type GoalStatusValue } from "./GoalStatus";

export type GoalSampleRow = {
  company: string;
  title: string;
  status: GoalStatusValue;
  label: string;
  stepper?: { stage: number };
  verb: string;
  day: string;
  next: string;
};

export function GoalSampleRows({ rows, caption, kick = "SAMPLE · NOT REAL ASKS" }: { rows: GoalSampleRow[]; caption: string; kick?: string }) {
  return (
    <section data-testid="goal-sample-rows" aria-labelledby="goal-sample-rows-kick" className="mt-4 px-3 gdesk:px-4">
      <div className="flex items-center gap-3">
        <h2 id="goal-sample-rows-kick" className="font-g-mono text-[11px] tracking-[0.12em] text-g-ink-3">{kick}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-g-hairline" />
      </div>
      <ul aria-hidden="true" className="pointer-events-none mt-1 select-none opacity-[0.45]">
        {rows.map(row => (
          <li key={row.company} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-0.5 border-b border-g-hairline px-3 py-3 last:border-b-0">
            <span className="flex min-w-0 cursor-default items-center gap-2">
              <span className="min-w-0 truncate text-g-label text-g-ink">{row.company}</span>
              <span className="shrink-0 rounded border border-g-hairline px-1 font-g-mono text-[10px] tracking-[0.08em] text-g-ink-3">SAMPLE</span>
            </span>
            <span className="justify-self-end"><GoalStatus status={row.status} label={row.label} stepper={row.stepper} /></span>
            <span className="col-span-2 min-w-0 truncate text-g-meta text-g-ink-3">
              {row.title} · <span className="font-g-mono uppercase">{row.verb} {row.day}</span>
            </span>
            <span className="col-span-2 min-w-0 text-g-meta text-g-ink-3">{row.next}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 px-3 text-g-meta text-g-ink-2">{caption}</p>
    </section>
  );
}
