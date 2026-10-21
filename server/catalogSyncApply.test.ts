import { describe, expect, it, vi } from "vitest";
import { catalogSyncApplyResponseSchema, type CatalogSyncDryRun } from "../shared/catalogSync";
import { ChargebeeApiError } from "./chargebeeApi";
import { applyCatalogSync, buildCatalogSyncDryRun, type CatalogSyncActivity, type CatalogSyncApplyDeps } from "./catalogSyncApply";
import { createFakeCatalogApi, syncedSiteState, type FakeCatalogOptions } from "./catalogSyncFixtures";
import type { CatalogSiteState } from "./catalogSyncPlan";

const SITE = { site: "skipwait", environment: "live" as const };

function harness(seed?: CatalogSiteState, options: FakeCatalogOptions = {}, overrides: Partial<CatalogSyncApplyDeps> = {}) {
  const fake = createFakeCatalogApi(seed, options);
  const activity: CatalogSyncActivity[] = [];
  const record = vi.fn(async (entry: CatalogSyncActivity) => { activity.push(entry); });
  const reportError = vi.fn();
  const deps: CatalogSyncApplyDeps = { api: fake.api, site: SITE, actorUserId: 7, record, reportError, ...overrides };
  const dryRun = () => buildCatalogSyncDryRun({ api: fake.api, site: SITE });
  return { fake, activity, record, reportError, deps, dryRun };
}

/** A site where the family, the pack items and the INR pack prices already exist. */
function partlySynced(): CatalogSiteState {
  const synced = syncedSiteState();
  return { families: synced.families, items: synced.items.filter(item => item.id.startsWith("skipwait_pack_")), itemPrices: synced.itemPrices.filter(price => price.id.startsWith("skipwait_pack_") && price.id.endsWith("-INR")) };
}

const actionIds = (dryRun: CatalogSyncDryRun) => dryRun.toCreate.map(action => action.params.id);

