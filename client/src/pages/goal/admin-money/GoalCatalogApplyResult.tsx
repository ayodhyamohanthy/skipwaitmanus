import { GoalStatus } from "@/components/goal/GoalStatus";
import type { CatalogSyncApplyResponse } from "@shared/catalogSync";

const OBJECT_LABEL: Record<CatalogSyncApplyResponse["created"][number]["kind"], string> = {
  item_family: "Product family",
  item: "Item",
  item_price: "Price",
};

const STOP_LABEL: Record<NonNullable<CatalogSyncApplyResponse["stoppedReason"]>, string> = {
  provider_error: "The provider did not confirm the next object.",
  verification_mismatch: "The created object did not match the reviewed plan.",
  time_budget: "The sync reached its time limit.",
  audit_write_failed: "The audit record could not be confirmed.",
};

export function GoalCatalogApplyResult({ report }: { report: CatalogSyncApplyResponse }) {
  const state = {
    applied: { status: "accepted", label: "Sync applied" },
    partial: { status: "waiting", label: "Sync partially applied" },
    failed: { status: "waiting", label: "Sync failed · check provider" },
    nothing_to_do: { status: "accepted", label: "Nothing needed" },
  } as const;
  const outcome = state[report.outcome];
  return (
    <section aria-label="Apply result" role="region" aria-live="polite" className="mt-6 border border-g-hairline bg-g-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-g-label text-g-ink">Apply result · {report.site} · {report.environment}</h2>
        <GoalStatus status={outcome.status} label={outcome.label} />
      </div>
      <p className="mt-2 text-g-meta text-g-ink-2">Check the Chargebee dashboard before taking another action.</p>
      {report.created.length ? (
        <section aria-label="Created objects" className="mt-4 border-t border-g-hairline pt-3">
          <h3 className="text-g-label text-g-ink">Created objects ({report.created.length})</h3>
          <ul className="mt-2 grid gap-2">
            {report.created.map(object => (
              <li key={`${object.kind}:${object.id}`} className="break-words text-g-meta text-g-ink-2">
                <span className="text-g-label text-g-ink">{OBJECT_LABEL[object.kind]} · {object.id}</span>
                {object.diffs.length ? <ul className="mt-1 grid gap-1">{object.diffs.map(diff => <li key={diff.field}>{diff.field}: expected {String(diff.expected)}, provider returned {String(diff.actual)}</li>)}</ul> : <p className="mt-1">Created without reported differences.</p>}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {report.failed ? (
        <section aria-label="Failed object" className="mt-4 border-t border-g-hairline pt-3">
          <h3 className="text-g-label text-g-ink">Provider did not confirm this object</h3>
          <p className="mt-1 break-words text-g-meta text-g-ink-2">{OBJECT_LABEL[report.failed.kind]} · {report.failed.id}</p>
          <p className="mt-1 break-words text-g-meta text-g-ink-2">{report.failed.message}</p>
        </section>
      ) : null}
      {report.notAttempted.length ? (
        <section aria-label="Not attempted objects" className="mt-4 border-t border-g-hairline pt-3">
          <h3 className="text-g-label text-g-ink">Not attempted ({report.notAttempted.length})</h3>
          <p className="mt-1 text-g-meta text-g-ink-2">{report.stoppedReason ? STOP_LABEL[report.stoppedReason] : "The sync stopped before these objects were attempted."}</p>
          <ul className="mt-2 grid gap-1 text-g-meta text-g-ink-2">{report.notAttempted.map(object => <li key={`${object.kind}:${object.id}`} className="break-all">{OBJECT_LABEL[object.kind]} · {object.id}</li>)}</ul>
        </section>
      ) : null}
    </section>
  );
}
