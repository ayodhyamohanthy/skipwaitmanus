// The referral queue's left column (design/goal-ui/pick/referral-queue.css
// .q-list): the display title with the waiting count, the server's verified
// company, the quiet Impact link (D-077(2): Impact is not a nav item), and one
// goal row per ask. Every count and label arrives as a prop or from the row the
// server sent; the surface adds no number of its own.
import type { ReactNode } from "react";
import { HandHelping } from "lucide-react";
import { GoalClock, GoalListRow, GoalNum, GoalStatus, GoalVerifiedMark } from "@/components/goal";
import type { QueueRow } from "./queueRow";

type QueueListProps = {
  companyLabel: string | null;
  waitingCount: number | null;
  rows: QueueRow[];
  selectedId: number | null;
  onSelect(id: number): void;
  /** Replaces the rows while the list is loading, empty or failed. */
  children?: ReactNode;
};

function QueueRowItem({ row, selected, onSelect }: { row: QueueRow; selected: boolean; onSelect(): void }) {
  return (
    <GoalListRow
      density="queue"
      selectable
      selected={selected}
      onSelect={onSelect}
      title={row.rowTitle}
      trailing={<GoalStatus status={row.status} label={row.statusLabel} />}
      meta={
        <>
          {row.functionLabel ?? row.companyLabel}
          {row.clockLabel ? (
            <>
              <span aria-hidden="true" className="px-1.5">·</span>
              <GoalClock label={row.clockLabel} urgent={row.clockUrgent} />
            </>
          ) : null}
        </>
      }
    />
  );
}

export function QueueList({ companyLabel, waitingCount, rows, selectedId, onSelect, children }: QueueListProps) {
  return (
    <section aria-label="Referral queue" className="gdesk:border-r gdesk:border-g-hairline flex min-w-0 flex-col">
      <header className="grid gap-2 border-b border-g-hairline px-5 pt-5 pb-4 max-gdesk:px-4 max-gdesk:pt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-g-display text-g-ink max-gdesk:text-g-display">Referral queue</h2>
          {waitingCount === null ? null : (
            <span className="text-g-meta whitespace-nowrap text-g-ink-3">
              <GoalNum className="text-g-ink-2">{waitingCount}</GoalNum> waiting
            </span>
          )}
        </div>
        <div className="flex min-h-7 items-center justify-between gap-3">
          {companyLabel ? <GoalVerifiedMark>{`Verified · ${companyLabel}`}</GoalVerifiedMark> : <span />}
          <a href="/referrer/impact" className="inline-flex min-h-7 items-center gap-1.5 rounded-g-control px-1 text-g-meta text-g-ink-2 transition-colors duration-(--g-dur-hover) ease-g-out hover:bg-g-surface-hover hover:text-g-ink">
            <HandHelping aria-hidden="true" className="size-4" strokeWidth={1.75} />
            <span className="underline decoration-g-control-edge underline-offset-[3px]">Impact</span>
          </a>
        </div>
        <p className="text-g-meta text-g-ink-3" style={{ textWrap: "pretty" }}>
          {companyLabel ? `Asks for ${companyLabel} roles.` : "Asks for your company's roles."} Names and resumes stay hidden until you accept.
        </p>
      </header>
      {children ?? (
        <ul className="grid gap-0.5 p-2 max-gdesk:px-1">
          {rows.map(row => (
            <QueueRowItem key={row.id} row={row} selected={selectedId === row.id} onSelect={() => onSelect(row.id)} />
          ))}
        </ul>
      )}
      <p className="mt-auto flex h-[73px] items-center border-t border-g-hairline px-5 text-g-meta text-g-ink-3 max-gdesk:h-auto max-gdesk:mt-2 max-gdesk:border-0 max-gdesk:px-4 max-gdesk:py-4">
        Referrers are never charged.
      </p>
    </section>
  );
}