describe("applyCatalogSync", () => {
  it("refuses a stale plan hash before any write and records the refusal", async () => {
    const { fake, deps, dryRun, activity } = harness(partlySynced());
    const reviewed = await dryRun();
    fake.state.itemPrices.push({ id: "skipwait_pack_5-USD", name: "skipwait_pack_5-USD", item_id: "skipwait_pack_5", item_type: "charge", status: "active", currency_code: "USD", price: 500, pricing_model: "per_unit" });
    const result = await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    const fresh = await dryRun();
    expect(result).toEqual({ status: "refused", code: "stale_plan", currentHash: fresh.planHash, message: expect.stringMatching(/changed/) });
    expect(fake.creates()).toEqual([]);
    expect(activity).toEqual([expect.objectContaining({ action: "billing.catalog_sync.apply_refused", outcome: "denied", metadata: expect.objectContaining({ reason: "stale_plan", planHash: reviewed.planHash, currentHash: fresh.planHash, site: "skipwait", environment: "live" }) })]);
  });

  it("refuses a confirmSite that is not the configured site without calling the provider", async () => {
    const { fake, deps } = harness();
    const result = await applyCatalogSync({ planHash: "a".repeat(64), confirmSite: "skipwait-test" }, deps);
    expect(result).toMatchObject({ status: "refused", code: "site_mismatch" });
    expect(fake.calls).toEqual([]);
  });

  it("creates only the missing objects in plan order, and a re-run creates nothing", async () => {
    const { fake, deps, dryRun, activity } = harness(partlySynced());
    const reviewed = await dryRun();
    expect(reviewed.toCreate.some(action => action.kind === "item_family")).toBe(false);
    const result = await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    if (result.status !== "done") throw new Error(`unexpected ${result.status}`);
    expect(catalogSyncApplyResponseSchema.parse(result.report)).toEqual(result.report);
    expect(result.report).toMatchObject({ outcome: "applied", failed: null, notAttempted: [], stoppedReason: null, planHash: reviewed.planHash });
    expect(result.report.created.map(entry => entry.id)).toEqual(actionIds(reviewed));
    expect(result.report.created.every(entry => entry.diffs.length === 0)).toBe(true);
    expect(fake.creates()).toEqual(actionIds(reviewed));

    const after = await dryRun();
    expect(after.toCreate).toEqual([]);
    expect(after.counts).toMatchObject({ correct: 54, mismatched: 0, blocked: 0 });
    activity.length = 0;
    const again = await applyCatalogSync({ planHash: after.planHash, confirmSite: "skipwait" }, deps);
    expect(again).toMatchObject({ status: "done", report: { outcome: "nothing_to_do", created: [], notAttempted: [], failed: null, stoppedReason: null } });
    expect(fake.creates()).toEqual(actionIds(reviewed));
    expect(activity.some(entry => entry.action === "billing.catalog_sync.apply_started")).toBe(false);
  });

  it("stops at the first provider error and reports what was created, what failed and what was not attempted", async () => {
    const probe = harness();
    const reviewedIds = actionIds(await probe.dryRun());
    const firstNinety = reviewedIds.find(id => /_90d-/.test(id)) ?? "";
    const refusal = new ChargebeeApiError(400, "invalid_request", "param_wrong_value", "period_unit : The billing frequency is not configured");
    const { fake, deps, dryRun, reportError, activity } = harness(undefined, { failCreate: call => (call.id === firstNinety ? refusal : undefined) });
    const reviewed = await dryRun();
    const result = await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    if (result.status !== "done") throw new Error(`unexpected ${result.status}`);
    const failedAt = reviewedIds.indexOf(firstNinety);
    expect(result.report.outcome).toBe("partial");
    expect(result.report.stoppedReason).toBe("provider_error");
    expect(result.report.created.map(entry => entry.id)).toEqual(reviewedIds.slice(0, failedAt));
    expect(result.report.failed).toEqual({ kind: "item_price", id: firstNinety, httpStatus: 400, apiErrorCode: "invalid_request", errorCode: "param_wrong_value", message: "period_unit : The billing frequency is not configured" });
    expect(result.report.notAttempted.map(entry => entry.id)).toEqual(reviewedIds.slice(failedAt + 1));
    expect(fake.creates()).toEqual(reviewedIds.slice(0, failedAt));
    expect(fake.calls.filter(call => call.method.startsWith("create")).at(-1)?.id).toBe(firstNinety);
    expect(activity.filter(entry => entry.action === "billing.catalog_sync.create_failed")).toEqual([expect.objectContaining({ outcome: "failure", resourceType: "chargebee_item_price", resourceId: firstNinety, metadata: expect.objectContaining({ httpStatus: 400, apiErrorCode: "invalid_request" }) })]);
    expect(activity.at(-1)).toMatchObject({ action: "billing.catalog_sync.apply_finished", outcome: "failure", metadata: expect.objectContaining({ outcome: "partial", stoppedReason: "provider_error" }) });
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  it("calls a provider that never answered a create a failure, without claiming the object is missing", async () => {
    const { deps, dryRun } = harness(undefined, { failCreate: call => (call.index === 0 ? new DOMException("The operation was aborted due to timeout", "TimeoutError") : undefined) });
    const reviewed = await dryRun();
    const result = await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    expect(result).toMatchObject({ status: "done", report: { outcome: "failed", stoppedReason: "provider_error", created: [], failed: { id: "skipwait", httpStatus: null, apiErrorCode: "no_answer", message: expect.stringMatching(/check again/i) } } });
  });

  it("stops as verification_mismatch when Chargebee answers a create with a different object", async () => {
    const { fake, deps, dryRun } = harness(partlySynced(), { answerItemPrice: created => (created.id === "skipwait_pack_25-USD" ? { ...created, price: 2100 } : created) });
    const reviewed = await dryRun();
    const result = await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    if (result.status !== "done") throw new Error(`unexpected ${result.status}`);
    expect(result.report).toMatchObject({ outcome: "partial", stoppedReason: "verification_mismatch", failed: null });
    expect(result.report.created.at(-1)).toEqual({ kind: "item_price", id: "skipwait_pack_25-USD", diffs: [{ field: "price", expected: 2200, actual: 2100 }] });
    expect(fake.creates().at(-1)).toBe("skipwait_pack_25-USD");
    expect(result.report.created.length + result.report.notAttempted.length).toBe(reviewed.toCreate.length);
  });

  it("stops when the time budget runs out and reports the rest as not attempted", async () => {
    let clock = 0;
    const { deps, dryRun } = harness(undefined, { beforeCreate: () => { clock += 10_000; } }, { now: () => clock });
    const reviewed = await dryRun();
    const result = await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    if (result.status !== "done") throw new Error(`unexpected ${result.status}`);
    // Creates start at 0, 10, 20, 30 and 40 s; at 50 s fewer than 15 s of the 60 s budget remain.
    expect(result.report).toMatchObject({ outcome: "partial", stoppedReason: "time_budget", failed: null });
    expect(result.report.created).toHaveLength(5);
    expect(result.report.created.length + result.report.notAttempted.length).toBe(reviewed.toCreate.length);
  });

  it("records start, every create and finish with site, environment and planHash; no start row means no writes; a failed audit write stops the run", async () => {
    const { deps, dryRun, activity } = harness(partlySynced());
    const reviewed = await dryRun();
    await applyCatalogSync({ planHash: reviewed.planHash, confirmSite: "skipwait" }, deps);
    expect(activity.map(entry => entry.action)).toEqual(["billing.catalog_sync.apply_started", ...reviewed.toCreate.map(() => "billing.catalog_sync.created"), "billing.catalog_sync.apply_finished"]);
    for (const entry of activity) {
      expect(entry.actorUserId).toBe(7);
      expect(entry.metadata).toMatchObject({ site: "skipwait", environment: "live", planHash: reviewed.planHash });
    }
    const pack = activity.find(entry => entry.resourceId === "skipwait_pack_25-USD");
    expect(pack).toMatchObject({ outcome: "success", resourceType: "chargebee_item_price", metadata: expect.objectContaining({ currency: "USD", amount: 2200, pricingModel: "per_unit" }) });
    expect(JSON.stringify(activity)).not.toMatch(/apiKey|secret/i);

    const noStart = harness(partlySynced(), {}, { record: vi.fn(async () => { throw new Error("db down"); }) });
    const noStartDryRun = await noStart.dryRun();
    expect(await applyCatalogSync({ planHash: noStartDryRun.planHash, confirmSite: "skipwait" }, noStart.deps)).toMatchObject({ status: "refused", code: "audit_unavailable" });
    expect(noStart.fake.creates()).toEqual([]);

    let createdRows = 0;
    const flaky = harness(partlySynced(), {}, { record: vi.fn(async (entry: CatalogSyncActivity) => { if (entry.action === "billing.catalog_sync.created" && ++createdRows === 3) throw new Error("db down"); }) });
    const flakyDryRun = await flaky.dryRun();
    const stopped = await applyCatalogSync({ planHash: flakyDryRun.planHash, confirmSite: "skipwait" }, flaky.deps);
    if (stopped.status !== "done") throw new Error(`unexpected ${stopped.status}`);
    expect(stopped.report).toMatchObject({ outcome: "partial", stoppedReason: "audit_write_failed", failed: null });
    expect(stopped.report.created.map(entry => entry.id)).toEqual(actionIds(flakyDryRun).slice(0, 3));
    expect(flaky.fake.creates()).toEqual(actionIds(flakyDryRun).slice(0, 3));
    expect(flaky.reportError).toHaveBeenCalled();
  });

  it("answers provider_unreadable when Chargebee cannot be listed, and creates nothing", async () => {
    const { fake, deps } = harness(undefined, { failLists: new ChargebeeApiError(503, "service_unavailable", null, "down") });
    expect(await applyCatalogSync({ planHash: "b".repeat(64), confirmSite: "skipwait" }, deps)).toMatchObject({ status: "refused", code: "provider_unreadable" });
    expect(fake.creates()).toEqual([]);
  });
});
