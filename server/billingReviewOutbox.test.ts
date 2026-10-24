import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { billingReviewOutbox, tokenBalances, tokenTransactions, paymentFulfillments, subscriptionEvents } from "../drizzle/schema";
import { createInMemoryDrizzle } from "./inMemoryDrizzle.testkit";
import { billingReviewKey, enqueueBillingReviewTx, runBillingReviewOutbox } from "./billingReviewOutbox";
const memory = createInMemoryDrizzle();
vi.mock("./db", () => ({ getDb: async () => memory.db }));
let clock: Date;
const now = () => clock;
const ok = () => new Response(JSON.stringify({ id: "email_fixture" }), { status: 200 });
async function enqueue(input = { giftId: "gift_fixture", reason: "gift_claimed" as const }) {
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, input));
}
beforeEach(() => {
  memory.reset([]); clock = new Date("2026-10-19T00:00:00Z"); vi.useFakeTimers(); vi.setSystemTime(clock);
  vi.stubEnv("BILLING_ENV", "test"); vi.stubEnv("CHARGEBEE_SITE", "fixture-test");
  vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "fixture@example.invalid"); vi.stubEnv("RESEND_API_KEY", "fixture"); vi.stubEnv("ZEPTOMAIL_API_KEY", "");
});
afterEach(() => {
  for (const table of [tokenBalances, tokenTransactions, paymentFulfillments, subscriptionEvents]) expect(memory.rows(table)).toEqual([]);
  vi.useRealTimers(); vi.unstubAllEnvs();
});
it("sends through ZeptoMail when it is the only configured provider, accepts its request_id, and sends once", async () => {
  vi.stubEnv("RESEND_API_KEY", ""); vi.stubEnv("ZEPTOMAIL_API_KEY", "zepto_fixture");
  await enqueue(); await enqueue();
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify({ data: [], request_id: "req_zepto_1" }), { status: 200 }));
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 1, failed: 0 });
  await runBillingReviewOutbox({ now, fetchImpl: transport });
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0];
  expect(url).toBe("https://api.zeptomail.com/v1.1/email");
  expect(init?.headers).toMatchObject({ Authorization: "Zoho-enczapikey zepto_fixture" });
  expect(JSON.parse(String(init?.body)).to[0].email_address.address).toBe("ayodhya@skipwait.me");
  const row = memory.rows(billingReviewOutbox)[0];
  expect(row.status).toBe("accepted"); expect(row.providerMessageId).toBe("req_zepto_1");
});
it("payment_failed: a unique provider event alerts once - first failure retries to acceptance, redelivery dedupes", async () => {
  const failed1 = { reason: "payment_failed" as const, eventId: "ev_fail_1", eventType: "payment_failed", subscriptionId: "sub_9", invoiceId: "inv_9", customerId: "cust_9", amount: 162400, currency: "INR" };
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, failed1));
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, failed1)); // webhook redelivery: same provider event
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, { ...failed1, eventId: "ev_fail_2", invoiceId: "inv_10" })); // distinct failure
  expect(memory.rows(billingReviewOutbox)).toHaveLength(2);
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("failure", { status: 503 })).mockImplementation(async () => ok());
  // First sweep: ev_fail_1's send fails (retryable), ev_fail_2's succeeds.
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 1, failed: 1 });
  clock = new Date(clock.getTime() + 3 * 60_000);
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 1, failed: 0 });
  expect(transport).toHaveBeenCalledTimes(3);
  const firstBody = JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(firstBody.subject).toBe("skipwait.me payment failed needs review · inv_9");
  expect(firstBody.text).toContain("No money settled and no credits moved");
  // Redelivery after acceptance: no new row, no resend (successful sends dedupe).
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, failed1));
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 0, failed: 0 });
  expect(transport).toHaveBeenCalledTimes(3);
  expect(memory.rows(billingReviewOutbox).every(row => row.status === "accepted")).toBe(true);
});

it("concurrent duplicate enqueues of one provider event persist one obligation", async () => {
  const input = { reason: "payment_failed" as const, eventId: "ev_race", eventType: "payment_failed", invoiceId: "inv_race" };
  await Promise.all([0, 1, 2, 3].map(() => memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, input))));
  expect(memory.rows(billingReviewOutbox)).toHaveLength(1);
});

