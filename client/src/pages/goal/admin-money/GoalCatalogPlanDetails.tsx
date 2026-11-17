// Goal /admin/catalog-sync object-level effects (review finding F2 on pull request 1204). Before the
// typed-site apply, the admin sees exactly what the plan would create (each id
// and its parameters), every existing price that differs (expected against
// actual, and whether it still sells) and every blocked price with its reason,
// as the kit page AdminCatalogSync.tsx does. Read-only: nothing here calls the
// server. Status is plain text with goal tokens, never inline colour.
import type { ReactNode } from "react";
import { formatAmount } from "@/components/admin/paymentReviewCopy";
import type { CatalogSyncAction, CatalogSyncDryRun } from "@shared/catalogSync";

const ACTION_LABEL: Record<CatalogSyncAction["kind"], string> = {
  item_family: "Product family",
  item: "Item",
  item_price: "Price",
};

/** The parameters the apply would send for one object, in plain words. */
export function catalogActionDetail(action: CatalogSyncAction): string {
  if (action.kind === "item_family") return action.params.name;
  if (action.kind === "item") {
    const family = action.params.itemFamilyId ? ` · family ${action.params.itemFamilyId}` : "";
    return `${action.params.type === "plan" ? "Plan" : "Charge"} item · ${action.params.externalName}${family}`;
  }
  const spec = action.params;
  const period = spec.period !== null && spec.periodUnit !== null ? ` · every ${spec.period} ${spec.periodUnit}${spec.period === 1 ? "" : "s"}` : "";
  const cycles = spec.billingCycles !== null ? ` · ${spec.billingCycles} cycles` : "";
  return `${formatAmount(spec.price, spec.currencyCode)} · ${spec.itemType === "plan" ? "plan" : "one-time charge"} · ${spec.externalName} · item ${spec.itemId}${period}${cycles}`;
}

function PlanSection({ label, title, empty, children }: { label: string; title: string; empty: string; children: ReactNode | null }) {
  return (
    <section aria-label={label} className="mt-6 border border-g-hairline bg-g-surface">
      <h2 className="border-b border-g-hairline p-4 text-g-label text-g-ink">{title}</h2>
      {children ?? <p className="p-4 text-g-meta text-g-ink-3">{empty}</p>}
    </section>
  );
}

export function GoalCatalogPlanDetails({ dryRun }: { dryRun: CatalogSyncDryRun }) {
  return (
    <>
      <PlanSection label="Objects to create" title={`To create (${dryRun.toCreate.length})`} empty="Nothing to create. Every sold price already matches the catalog.">
        {dryRun.toCreate.length ? (
          <ul>{dryRun.toCreate.map(action => (
            <li key={`${action.kind}:${action.params.id}`} className="grid gap-1 border-b border-g-hairline p-4 last:border-b-0">
              <span className="break-all text-g-label text-g-ink">{action.params.id}</span>
              <span className="text-g-meta text-g-ink-2">{ACTION_LABEL[action.kind]} · {catalogActionDetail(action)}</span>
            </li>
          ))}</ul>
        ) : null}
      </PlanSection>
      <PlanSection label="Mismatched prices" title={`Mismatched, fixed in Chargebee (${dryRun.mismatched.length})`} empty="No existing price differs from the catalog.">
        {dryRun.mismatched.length ? (
          <ul>{dryRun.mismatched.map(entry => (
            <li key={entry.itemPriceId} className="grid gap-1 border-b border-g-hairline p-4 last:border-b-0">
              <span className="break-all text-g-label text-g-ink">{entry.itemPriceId}</span>
              <span className="text-g-meta text-g-ink-2">{formatAmount(entry.price, entry.currencyCode)} · {entry.sellableNow ? "Still sells" : "Does not sell"}</span>
              <ul className="grid gap-0.5 text-g-meta text-g-ink-2">
                {entry.diffs.map(diff => <li key={diff.field}>{diff.field}: expected {String(diff.expected)}, Chargebee has {String(diff.actual)}</li>)}
              </ul>
            </li>
          ))}</ul>
        ) : null}
      </PlanSection>
      <PlanSection label="Blocked prices" title={`Blocked (${dryRun.blocked.length})`} empty="Nothing is blocked.">
        {dryRun.blocked.length ? (
          <ul>{dryRun.blocked.map(entry => (
            <li key={entry.itemPriceId} className="grid gap-1 border-b border-g-hairline p-4 last:border-b-0">
              <span className="break-all text-g-label text-g-ink">{entry.itemPriceId}</span>
              <span className="text-g-meta text-g-ink-2">{entry.reason}</span>
            </li>
          ))}</ul>
        ) : null}
      </PlanSection>
    </>
  );
}
