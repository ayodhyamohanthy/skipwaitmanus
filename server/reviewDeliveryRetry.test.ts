import { eq, getTableColumns, type SQL } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, profiles, referralRequestPasses, referralRequests, referralReviewDeliveries, referrerReviewEmailLinks, userBlocks, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { claimReferralReviewDelivery, completeReferralReviewDelivery } from "./db";
import { createReviewDeliveryRetry, REVIEW_DELIVERY_ALERT_LEASE_MS, REVIEW_DELIVERY_RETRY_BATCH, ReviewDeliveryOriginMissingError } from "./reviewDeliveryRetry";
import type { TransactionalEmailResult } from "./emailDelivery";

/*
 * REL-review-email-retry (D-212): a referrer's review email that failed, never
 * left `pending`, or crashed mid-send is sent again by the hourly job, through
 * the real server/db.ts claim/complete lease and the real eligibility rules of
 * prepareReferrerReviewEmailNotifications, over the in-memory database. Each
 * case keeps a control row so a skip is never mistaken for a broken job.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const SEEKER = 7;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const OTHER_REQUEST_ID = 502;
const ORIGIN = "https://skipwait.me";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const store = createInMemoryDrizzle();
/*
 * The database server/db.ts sees: the in-memory store, plus one optional
 * hook that runs just before the next matching UPDATE of a delivery row
 * executes. It puts another runner's work between a function's read and its
 * write, the interleaving a real second container can produce, while every
 * read and write still goes through the real production functions.
 */
type DeliveryUpdate = { readonly [key: string]: unknown };
let updateHook: { when: (values: DeliveryUpdate) => boolean; run: () => Promise<void> } | undefined;
const hookedDb = new Proxy(store.db, {
  get(target, prop, receiver) {
    if (prop !== "update") return Reflect.get(target, prop, receiver);
    return (table: MySqlTable) => {
      const inner = target.update(table);
      return {
        set: (values: Parameters<typeof inner.set>[0]) => ({
          where: async (where?: SQL) => {
            const hook = updateHook;
            if (table === referralReviewDeliveries && hook?.when(values)) { updateHook = undefined; await hook.run(); }
            return inner.set(values).where(where);
          },
        }),
      };
    };
  },
});
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const employee = (id: number, userId: number): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("Tue 2026-09-01 5:30 AM IST (UTC+05:30)"), paused: false, notifyNewAsk: true });
const person = (id: number, email: string): Row => full(users, { id, name: `Person ${id}`, email, suspended: false });
const ask = (id: number, over: Row = {}): Row => full(referralRequests, { id, jobId: 11, jobSeekerId: SEEKER, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: false, createdAt: new Date(Date.now() - DAY_MS), updatedAt: new Date(Date.now() - DAY_MS), ...over });
const tokenOf = (requestId: number, referrerId: number) => `tok${requestId}x${referrerId}`.padEnd(48, "z");
const grant = (id: number, requestId: number, referrerId: number, over: Row = {}): Row => full(referrerReviewEmailLinks, { id, referralRequestId: requestId, referrerId, linkToken: tokenOf(requestId, referrerId), expiresAt: new Date(Date.now() + 6 * DAY_MS), consumedAt: null, grantVersion: 1, rotatedAt: null, createdAt: new Date(Date.now() - DAY_MS), ...over });
const delivery = (id: number, requestId: number, referrerId: number, over: Row = {}): Row => full(referralReviewDeliveries, { id, referralRequestId: requestId, referrerId, channel: "email", grantVersion: 1, status: "failed", attemptCount: 1, leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date(Date.now() - MINUTE_MS), providerMessageId: null, lastError: "delivery_failed", sentAt: null, createdAt: new Date(Date.now() - HOUR_MS), updatedAt: new Date(Date.now() - HOUR_MS), ...over });

