import { describe, expect, it, vi } from "vitest";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";
import { createChargebeePendingReconcile, PENDING_GRACE_MS, PENDING_MAX_AGE_MS, PENDING_RECHECK_MS, PENDING_RECONCILE_BATCH, type PendingPayment, type ReconciledHostedPage } from "./chargebeePendingReconcile";

const NOW = Date.parse("2026-10-14T10:00:00.000Z");
const ctx = { nowMs: NOW, windowKey: "2026-10-14T10:00Z" };
const row = (id: number, over: Partial<PendingPayment> = {}): PendingPayment => ({ id, hostedPageId: `hp_${id}`, checkoutIntentId: `intent_${id}`, amount: 9900, currency: "INR", ...over });
const paid = (id: number, over: Partial<ReconciledHostedPage> = {}): ReconciledHostedPage => ({ hostedPageId: `hp_${id}`, invoiceId: `inv_${id}`, passThruContent: `intent_${id}`, amount: 9900, currency: "INR", paid: true, ...over });

function make(rows: PendingPayment[], pages: Record<string, ReconciledHostedPage | undefined | Error>, fulfillStatus = "credited") {
  const deps = {
    listPending: vi.fn(async () => rows),
    retrieveHostedPage: vi.fn(async (id: string) => { const page = pages[id]; if (page instanceof Error) throw page; return page; }),
    fulfill: vi.fn(async () => ({ status: fulfillStatus })),
    markReview: vi.fn(async () => undefined),
    touch: vi.fn(async () => undefined),
    alert: vi.fn(async () => ({ alerted: true })),
  };
  return { deps, run: createChargebeePendingReconcile(deps) };
}

describe("chargebee pending reconcile", () => {
  it("asks only for rows past the grace period, within the max age, not re-checked recently, in a bounded batch", async () => {
    const { deps, run } = make([], {});
    await run(ctx);
    expect(deps.listPending).toHaveBeenCalledWith(new Date(NOW - PENDING_GRACE_MS), new Date(NOW - PENDING_MAX_AGE_MS), new Date(NOW - PENDING_RECHECK_MS), PENDING_RECONCILE_BATCH);
    expect(PENDING_GRACE_MS).toBe(15 * 60_000);
  });

  it("credits a paid, matching checkout through the same event id the credit-recovery path uses", async () => {
    const { deps, run } = make([row(1)], { hp_1: paid(1) });
    expect(await run(ctx)).toEqual({ processed: 1, failed: 0 });
    expect(deps.fulfill).toHaveBeenCalledWith({ eventId: "hosted_page:hp_1", hostedPageId: "hp_1", invoiceId: "inv_1", passThruContent: "intent_1", amount: 9900, currency: "INR" });
    expect(deps.alert).not.toHaveBeenCalled();
  });

  it("treats an already credited checkout as done, not as a new credit or a failure", async () => {
    const { run, deps } = make([row(1)], { hp_1: paid(1) }, "duplicate");
    expect(await run(ctx)).toEqual({ processed: 0, failed: 0 });
    expect(deps.markReview).not.toHaveBeenCalled();
  });

  it("leaves unpaid (abandoned) checkouts alone, only recording the check", async () => {
    const { deps, run } = make([row(1)], { hp_1: paid(1, { paid: false }) });
    expect(await run(ctx)).toEqual({ processed: 0, failed: 0 });
    expect(deps.fulfill).not.toHaveBeenCalled();
    expect(deps.touch).toHaveBeenCalledWith(1, new Date(NOW));
    expect(deps.alert).not.toHaveBeenCalled();
  });

  it("never credits a paid page whose intent, amount or currency differs: parks it for review and alerts", async () => {
    for (const [over, reason] of [[{ passThruContent: "other" }, "provider_page_mismatch"], [{ amount: 11682 }, "provider_page_mismatch"], [{ currency: "USD" }, "provider_page_mismatch"], [{ passThruContent: undefined }, "provider_page_incomplete"]] as const) {
      const { deps, run } = make([row(1)], { hp_1: paid(1, over) });
      expect(await run(ctx)).toEqual({ processed: 0, failed: 0 });
      expect(deps.fulfill).not.toHaveBeenCalled();
      expect(deps.markReview).toHaveBeenCalledWith(1, reason);
      expect(deps.alert).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 1, reason, expectedAmount: 9900, expectedCurrency: "INR" }));
    }
  });

  it("parks and alerts when fulfillment itself refuses a paid, matching page", async () => {
    const { deps, run } = make([row(1)], { hp_1: paid(1) }, "ignored");
    await run(ctx);
    expect(deps.markReview).toHaveBeenCalledWith(1, "reconciliation_rejected");
    expect(deps.alert).toHaveBeenCalledWith(expect.objectContaining({ paymentId: 1, reason: "reconciliation_rejected" }));
  });

  it("keeps going past a failing row and reports the first cause", async () => {
    const boom = new Error("Chargebee timeout");
    const { run } = make([row(1), row(2), row(3)], { hp_1: boom, hp_2: paid(2), hp_3: new Error("second") });
    expect(await run(ctx)).toEqual({ processed: 1, failed: 2, firstError: boom });
  });

  it("fails the window when every pending checkout is unreadable (wrong key, site or outage)", async () => {
    const { run } = make([row(1), row(2), row(3)], {});
    const out = await run(ctx);
    expect(out.failed).toBe(1);
    expect(String(out.firstError)).toMatch(/could not be read for 3 pending checkouts/);
  });

  it("does not raise that alarm for one or two unreadable pages among healthy ones", async () => {
    const { run } = make([row(1), row(2), row(3)], { hp_2: paid(2, { paid: false }), hp_3: paid(3, { paid: false }) });
    expect((await run(ctx)).failed).toBe(0);
  });

  it("is registered as an hourly window, a whole multiple of the hourly cron", () => {
    const job = SCHEDULED_JOBS.find(entry => entry.name === "chargebee-pending-reconcile");
    expect(job?.windowMs).toBe(60 * 60_000);
  });
});
