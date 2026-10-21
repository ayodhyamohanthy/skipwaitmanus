// Dry run and apply for the admin Chargebee catalog sync (D-069).
//
// Apply re-reads the site, refuses unless the reviewed hash still matches, writes
// a start row, then creates only what the plan lists — one call at a time, in
// order. It never updates, archives or deletes, and it never touches
// subscriptions, customers, invoices or payments.
import type { CatalogSyncAction, CatalogSyncApplyRequest, CatalogSyncApplyResponse, CatalogSyncDiff, CatalogSyncDryRun } from "../shared/catalogSync";
import type { CatalogApi } from "./chargebeeCatalogApi";
import { ChargebeeApiError } from "./chargebeeApi";
import { desiredCatalog, excludedItemPrices } from "./catalogSyncDesired";
import { planCatalogSync, priceDiffs, type ProviderItemPrice } from "./catalogSyncPlan";

export type CatalogSyncActivity = {
  actorUserId: number;
  action: string;
  outcome: "success" | "failure" | "denied";
  resourceType?: string;
  resourceId?: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type CatalogSyncSite = { site: string; environment: "test" | "live" };

export type CatalogSyncApplyDeps = {
  api: CatalogApi;
  site: CatalogSyncSite;
  actorUserId: number;
  record(entry: CatalogSyncActivity): Promise<void>;
  reportError(error: unknown, context?: Record<string, unknown>): void;
  now?: () => number;
};

export type CatalogSyncApplyResult =
  | { status: "done"; report: CatalogSyncApplyResponse }
  | { status: "refused"; code: string; message: string; currentHash?: string };

/** The whole apply must finish inside a minute; a create started with 15s left still ends inside it. */
const TIME_BUDGET_MS = 60_000;
const MIN_REMAINING_MS = 15_000;

function clockOf(deps: { now?: () => number }): () => number {
  return deps.now ?? Date.now;
}

function resourceTypeFor(kind: CatalogSyncAction["kind"]): string {
  return kind === "item_family" ? "chargebee_item_family" : kind === "item" ? "chargebee_item" : "chargebee_item_price";
}

async function createOne(api: CatalogApi, action: CatalogSyncAction) {
  switch (action.kind) {
    case "item_family":
      return api.createItemFamily(action.params);
    case "item":
      return api.createItem(action.params);
    case "item_price":
      return api.createItemPrice(action.params);
  }
}

function createdRow(action: CatalogSyncAction, diffs: CatalogSyncDiff[], deps: CatalogSyncApplyDeps, planHash: string): CatalogSyncActivity {
  const metadata: Record<string, string | number | boolean | null> = { site: deps.site.site, environment: deps.site.environment, planHash };
  if (action.kind === "item_price") {
    metadata.currency = action.params.currencyCode;
    metadata.amount = action.params.price;
    metadata.pricingModel = action.params.pricingModel;
  }
  return {
    actorUserId: deps.actorUserId,
    action: "billing.catalog_sync.created",
    outcome: "success",
    resourceType: resourceTypeFor(action.kind),
    resourceId: action.params.id,
    metadata: { ...metadata, ...(diffs.length > 0 ? { diffs: diffs.map(diff => `${diff.field}: ${String(diff.expected)} -> ${String(diff.actual)}`).join("; ") } : {}) },
  };
}

/** Reads the site and classifies it. Read-only: never records an audit row. */
export async function buildCatalogSyncDryRun(input: { api: CatalogApi; site: CatalogSyncSite; now?: () => Date | number }): Promise<CatalogSyncDryRun> {
  const [families, items, itemPrices] = await Promise.all([
    input.api.listItemFamilies(),
    input.api.listItems({ idPrefix: "skipwait_" }),
    input.api.listItemPrices({ idPrefix: "skipwait_" }),
  ]);
  const clock = input.now?.() ?? Date.now();
  const checkedAt = typeof clock === "number" ? new Date(clock) : clock;
  return planCatalogSync({
    desired: desiredCatalog(),
    excluded: excludedItemPrices(),
    state: { families, items, itemPrices },
    site: input.site.site,
    environment: input.site.environment,
    checkedAt,
  });
}

export async function applyCatalogSync(request: CatalogSyncApplyRequest, deps: CatalogSyncApplyDeps): Promise<CatalogSyncApplyResult> {
  if (request.confirmSite !== deps.site.site) {
    return { status: "refused", code: "site_mismatch", message: `Type the site name (${deps.site.site}) to confirm this apply.` };
  }

  const now = clockOf(deps);
  let fresh: CatalogSyncDryRun;
  try {
    fresh = await buildCatalogSyncDryRun({ api: deps.api, site: deps.site, now });
  } catch (error) {
    deps.reportError(error, { step: "catalog_sync_list" });
    return { status: "refused", code: "provider_unreadable", message: "Chargebee could not be read. Nothing was changed." };
  }

  if (fresh.planHash !== request.planHash) {
    const message = "The Chargebee catalog changed since this dry run. Run the dry run again before applying.";
    try {
      await deps.record({
        actorUserId: deps.actorUserId,
        action: "billing.catalog_sync.apply_refused",
        outcome: "denied",
        metadata: { reason: "stale_plan", planHash: request.planHash, currentHash: fresh.planHash, site: deps.site.site, environment: deps.site.environment },
      });
    } catch (error) {
      deps.reportError(error, { step: "catalog_sync_refusal_audit" });
    }
    return { status: "refused", code: "stale_plan", currentHash: fresh.planHash, message };
  }

  const base = { site: deps.site.site, environment: deps.site.environment, planHash: fresh.planHash };
  if (fresh.toCreate.length === 0) {
    return { status: "done", report: { outcome: "nothing_to_do", ...base, created: [], failed: null, notAttempted: [], stoppedReason: null } };
  }

  try {
    await deps.record({ actorUserId: deps.actorUserId, action: "billing.catalog_sync.apply_started", outcome: "success", metadata: base });
  } catch (error) {
    deps.reportError(error, { step: "catalog_sync_start_audit" });
    return { status: "refused", code: "audit_unavailable", message: "The apply could not be recorded, so nothing was created." };
  }

  const actions = fresh.toCreate;
  const startedAt = now();
  const created: CatalogSyncApplyResponse["created"] = [];
  let failed: CatalogSyncApplyResponse["failed"] = null;
  let stoppedReason: CatalogSyncApplyResponse["stoppedReason"] = null;
  let nextIndex = actions.length;

  for (let index = 0; index < actions.length; index += 1) {
    if (now() - startedAt >= TIME_BUDGET_MS - MIN_REMAINING_MS) {
      stoppedReason = "time_budget";
      nextIndex = index;
      break;
    }
    const action = actions[index];
    const diffs: CatalogSyncDiff[] = [];
    try {
      const answer = await createOne(deps.api, action);
      if (action.kind === "item_price") diffs.push(...priceDiffs(answer as ProviderItemPrice, action.params));
      created.push({ kind: action.kind, id: action.params.id, diffs });
      try {
        await deps.record(createdRow(action, diffs, deps, fresh.planHash));
      } catch (error) {
        deps.reportError(error, { step: "catalog_sync_audit_write" });
        stoppedReason = "audit_write_failed";
        nextIndex = index + 1;
        break;
      }
      if (diffs.length > 0) {
        deps.reportError(new Error(`Chargebee answered a different object for ${action.params.id}`), { step: "catalog_sync_verification" });
        stoppedReason = "verification_mismatch";
        nextIndex = index + 1;
        break;
      }
    } catch (error) {
      const noAnswer = !(error instanceof ChargebeeApiError);
      failed = {
        kind: action.kind,
        id: action.params.id,
        httpStatus: error instanceof ChargebeeApiError ? error.status : null,
        apiErrorCode: error instanceof ChargebeeApiError ? error.apiErrorCode : "no_answer",
        errorCode: error instanceof ChargebeeApiError ? error.errorCode : null,
        message: error instanceof ChargebeeApiError
          ? error.providerMessage
          : "Chargebee did not answer. Nothing is confirmed — check again in the Chargebee dashboard.",
      };
      stoppedReason = "provider_error";
      nextIndex = index + 1;
      try {
        await deps.record({
          actorUserId: deps.actorUserId,
          action: "billing.catalog_sync.create_failed",
          outcome: "failure",
          resourceType: resourceTypeFor(action.kind),
          resourceId: action.params.id,
          metadata: { ...base, httpStatus: failed.httpStatus, apiErrorCode: failed.apiErrorCode, ...(noAnswer ? { noAnswer: true } : {}) },
        });
      } catch (auditError) {
        deps.reportError(auditError, { step: "catalog_sync_failure_audit" });
      }
      deps.reportError(error, { step: "catalog_sync_create" });
      break;
    }
  }

  const outcome: CatalogSyncApplyResponse["outcome"] = stoppedReason === null ? "applied" : created.length === 0 ? "failed" : "partial";
  const report: CatalogSyncApplyResponse = {
    outcome,
    ...base,
    created,
    failed,
    notAttempted: actions.slice(nextIndex).map(action => ({ kind: action.kind, id: action.params.id })),
    stoppedReason,
  };

  try {
    await deps.record({
      actorUserId: deps.actorUserId,
      action: "billing.catalog_sync.apply_finished",
      outcome: stoppedReason === null ? "success" : "failure",
      metadata: { ...base, outcome, stoppedReason },
    });
  } catch (error) {
    deps.reportError(error, { step: "catalog_sync_finish_audit" });
  }

  return { status: "done", report };
}