function seed(options: { asks?: Row[]; grants?: Row[]; deliveries?: Row[] } = {}) {
  store.reset([
    [users, [person(SEEKER, "avery@example.com"), person(REFERRER, "riya@acme.com"), person(COLLEAGUE, "colin@acme.com")]],
    [profiles, [employee(31, REFERRER), employee(33, COLLEAGUE)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Role from shared job link", targetRoleUrl: "https://careers.acme.com/jobs/design" })]],
    [referralRequests, options.asks ?? [ask(REQUEST_ID)]],
    [referrerReviewEmailLinks, options.grants ?? [grant(51, REQUEST_ID, REFERRER), grant(52, REQUEST_ID, COLLEAGUE)]],
    [referralReviewDeliveries, options.deliveries ?? []],
    [referralRequestPasses, []],
    [userBlocks, []],
  ]);
}

type SendInput = { to: string; companyDomain: string; reviewUrl: string };
let sent: SendInput[];
let alerts: Array<{ subject: string; text: string }>;
let sendResult: () => Promise<TransactionalEmailResult>;
let alertResult: () => Promise<{ sent: boolean }>;
const job = (overrides: Parameters<typeof createReviewDeliveryRetry>[0] = {}) => createReviewDeliveryRetry({
  ...overrides,
  send: async input => { sent.push(input); return sendResult(); },
  alertOwner: async input => { alerts.push(input); return alertResult(); },
  origin: () => ORIGIN,
});
const run = (overrides: Parameters<typeof createReviewDeliveryRetry>[0] = {}) => job(overrides)({ nowMs: Date.now(), windowKey: "2026-10-30T16:00Z" });
/** A later window: the job's own clock is `laterMs` ahead (the claim and completion keep the real clock). */
const runLater = (laterMs: number) => job()({ nowMs: Date.now() + laterMs, windowKey: "2026-10-30T17:00Z" });
// The shared claim now uses the fixture-supported lt() predicate too.
const expiredLeaseClaim = claimReferralReviewDelivery;
const rowOf = (id: number) => store.rows(referralReviewDeliveries).find(row => row.id === id);
const linksSnapshot = () => JSON.stringify(store.rows(referrerReviewEmailLinks));
const reviewUrl = (requestId: number, referrerId: number) => `${ORIGIN}/email-review/${encodeURIComponent(tokenOf(requestId, referrerId))}`;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(hookedDb);
  mocks.capture.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  sent = []; alerts = [];
  updateHook = undefined;
  sendResult = async () => ({ sent: true, reason: "sent" });
  alertResult = async () => ({ sent: true });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("review-delivery-retry: the three due kinds are each sent once", () => {
  it.each([
    ["a failed send whose backoff has passed", { status: "failed", attemptCount: 1, nextAttemptAt: new Date(Date.now() - MINUTE_MS) }],
    ["an unknown send whose backoff has passed", { status: "unknown", attemptCount: 2, nextAttemptAt: new Date(Date.now() - MINUTE_MS) }],
    ["a pending row left more than 10 minutes ago", { status: "pending", attemptCount: 0, nextAttemptAt: null, lastError: null, createdAt: new Date(Date.now() - 11 * MINUTE_MS) }],
    ["a leased row whose lease expired", { status: "leased", attemptCount: 1, leaseOwner: "dead-runner", leaseExpiresAt: new Date(Date.now() - MINUTE_MS), nextAttemptAt: null }],
  ] as const)("%s is sent to its referrer with that referrer's existing link and marked sent", async (_label, over) => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, over), delivery(62, REQUEST_ID, COLLEAGUE, { status: "sent", attemptCount: 1, nextAttemptAt: null, sentAt: new Date(Date.now() - HOUR_MS) })] });
    const before = linksSnapshot();
    const output = await run(over.status === "leased" ? { claim: expiredLeaseClaim } : {});
    expect(sent).toEqual([{ to: "riya@acme.com", companyDomain: "acme.com", reviewUrl: reviewUrl(REQUEST_ID, REFERRER) }]);
    expect(rowOf(61)).toMatchObject({ status: "sent", attemptCount: over.attemptCount + 1, leaseOwner: null, nextAttemptAt: null });
    expect(rowOf(62)).toMatchObject({ status: "sent", attemptCount: 1 });
    expect(output).toMatchObject({ processed: 1, failed: 0 });
    expect(linksSnapshot()).toBe(before);
    expect(alerts).toEqual([]);
  });
});

