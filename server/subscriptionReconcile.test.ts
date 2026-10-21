// GO-LIVE-1b ruling 3: the hourly job is the safety net under a missed
// webhook - a paid pass always activates within its window.
import { describe, expect, it, vi } from "vitest";
import { createSubscriptionPendingReconcile, SUBSCRIPTION_PENDING_GRACE_MS, SUBSCRIPTION_PENDING_MAX_AGE_MS, SUBSCRIPTION_RECONCILE_BATCH } from "./chargebeePendingReconcile";

const NOW = new Date("2026-10-21T01:00:00Z");
const intent = { id: 1, hostedPageId: "hp_1", checkoutIntentId: "ci_1", userId: 7, role: "job_seeker" as const, plan: "momentum", itemPriceId: "skipwait_momentum_30d-USD", currency: "USD" };
const paidPage = {
  hostedPageId: "hp_1", state: "succeeded", passThruContent: "ci_1", subscriptionId: "sub_1", customerId: "cust_1",
  subscription: { id: "sub_1", status: "active", currency: "USD" as const, itemPriceId: "skipwait_momentum_30d-USD", currentTermStart: new Date("2026-10-20T23:00:00Z"), currentTermEnd: new Date("2026-11-19T23:00:00Z"), resourceVersion: 3 },
};

function deps(overrides: Record<string, unknown> = {}) {
  const d = {
    listPendingIntents: vi.fn(async () => [intent]),
    retrieveCheckout: vi.fn(async () => paidPage),
    applySubscriptionEvent: vi.fn(async () => ({ status: "applied" })),
    cancelIntent: vi.fn(async () => undefined),
    markIntentReview: vi.fn(async () => undefined),
    alert: vi.fn(async () => undefined),
    ...overrides,
  };
  return d;
}
const run = (d: ReturnType<typeof deps>) => createSubscriptionPendingReconcile(d)({ nowMs: NOW.getTime() } as never);

describe("subscription pending reconcile (GO-LIVE-1b)", () => {
  it("activates a paid pass the webhook missed, through the shared activation input", async () => {
    const d = deps();
    const output = await run(d);
    expect(output).toMatchObject({ processed: 1, failed: 0 });
    const event = d.applySubscriptionEvent.mock.calls[0][0];
    expect(event).toMatchObject({ eventId: "hosted_page:hp_1", hostedPageId: "hp_1", passThruContent: "ci_1", subscriptionId: "sub_1", plan: "momentum", interval: "30d", status: "active" });
  });

  it("asks for pending intents bounded by >10 minutes, <3 days, <=25", async () => {
    const d = deps();
    await run(d);
    const [olderThan, newerThan, limit] = d.listPendingIntents.mock.calls[0];
    expect(olderThan).toEqual(new Date(NOW.getTime() - SUBSCRIPTION_PENDING_GRACE_MS));
    expect(newerThan).toEqual(new Date(NOW.getTime() - SUBSCRIPTION_PENDING_MAX_AGE_MS));
    expect(limit).toBe(SUBSCRIPTION_RECONCILE_BATCH);
    expect(SUBSCRIPTION_RECONCILE_BATCH).toBe(25);
  });

  it("marks an expired unpaid checkout cancelled, granting nothing", async () => {
    const d = deps({ retrieveCheckout: vi.fn(async () => ({ ...paidPage, state: "cancelled" })) });
    await run(d);
    expect(d.cancelIntent).toHaveBeenCalledExactlyOnceWith("hp_1", "checkout_expired");
    expect(d.applySubscriptionEvent).not.toHaveBeenCalled();
  });

  it("leaves a still-pending page alone", async () => {
    const d = deps({ retrieveCheckout: vi.fn(async () => ({ ...paidPage, state: "acknowledged" })) });
    await run(d);
    expect(d.applySubscriptionEvent).not.toHaveBeenCalled();
    expect(d.cancelIntent).not.toHaveBeenCalled();
  });

  it("alerts and grants nothing on a paid page that disagrees with the intent", async () => {
    const d = deps({ retrieveCheckout: vi.fn(async () => ({ ...paidPage, passThruContent: "ci_OTHER" })) });
    await run(d);
    expect(d.applySubscriptionEvent).not.toHaveBeenCalled();
    expect(d.alert).toHaveBeenCalledTimes(1);
  });

  it("parks a mismatched intent for review so the next run never re-alerts it", async () => {
    const d = deps({ retrieveCheckout: vi.fn(async () => ({ ...paidPage, passThruContent: "ci_OTHER" })) });
    await run(d);
    expect(d.markIntentReview).toHaveBeenCalledWith("hp_1", "review_mismatch");
  });

  it("parks a paid page whose subscription status keeps no access, granting nothing", async () => {
    const d = deps({ retrieveCheckout: vi.fn(async () => ({ ...paidPage, subscription: { ...paidPage.subscription, status: "cancelled" } })) });
    await run(d);
    expect(d.applySubscriptionEvent).not.toHaveBeenCalled();
    expect(d.markIntentReview).toHaveBeenCalledWith("hp_1", "review_status");
    expect(d.alert).toHaveBeenCalledTimes(1);
  });

  it("parks an apply refusal for review after a single alert", async () => {
    const d = deps({ applySubscriptionEvent: vi.fn(async () => ({ status: "ignored", reason: "subscription_conflict" })) });
    await run(d);
    expect(d.markIntentReview).toHaveBeenCalledWith("hp_1", "review_refused");
    expect(d.alert).toHaveBeenCalledTimes(1);
  });

  it("one intent's failure never stops the others", async () => {
    const d = deps({
      listPendingIntents: vi.fn(async () => [intent, { ...intent, id: 2, hostedPageId: "hp_2", checkoutIntentId: "ci_2" }]),
      retrieveCheckout: vi.fn(async (id: string) => { if (id === "hp_1") throw new Error("provider down"); return { ...paidPage, hostedPageId: "hp_2", passThruContent: "ci_2", subscriptionId: "sub_2", subscription: { ...paidPage.subscription, id: "sub_2" } }; }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    const output = await run(d);
    expect(output).toMatchObject({ processed: 2, failed: 1 });
    expect(d.applySubscriptionEvent).toHaveBeenCalledTimes(1);
  });
});
