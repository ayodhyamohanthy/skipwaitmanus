/**
 * Referrer-side sample-filled empty state (owner override, Oct 21 11:35 PM IST,
 * verified phonemsg-01M5FT6Z0SYN6QWFVDR3J3S2CS; spec sample-empty-spec-f099d6a9,
 * /referrer-home section): when a verified referrer's queue is empty AND the
 * server says they have never claimed or passed an ask, show two clearly-marked
 * SAMPLE rows teaching the accept/pass anatomy. Same hard rules as the seeker
 * primitive (GoalSampleRows):
 * - every row is visibly tagged SAMPLE under a "SAMPLE · NOT REAL ASKS" kick;
 * - placeholder-by-inspection names only (never real companies/people/metrics);
 * - rows are inert: no link, no onClick, cursor default, aria-hidden, untabbable;
 * - samples never touch capacity, counts, credits, or any route.
 */
export type GoalReferrerSampleRow = {
  /** Anonymized placeholder name line, e.g. "A. Sample · Product Analyst". */
  name: string;
  /** Relative-time label rendered mono uppercase, e.g. "2H AGO". */
  time: string;
  /** Why-this-ask line ("Asked for you by name…"). */
  reason: string;
  /** Waiting-on-you line; the pass-releases-credit truth where it applies. */
  next: string;
};

export function GoalReferrerSampleRows({ rows, caption, kick = "SAMPLE · NOT REAL ASKS" }: { rows: GoalReferrerSampleRow[]; caption: string; kick?: string }) {
  return (
    <section data-testid="goal-referrer-sample-rows" aria-labelledby="goal-referrer-sample-rows-kick" className="mt-2">
      <div className="flex items-center gap-3">
        <h2 id="goal-referrer-sample-rows-kick" className="font-g-mono text-[11px] tracking-[0.12em] text-g-ink-3">{kick}</h2>
        <span aria-hidden="true" className="h-px flex-1 bg-g-hairline" />
      </div>
      <ul aria-hidden="true" className="pointer-events-none mt-1 select-none opacity-[0.45]">
        {rows.map(row => (
          <li key={row.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-g-hairline py-3 last:border-b-0">
            <span className="flex min-w-0 cursor-default items-center gap-2">
              <span aria-hidden="true" className="inline-block size-1.5 shrink-0 rounded-full bg-g-ink-3" />
              <span className="min-w-0 truncate text-g-label text-g-ink">{row.name}</span>
              <span className="shrink-0 rounded border border-g-hairline px-1 font-g-mono text-[10px] tracking-[0.08em] text-g-ink-3">SAMPLE</span>
            </span>
            <span className="justify-self-end font-g-mono text-g-meta uppercase text-g-ink-3">{row.time}</span>
            <span className="col-span-2 min-w-0 text-g-meta text-g-ink-3">{row.reason}</span>
            <span className="col-span-2 min-w-0 text-g-meta text-g-ink-3">{row.next}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-g-meta text-g-ink-2">{caption}</p>
    </section>
  );
}