describe("review-delivery-retry: rows that are not due are untouched", () => {
  it.each([
    ["a failed row still in its backoff", { status: "failed", nextAttemptAt: new Date(Date.now() + 10 * MINUTE_MS) }],
    ["a pending row still in its first dispatch", { status: "pending", attemptCount: 0, nextAttemptAt: null, createdAt: new Date(Date.now() - 5 * MINUTE_MS) }],
    ["a leased row whose lease is live", { status: "leased", leaseOwner: "live-runner", leaseExpiresAt: new Date(Date.now() + MINUTE_MS) }],
    ["a sent row", { status: "sent", nextAttemptAt: null, sentAt: new Date(Date.now() - HOUR_MS) }],
    ["a revoked row", { status: "revoked", nextAttemptAt: null }],
    ["a row at 5 attempts", { status: "failed", attemptCount: 5 }],
    ["a Slack row", { channel: "slack" }],
  ] as const)("%s", async (_label, over) => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, over), delivery(62, REQUEST_ID, COLLEAGUE)] });
    const before = { ...rowOf(61) };
    await run();
    expect(rowOf(61)).toEqual(before);
    // The control row on the same request is still retried.
    expect(sent.map(item => item.to)).toEqual(["colin@acme.com"]);
  });

  it.each([
    ["its review link was used", { consumedAt: new Date(Date.now() - HOUR_MS) }],
    ["its review link expired", { expiresAt: new Date(Date.now() - MINUTE_MS) }],
  ] as const)("a due row is skipped when %s", async (_label, over) => {
    seed({ grants: [grant(51, REQUEST_ID, REFERRER, over), grant(52, REQUEST_ID, COLLEAGUE)], deliveries: [delivery(61, REQUEST_ID, REFERRER), delivery(62, REQUEST_ID, COLLEAGUE)] });
    const before = { ...rowOf(61) };
    await run();
    expect(rowOf(61)).toEqual(before);
    expect(sent.map(item => item.to)).toEqual(["colin@acme.com"]);
  });
});

describe("review-delivery-retry: a request the referrer can no longer review is skipped", () => {
  it.each(["withdrawn", "closed", "declined", "approved"] as const)("a %s request sends nothing", async status => {
    seed({ asks: [ask(REQUEST_ID, { status }), ask(OTHER_REQUEST_ID)], grants: [grant(51, REQUEST_ID, REFERRER), grant(53, OTHER_REQUEST_ID, REFERRER)], deliveries: [delivery(61, REQUEST_ID, REFERRER), delivery(63, OTHER_REQUEST_ID, REFERRER)] });
    const before = { ...rowOf(61) };
    await run();
    expect(rowOf(61)).toEqual(before);
    expect(sent).toEqual([{ to: "riya@acme.com", companyDomain: "acme.com", reviewUrl: reviewUrl(OTHER_REQUEST_ID, REFERRER) }]);
  });

  it.each([
    ["the referrer blocked the seeker", REFERRER, SEEKER],
    ["the seeker blocked the referrer", SEEKER, REFERRER],
  ] as const)("a blocked pair sends nothing when %s, and the colleague is still retried", async (_label, blocker, blocked) => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER), delivery(62, REQUEST_ID, COLLEAGUE)] });
    await store.db.insert(userBlocks).values({ blockerUserId: blocker, blockedUserId: blocked, reason: null, createdAt: new Date() });
    const before = { ...rowOf(61) };
    await run();
    expect(rowOf(61)).toEqual(before);
    expect(sent.map(item => item.to)).toEqual(["colin@acme.com"]);
  });

  it("a referrer who passed on the request is not emailed again", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER), delivery(62, REQUEST_ID, COLLEAGUE)] });
    await store.db.insert(referralRequestPasses).values({ referralRequestId: REQUEST_ID, referrerId: REFERRER, reason: "timing", createdAt: new Date() });
    await run();
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 1 });
    expect(sent.map(item => item.to)).toEqual(["colin@acme.com"]);
  });
});