it("upgrade_leftover_blocked: a durable recoverable alert with reconciliation instructions, not log-only", async () => {
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, { reason: "upgrade_leftover_blocked", eventId: "ev_upg_1", eventType: "subscription_created", subscriptionId: "sub_v2", itemPriceId: "skipwait_v2plan_fast_track-INR" }));
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => ok());
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 1, failed: 0 });
  const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
  expect(body.subject).toBe("skipwait.me upgrade parked pending decision · sub_v2");
  expect(body.text).toContain("RECOVERY");
  expect(body.text).toContain("Nothing was granted automatically");
  expect(memory.rows(billingReviewOutbox)[0].status).toBe("accepted");
});

it("uses the same opaque identity for claim and webhook, different subscription events remain distinct", () => {
  expect(billingReviewKey({ giftId: "g", reason: "gift_claimed" })).toBe(billingReviewKey({ giftId: "g", reason: "gift_claim_refused", eventId: "e" }));
  expect(billingReviewKey({ eventId: "a", reason: "plan_retired" })).not.toBe(billingReviewKey({ eventId: "b", reason: "plan_retired" }));
});
it("recovers failure without another claim or webhook, freezes transport and dedups accepted work", async () => {
  await enqueue(); await enqueue(); expect(memory.rows(billingReviewOutbox)).toHaveLength(1);
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("failure", { status: 503 })).mockImplementation(async () => ok());
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 0, failed: 1 });
  vi.stubEnv("ERROR_ALERT_FROM_EMAIL", "changed@example.invalid"); clock = new Date(clock.getTime() + 3 * 60_000);
  await runBillingReviewOutbox({ now, fetchImpl: transport }); await runBillingReviewOutbox({ now, fetchImpl: transport });
  expect(transport).toHaveBeenCalledTimes(2);
  expect(transport.mock.calls[0][1]?.body).toBe(transport.mock.calls[1][1]?.body);
  expect(transport.mock.calls[0][1]?.headers).toEqual(transport.mock.calls[1][1]?.headers);
  expect(memory.rows(billingReviewOutbox)[0].status).toBe("accepted");
});
it("configuration outage retains work without starting the provider ambiguity clock", async () => {
  await enqueue(); vi.stubEnv("RESEND_API_KEY", ""); const transport = vi.fn();
  await runBillingReviewOutbox({ now, fetchImpl: transport }); expect(transport).not.toHaveBeenCalled();
  expect(memory.rows(billingReviewOutbox)[0].firstAttemptAt).toBeNull();
  vi.stubEnv("RESEND_API_KEY", "fixture"); clock = new Date(clock.getTime() + 2 * 60 * 60_000);
  await runBillingReviewOutbox({ now, fetchImpl: async () => ok() }); expect(memory.rows(billingReviewOutbox)[0].status).toBe("accepted");
});
it.each(["timeout", "crash", "response-loss"])("keeps %s ambiguity explicit after provider idempotency expires", async () => {
  await enqueue(); const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error("private transport details"));
  await runBillingReviewOutbox({ now, fetchImpl: transport }); clock = new Date(clock.getTime() + 24 * 60 * 60_000);
  await runBillingReviewOutbox({ now, fetchImpl: transport }); expect(transport).toHaveBeenCalledTimes(1);
  expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ status: "unknown", lastError: "idempotency_window_expired" });
});
it.each(["concurrent_idempotent_requests", "invalid_idempotent_request"])("handles %s without rotating the key", async name => {
  await enqueue(); await runBillingReviewOutbox({ now, fetchImpl: async () => new Response(JSON.stringify({ name }), { status: 409 }) });
  expect(memory.rows(billingReviewOutbox)[0].status).toBe(name === "invalid_idempotent_request" ? "unknown" : "pending");
});
it("recovers an expired lease, skips a live one", async () => {
  await enqueue(); await memory.db.update(billingReviewOutbox).set({ leaseOwner: "dead", leaseUntil: new Date(clock.getTime() + 60_000) }).where(undefined);
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => ok()); await runBillingReviewOutbox({ now, fetchImpl: transport }); expect(transport).not.toHaveBeenCalled();
  clock = new Date(clock.getTime() + 120_000); await runBillingReviewOutbox({ now, fetchImpl: transport }); expect(transport).toHaveBeenCalledTimes(1);
});
it("continues configuration recovery beyond three attempts, rate limits honor Retry-After", async () => {
  await enqueue();
  for (let i = 0; i < 5; i++) {
    await runBillingReviewOutbox({ now, fetchImpl: async () => new Response("limited", { status: 429, headers: { "Retry-After": "7200" } }) });
    expect(memory.rows(billingReviewOutbox)[0].nextAttemptAt).toEqual(new Date(clock.getTime() + 7200_000));
    clock = new Date(clock.getTime() + 7200_000);
  }
  await runBillingReviewOutbox({ now, fetchImpl: async () => ok() });
  expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ status: "accepted", attempts: 6 });
});
it("stale lease owner cannot finish after a takeover", async () => {
  await enqueue();
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => {
    await memory.db.update(billingReviewOutbox).set({ leaseOwner: "new-owner", leaseUntil: new Date(clock.getTime() + 60_000) }).where(undefined);
    return ok();
  });
  expect(await runBillingReviewOutbox({ now, fetchImpl: transport })).toEqual({ processed: 0, failed: 0 });
  expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ status: "pending", leaseOwner: "new-owner", acceptedAt: null });
});
it("preserves unsupported gift classification and freezes conflicting evidence visibly", async () => {
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, { giftId: "gift_fixture", subscriptionId: "sub_fixture", itemPriceId: "unknown_price", reason: "unsupported_plan" }));
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => ok());
  await runBillingReviewOutbox({ now, fetchImpl: transport });
  const bytes = memory.rows(billingReviewOutbox)[0].envelope;
  expect(String(bytes)).toContain("do not cancel or refund until classified");
  await enqueue();
  expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ status: "unknown", lastError: "classification_conflict", envelope: bytes });
});
it.each([401, 429])("earlier ambiguous send remains ambiguous after definitive %s rejection", async status => {
  await enqueue(); const transport = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(new Response("rejected", { status }));
  await runBillingReviewOutbox({ now, fetchImpl: transport }); const first = memory.rows(billingReviewOutbox)[0].firstAttemptAt;
  clock = new Date(clock.getTime() + 180_000); await runBillingReviewOutbox({ now, fetchImpl: transport });
  expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ submissionState: "ambiguous", firstAttemptAt: first });
  clock = new Date(clock.getTime() + 24 * 60 * 60_000); await runBillingReviewOutbox({ now, fetchImpl: transport });
  expect(transport).toHaveBeenCalledTimes(2); expect(memory.rows(billingReviewOutbox)[0]).toMatchObject({ status: "unknown", leaseOwner: null, leaseUntil: null });
});
it("rejects unexpected properties and oversized evidence without persisting private data", async () => {
  await expect(memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, { giftId: "g", reason: "gift_claimed", privateEmail: "secret@example.invalid" } as never))).rejects.toThrow();
  await expect(memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, { giftId: "x".repeat(256), reason: "gift_claimed" }))).rejects.toThrow();
  expect(memory.rows(billingReviewOutbox)).toEqual([]);
});
it("enforces state, lease, digest and acceptance evidence invariants at the consumer boundary", async () => {
  const { reviewStateSchema } = await import("./billingReviewOutbox");
  const valid = { obligationKey: "a".repeat(64), status: "pending", submissionState: "never_submitted", attempts: 0, leaseOwner: null, leaseUntil: null, acceptedAt: null, providerMessageId: null, lastError: null };
  expect(reviewStateSchema.safeParse(valid).success).toBe(true);
  for (const patch of [{ obligationKey: "A".repeat(64) }, { attempts: -1 }, { status: "other" }, { submissionState: "other" }, { leaseOwner: "orphan" }, { status: "accepted" }, { status: "unknown" }]) expect(reviewStateSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
});
it("counts missing provider configuration as scheduler failure and emits only redacted context", async () => {
  await enqueue(); vi.stubEnv("RESEND_API_KEY", "");
  const alert = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect((await runBillingReviewOutbox({ now, fetchImpl: vi.fn() })).failed).toBe(1);
  expect(alert).toHaveBeenCalledWith("[BillingReview] configuration repair required", { obligationKey: expect.stringMatching(/^[0-9a-f]{64}$/), code: "configuration_missing" });
  alert.mockRestore();
});
it("purges both accepted transport fields exactly at seven days, repeated cleanup never resends and duplicates still dedupe", async () => {
  await enqueue(); const transport = vi.fn<typeof fetch>().mockImplementation(async () => ok());
  await runBillingReviewOutbox({ now, fetchImpl: transport });
  clock = new Date(clock.getTime() + 7 * 24 * 60 * 60_000 - 1);
  await runBillingReviewOutbox({ now, fetchImpl: transport });
  expect(memory.rows(billingReviewOutbox)[0].payload).not.toBeNull();
  clock = new Date(clock.getTime() + 1);
  await runBillingReviewOutbox({ now, fetchImpl: transport });
  await runBillingReviewOutbox({ now, fetchImpl: transport });
  await enqueue();
  const row = memory.rows(billingReviewOutbox)[0];
  expect(row).toMatchObject({ status: "accepted", payload: null, envelope: null, providerMessageId: "email_fixture" });
  expect(row.conflictDigest).toMatch(/^[0-9a-f]{64}$/);
  expect(transport).toHaveBeenCalledTimes(1);
  const alert = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await memory.db.transaction(tx => enqueueBillingReviewTx(tx as never, { giftId: "gift_fixture", reason: "unsupported_plan" }));
  expect(alert).toHaveBeenCalledWith("[BillingReview] operator reconciliation required", expect.objectContaining({ code: "accepted_classification_conflict" }));
  expect(memory.rows(billingReviewOutbox)[0].status).toBe("accepted");
  alert.mockRestore();
});
it("pending and unknown contents never expire; terminal rows with stale lease are not purged", async () => {
  await enqueue();
  const original = memory.rows(billingReviewOutbox)[0];
  memory.reset([[billingReviewOutbox, [
    { ...original, id: 1, status: "pending", nextAttemptAt: new Date("2040-01-01") },
    { ...original, id: 2, obligationKey: "a".repeat(64), status: "unknown", lastError: "operator_review" },
    { ...original, id: 3, obligationKey: "b".repeat(64), status: "accepted", acceptedAt: clock, providerMessageId: "stale_receipt", leaseOwner: "stale", leaseUntil: clock },
  ]]]);
  clock = new Date(clock.getTime() + 30 * 24 * 60 * 60_000);
  await runBillingReviewOutbox({ now, fetchImpl: vi.fn() });
  expect(memory.rows(billingReviewOutbox).every(row => row.payload !== null)).toBe(true);
});
it("configuration outage fails even during per-row backoff, and repair resumes", async () => {
  await enqueue(); vi.stubEnv("RESEND_API_KEY", "");
  expect((await runBillingReviewOutbox({ now, fetchImpl: vi.fn() })).failed).toBeGreaterThan(0);
  expect((await runBillingReviewOutbox({ now, fetchImpl: vi.fn() })).failed).toBeGreaterThan(0);
  vi.stubEnv("RESEND_API_KEY", "restored"); clock = new Date(clock.getTime() + 60 * 60_000);
  expect(await runBillingReviewOutbox({ now, fetchImpl: async () => ok() })).toEqual({ processed: 1, failed: 0 });
});
it("actual scheduler records outage as failed then succeeds after configuration repair", async () => {
  const { runScheduledJob } = await import("./scheduledJobRunner");
  await enqueue(); vi.stubEnv("RESEND_API_KEY", "");
  const complete = vi.fn(async () => true);
  const store = { insertRunning: async () => "inserted" as const, find: async () => undefined, takeOver: async () => false, complete, latest: async () => undefined };
  const job = { name: "billing-review-retry" as const, description: "fixture", windowMs: 3600000, leaseMs: 60000, run: () => runBillingReviewOutbox({ now, fetchImpl: async () => ok() }) };
  expect((await runScheduledJob(job, { store, now: () => clock.getTime() })).outcome).toBe("failed");
  vi.stubEnv("RESEND_API_KEY", "repaired"); clock = new Date(clock.getTime() + 3600000);
  expect((await runScheduledJob(job, { store, now: () => clock.getTime() })).outcome).toBe("ran");
});
