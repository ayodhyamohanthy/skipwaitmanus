// Company responsiveness signal (owner-approved build Oct 21, flag company_response_signal, off until QA).
// Aggregate only, never ranked or sortable, never for sale. Under MIN_SIGNAL_N referrers or answered asks
// this month, every figure is hidden and the page says "Not enough data yet".
export const MIN_SIGNAL_N = 3;
export const SIGNAL_NOT_ENOUGH = "Not enough data yet";

export type CompanyResponseSignal =
  | { state: "insufficient" }
  | { state: "shown"; usualFirstReplyDays: number; answeredThisMonth: number; referrersInside: number };

export type SignalAsk = { askedAt: Date; firstDecisionAt: Date | null };

const DAY_MS = 86_400_000;

/** Pure. Median days from an ask becoming visible to a referrer's first decision, over asks decided this UTC month. */
export function computeResponseSignal(asks: readonly SignalAsk[], referrersInside: number, now: Date = new Date()): CompanyResponseSignal {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const days = asks
    .filter((ask): ask is { askedAt: Date; firstDecisionAt: Date } => ask.firstDecisionAt !== null && ask.firstDecisionAt.getTime() >= monthStart && ask.firstDecisionAt.getTime() <= now.getTime())
    .map(ask => Math.max(0, ask.firstDecisionAt.getTime() - ask.askedAt.getTime()) / DAY_MS)
    .sort((a, b) => a - b);
  if (referrersInside < MIN_SIGNAL_N || days.length < MIN_SIGNAL_N) return { state: "insufficient" };
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid]! : (days[mid - 1]! + days[mid]!) / 2;
  return { state: "shown", usualFirstReplyDays: Math.max(1, Math.round(median)), answeredThisMonth: days.length, referrersInside };
}