describe("review-delivery-retry: never twice, never another link, never a token", () => {
  it("two runs in the same window send once", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER)] });
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    sendResult = async () => { await gate; return { sent: true, reason: "sent" }; };
    const first = run();
    const second = run();
    await new Promise(resolve => setTimeout(resolve, 20));
    release();
    await Promise.all([first, second]);
    await run();
    expect(sent).toHaveLength(1);
    expect(rowOf(61)).toMatchObject({ status: "sent", attemptCount: 2 });
  });

  it("a retry for one referrer never changes another referrer's link or writes any token", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER), delivery(62, REQUEST_ID, COLLEAGUE, { status: "sent", nextAttemptAt: null })] });
    const before = linksSnapshot();
    await run();
    expect(linksSnapshot()).toBe(before);
    expect(store.rows(referrerReviewEmailLinks)).toHaveLength(2);
    expect(sent).toEqual([{ to: "riya@acme.com", companyDomain: "acme.com", reviewUrl: reviewUrl(REQUEST_ID, REFERRER) }]);
  });

  it("reads at most one batch, oldest first", async () => {
    const deliveries = Array.from({ length: REVIEW_DELIVERY_RETRY_BATCH + 5 }, (_, index) => delivery(1000 + index, 600 + index, REFERRER, { createdAt: new Date(Date.now() - (2 * HOUR_MS) + index * 1000) }));
    seed({ asks: deliveries.map(row => ask(Number(row.referralRequestId))), grants: deliveries.map((row, index) => grant(2000 + index, Number(row.referralRequestId), REFERRER)), deliveries });
    const output = await run();
    expect(sent).toHaveLength(REVIEW_DELIVERY_RETRY_BATCH);
    expect(output.processed).toBe(REVIEW_DELIVERY_RETRY_BATCH);
  });
});

describe("review-delivery-retry: failures are recorded and the fifth alerts the owner once", () => {
  it("records the provider's status with a refused send and backs off", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER)] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed", providerStatus: 422 });
    const output = await run();
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 2, lastError: "delivery_failed:422" });
    expect((rowOf(61)?.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(output).toMatchObject({ processed: 0, failed: 1 });
    expect(alerts).toEqual([]);
  });

  it("records a thrown send as unknown", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER)] });
    sendResult = async () => { throw new Error("socket hang up"); };
    await run();
    expect(rowOf(61)).toMatchObject({ status: "unknown", attemptCount: 2, lastError: "socket hang up" });
  });

  it("the fifth failure alerts once with the request id and channel, and the row is never retried again", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed", providerStatus: 503 });
    await run();
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 5, lastError: "delivery_failed:503" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain(`referral request ${REQUEST_ID}`);
    expect(alerts[0].text).toContain("channel: email");
    expect(alerts[0].text).not.toContain(tokenOf(REQUEST_ID, REFERRER));
    expect(alerts[0].text).not.toContain("riya@acme.com");
    // Even with its backoff over, a row at 5 attempts is not read, claimed, sent or alerted again.
    await store.db.update(referralReviewDeliveries).set({ nextAttemptAt: new Date(Date.now() - MINUTE_MS) }).where(eq(referralReviewDeliveries.id, 61));
    await run();
    expect(sent).toHaveLength(1);
    expect(alerts).toHaveLength(1);
  });

  it("an earlier failure does not alert", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 3 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed" });
    await run();
    expect(rowOf(61)).toMatchObject({ attemptCount: 4, lastError: "delivery_failed" });
    expect(alerts).toEqual([]);
  });
});

describe("review-delivery-retry: it never fails silently", () => {
  it("does nothing and succeeds when nothing is due", async () => {
    seed();
    expect(await createReviewDeliveryRetry({ origin: () => undefined, send: async () => { throw new Error("must not send"); } })({ nowMs: Date.now(), windowKey: "2026-10-30T16:00Z" })).toEqual({ processed: 0, failed: 0 });
  });

  it("fails the window when a row is due but no public origin is configured", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER)] });
    await expect(createReviewDeliveryRetry({ origin: () => undefined, send: async input => { sent.push(input); return { sent: true, reason: "sent" }; } })({ nowMs: Date.now(), windowKey: "2026-10-30T16:00Z" })).rejects.toBeInstanceOf(ReviewDeliveryOriginMissingError);
    expect(sent).toEqual([]);
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 1 });
  });
});

/*
 * Review finding 1 on PR #874 (P1): claimReferralReviewDelivery read a row,
 * then wrote its lease matching only the id and an eligible status. Another
 * runner could finish the fifth attempt in between, and the stale write still
 * leased the row and sent a sixth email. The claim's write now repeats what
 * its read decided: the same attempt count, under the cap, past any backoff,
 * and an eligible status or an expired lease.
 */
