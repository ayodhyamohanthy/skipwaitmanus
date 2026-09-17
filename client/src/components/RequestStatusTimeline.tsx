import type { ReferralStatus } from "@shared/referral";

/**
 * Seeker-visible status history (spec §2.2 "traceability block").
 *
 * A vertical dotted timeline: `Request sent — date` → `Claimed by a verified
 * employee — date` → `Decision — …`. Completed steps take the semantic status
 * colour; the waiting step is gray. Entries are derived only from fields the
 * seeker is already allowed to see (created/updated timestamps, status, and
 * whether a referrer is attached) — never the referrer's identity.
 */
export type TimelineEntry = { label: string; date: string | null; tone: "green" | "blue" | "red" | "slate" | "amber"; state: "done" | "waiting" };

const toneColor: Record<TimelineEntry["tone"], string> = { green: "#15803d", blue: "#0000ff", red: "#b91c1c", slate: "#505050", amber: "#b45309" };

function formatStamp(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export function buildRequestTimeline(request: { status: ReferralStatus; referrerId: number | null; createdAt: string; updatedAt: string; queueStatus?: "available_for_review" | "waiting_for_coverage" | null }): TimelineEntry[] {
  const sent: TimelineEntry = { label: "Request sent", date: request.createdAt, tone: "green", state: "done" };
  if (request.status === "withdrawn") return [sent, { label: "Withdrawn — credit returned", date: request.updatedAt, tone: "slate", state: "done" }];
  const claimed = Boolean(request.referrerId);
  const claimedEntry: TimelineEntry = claimed
    ? { label: request.status === "pending" && request.queueStatus === "available_for_review" ? "Available to a verified employee" : "Claimed by a verified employee", date: request.status === "pending" ? request.updatedAt : null, tone: "blue", state: "done" }
    : { label: request.queueStatus === "waiting_for_coverage" ? "Waiting for company coverage" : "Waiting for a verified employee", date: null, tone: "slate", state: "waiting" };
  if (request.status === "pending") return [sent, claimedEntry, { label: "Decision", date: null, tone: "slate", state: "waiting" }];
  if (request.status === "declined") return [sent, claimedEntry, { label: "Declined", date: request.updatedAt, tone: "red", state: "done" }];
  const decided: TimelineEntry = { label: "Referral accepted", date: request.status === "approved" ? request.updatedAt : null, tone: "green", state: "done" };
  if (request.status === "approved") return [sent, claimedEntry, decided];
  const milestoneLabel: Partial<Record<ReferralStatus, string>> = { intro_made: "Introduction made", interview: "Interview recorded", offer: "Offer recorded", closed: "Request closed" };
  return [sent, claimedEntry, decided, { label: milestoneLabel[request.status] ?? "Updated", date: request.updatedAt, tone: request.status === "closed" ? "slate" : request.status === "offer" ? "green" : "blue", state: "done" }];
}

export function RequestStatusTimeline({ entries, label = "Status history" }: { entries: TimelineEntry[]; label?: string }) {
  return <ol aria-label={label} className="space-y-2.5">
    {entries.map((entry, index) => {
      const color = entry.state === "waiting" ? "#767676" : toneColor[entry.tone];
      const stamp = formatStamp(entry.date);
      return <li key={`${entry.label}-${index}`} className="flex items-baseline gap-2.5 text-sm">
        <span aria-hidden="true" className="relative top-[-1px] inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: entry.state === "waiting" ? "inset 0 0 0 1.5px #767676, inset 0 0 0 3px #fff" : undefined }} />
        <span className={entry.state === "waiting" ? "font-medium text-[#625D52]" : "font-semibold"} style={entry.state === "waiting" ? undefined : { color }}>{entry.label}</span>
        <span className="ml-auto shrink-0 text-xs text-[#625D52]">{stamp ?? (entry.state === "waiting" ? "waiting" : "")}</span>
      </li>;
    })}
  </ol>;
}