describe("review-delivery-retry: a claim never acts on a stale read", () => {
  const competingFifthAttempt = async () => {
    const competitor = await claimReferralReviewDelivery(REQUEST_ID, REFERRER, "email", "runner-b");
    expect(competitor).toMatchObject({ attemptCount: 4 });
    await completeReferralReviewDelivery(Number(competitor?.id), "runner-b", { status: "failed", error: "delivery_failed:503" });
  };

  it("another runner's fifth attempt between the claim's read and write: no claim and no sixth email", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    updateHook = { when: values => values.status === "leased", run: competingFifthAttempt };
    const output = await run();
    expect(updateHook).toBeUndefined();
    expect(sent).toEqual([]);
    expect(output.processed).toBe(0);
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 5, lastError: "delivery_failed:503" });
    expect((rowOf(61)?.nextAttemptAt as Date).getTime()).toBeGreaterThan(Date.now());
  });

  it.each([
    ["the attempt count moved on", { status: "failed", attemptCount: 3, nextAttemptAt: new Date(Date.now() + 10 * MINUTE_MS) }],
    ["the backoff moved into the future", { nextAttemptAt: new Date(Date.now() + 10 * MINUTE_MS) }],
    ["the row reached the cap", { attemptCount: 5 }],
    ["another runner holds a live lease", { status: "leased", leaseOwner: "runner-b", leaseExpiresAt: new Date(Date.now() + MINUTE_MS) }],
    ["the row was sent", { status: "sent", nextAttemptAt: null, sentAt: new Date() }],
  ] as const)("a row whose state changed after the claim's read is not claimed: %s", async (_label, change) => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 2 })] });
    updateHook = { when: values => values.status === "leased", run: async () => { await store.db.update(referralReviewDeliveries).set(change).where(eq(referralReviewDeliveries.id, 61)); } };
    const claim = await claimReferralReviewDelivery(REQUEST_ID, REFERRER, "email", "runner-a");
    expect(updateHook).toBeUndefined();
    expect(claim).toBeUndefined();
    expect(rowOf(61)).toMatchObject(change);
    expect(rowOf(61)?.leaseOwner).not.toBe("runner-a");
  });

  it("an expired lease another runner already reclaimed and failed is not claimed again from the stale read", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { status: "leased", attemptCount: 2, leaseOwner: "dead-runner", leaseExpiresAt: new Date(Date.now() - MINUTE_MS), nextAttemptAt: null })] });
    updateHook = { when: values => values.status === "leased", run: async () => { await store.db.update(referralReviewDeliveries).set({ status: "failed", attemptCount: 3, leaseOwner: null, leaseExpiresAt: null, nextAttemptAt: new Date(Date.now() + 2 * MINUTE_MS) }).where(eq(referralReviewDeliveries.id, 61)); } };
    expect(await claimReferralReviewDelivery(REQUEST_ID, REFERRER, "email", "runner-a")).toBeUndefined();
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 3, leaseOwner: null });
  });

  it("control: with no other runner the same claim takes the row once, and a second claim gets nothing", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 2 })] });
    expect(await claimReferralReviewDelivery(REQUEST_ID, REFERRER, "email", "runner-a")).toMatchObject({ attemptCount: 2, leaseOwner: "runner-a" });
    expect(await claimReferralReviewDelivery(REQUEST_ID, REFERRER, "email", "runner-b")).toBeUndefined();
    expect(rowOf(61)).toMatchObject({ status: "leased", attemptCount: 3, leaseOwner: "runner-a" });
  });
});

/*
 * Review finding 2 on PR #874 (P2): the fifth failure's owner alert was
 * fire-and-forget; a refused or thrown alert was never tried again, because
 * a row at 5 attempts is never read again. The alert is now owed on the row
 * itself, written by the same completion that records the fifth failure, and
 * stays owed until an alert is actually delivered.
 */
describe("review-delivery-retry: the give-up alert is durable", () => {
  it("a refused alert is sent again in the next window, and once delivered never again", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed", providerStatus: 503 });
    alertResult = async () => ({ sent: false });
    const first = await run();
    expect(alerts).toHaveLength(1);
    expect(first.failed).toBe(2);
    alertResult = async () => ({ sent: true });
    const second = await run();
    expect(alerts).toHaveLength(2);
    expect(second).toMatchObject({ processed: 0, failed: 0 });
    await run();
    await runLater(2 * HOUR_MS);
    expect(alerts).toHaveLength(2);
    expect(sent).toHaveLength(1);
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 5 });
  });

  it("a thrown alert is recorded as a failure and sent again later", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed" });
    alertResult = async () => { throw new Error("alert transport down"); };
    const first = await run();
    expect(first.failed).toBe(2);
    expect(String(first.firstError)).toContain("review email retry failed");
    alertResult = async () => ({ sent: true });
    await run();
    await run();
    expect(alerts).toHaveLength(2);
  });

  it("response loss: an alert that went out but was not recorded is sent again after its lease, never lost", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed" });
    updateHook = { when: values => values.ownerAlertStatus === "sent", run: async () => { throw new Error("connection lost"); } };
    const first = await run();
    expect(alerts).toHaveLength(1);
    expect(first.failed).toBe(2);
    // The lease is still live: the same window does not alert twice.
    await run();
    expect(alerts).toHaveLength(1);
    await runLater(REVIEW_DELIVERY_ALERT_LEASE_MS + MINUTE_MS);
    expect(alerts).toHaveLength(2);
    await runLater(2 * HOUR_MS);
    expect(alerts).toHaveLength(2);
  });

  it("a runner that died holding the alert lease: the alert goes out once its lease expires", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed" });
    let release: () => void = () => undefined;
    alertResult = () => new Promise(resolve => { release = () => resolve({ sent: true }); });
    const dying = run();
    await vi.waitFor(() => expect(alerts).toHaveLength(1));
    // While that runner holds the lease, no other run alerts.
    await run();
    expect(alerts).toHaveLength(1);
    alertResult = async () => ({ sent: true });
    await runLater(REVIEW_DELIVERY_ALERT_LEASE_MS + MINUTE_MS);
    expect(alerts).toHaveLength(2);
    // The first runner wakes up after losing its lease: its late answer records nothing and alerts nothing more.
    release();
    await dying;
    await runLater(2 * HOUR_MS);
    expect(alerts).toHaveLength(2);
  });

  it("two runners that both read the owed alert: only the one whose claim lands sends it", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed" });
    await run();
    expect(alerts).toHaveLength(1);
    // Owe it again (as a refused alert leaves it), then let a second runner finish between the first one's read and claim.
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    alerts = [];
    updateHook = { when: values => typeof values.ownerAlertLeaseOwner === "string" && values.ownerAlertLeaseOwner.startsWith("owner-alert:"), run: async () => { await run(); } };
    await run();
    expect(updateHook).toBeUndefined();
    expect(alerts).toHaveLength(1);
  });

  it("a fifth attempt that died mid-send (lease expired at the cap) alerts the owner once, as unknown", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { status: "leased", attemptCount: 5, leaseOwner: "dead-runner", leaseExpiresAt: new Date(Date.now() - MINUTE_MS), nextAttemptAt: null })] });
    await run();
    expect(sent).toEqual([]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain(`referral request ${REQUEST_ID}`);
    expect(alerts[0].text).toContain("outcome is unknown");
    expect(rowOf(61)).toMatchObject({ status: "unknown", attemptCount: 5 });
    await runLater(2 * HOUR_MS);
    expect(alerts).toHaveLength(1);
  });

  it("several give-ups in one window go out as one alert naming each request, without a token or an address", async () => {
    seed({ asks: [ask(REQUEST_ID), ask(OTHER_REQUEST_ID)], grants: [grant(51, REQUEST_ID, REFERRER), grant(53, OTHER_REQUEST_ID, REFERRER)], deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 }), delivery(63, OTHER_REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed" });
    await run();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toContain(`referral request ${REQUEST_ID}`);
    expect(alerts[0].text).toContain(`referral request ${OTHER_REQUEST_ID}`);
    expect(alerts[0].text).not.toContain("riya@acme.com");
    expect(alerts[0].text).not.toContain(tokenOf(OTHER_REQUEST_ID, REFERRER));
  });

  it("a row the job never gave up on (Slack, or capped before this job existed) is never alerted", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { channel: "slack", attemptCount: 4 }), delivery(62, REQUEST_ID, COLLEAGUE, { attemptCount: 5 })] });
    await run();
    expect(alerts).toEqual([]);
  });
});
