/*
 * Scratch, uncommitted replay for the three open REL-review-email-retry
 * findings at 15897e05. Not part of the PR. Each test passes when the defect
 * is present, i.e. a green run here is a reproduced negative.
 */
import { eq, getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, profiles, referralRequestPasses, referralRequests, referralReviewDeliveries, referrerReviewEmailLinks, userBlocks, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { createReviewDeliveryRetry, listDueReviewEmailDeliveries } from "./reviewDeliveryRetry";
import type { TransactionalEmailResult } from "./emailDelivery";
import { claimReferralReviewDelivery } from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const SEEKER = 7;
const REFERRER = 2;
const COLLEAGUE = 4;
const REQUEST_ID = 501;
const ORIGIN = "https://skipwait.me";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const store = createInMemoryDrizzle();
const rawDb = store.db;

// Pauses the next db.update between its SELECT and its UPDATE, so a stale
// claimer can be interleaved with a completed attempt-5 run.
let holdNextUpdate = false;
let updateReached: (() => void) | undefined;
let updateGate: Promise<void> = Promise.resolve();
const wrappedDb = {
  ...rawDb,
  update(table: MySqlTable) {
    const real = rawDb.update(table);
    if (!holdNextUpdate) return real;
    holdNextUpdate = false;
    return {
      set(values: Parameters<typeof real.set>[0]) {
        const realSet = real.set(values);
        return {
          where: async (where: Parameters<typeof realSet.where>[0]) => {
            updateReached?.();
            await updateGate;
            return realSet.where(where);
          },
        };
      },
    };
  },
};

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
let alertCalls: Array<{ subject: string; text: string }>;
let sendResult: () => Promise<TransactionalEmailResult>;
let alertResult: () => { sent: boolean };
const job = (overrides: Parameters<typeof createReviewDeliveryRetry>[0] = {}) => createReviewDeliveryRetry({
  ...overrides,
  send: async input => { sent.push(input); return sendResult(); },
  alertOwner: async input => { alertCalls.push(input); return alertResult(); },
  origin: () => ORIGIN,
});
const run = (overrides: Parameters<typeof createReviewDeliveryRetry>[0] = {}) => job(overrides)({ nowMs: Date.now(), windowKey: "2026-10-31T00:00Z" });
const rowOf = (id: number) => store.rows(referralReviewDeliveries).find(row => row.id === id);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(wrappedDb);
  mocks.capture.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  sent = [];
  alertCalls = [];
  sendResult = async () => ({ sent: true, reason: "sent" });
  alertResult = () => ({ sent: true });
  holdNextUpdate = false;
  updateReached = undefined;
  updateGate = Promise.resolve();
});

describe("scratch replay of the open REL-review-email-retry findings at 15897e05", () => {
  it("negative 1: alertOwner returning {sent:false} is discarded and never retried", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed", providerStatus: 503 });
    alertResult = () => ({ sent: false });

    const first = await run();
    console.log(`[negative-1] first run: alertCalls=${alertCalls.length} (alertOwner returned {sent:false}) row=${JSON.stringify({ status: rowOf(61)?.status, attemptCount: rowOf(61)?.attemptCount })} output=${JSON.stringify({ processed: first.processed, failed: first.failed, error: String(first.firstError) })}`);
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 5 });
    expect(sent).toHaveLength(1);
    expect(alertCalls).toHaveLength(1);
    // The only reported failure is the referrer send; the false alert result is nowhere.
    expect(first).toMatchObject({ processed: 0, failed: 1 });
    expect(String(first.firstError)).toContain("review email retry");

    // Re-arm the backoff so only the attempt cap can explain a skip.
    await store.db.update(referralReviewDeliveries).set({ nextAttemptAt: new Date(Date.now() - MINUTE_MS) }).where(eq(referralReviewDeliveries.id, 61));
    const second = await run();
    console.log(`[negative-1] second due pass: alertCalls=${alertCalls.length} sends=${sent.length} output=${JSON.stringify(second)} (no owner-alert retry)`);
    expect(second).toEqual({ processed: 0, failed: 0 });
    expect(alertCalls).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("negative 2: the due scan excludes attemptCount 5 and the row is never claimed", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 }), delivery(62, REQUEST_ID, COLLEAGUE, { attemptCount: 5 })] });

    const due = await listDueReviewEmailDeliveries(new Date(), 50);
    expect(due.map(row => row.id)).toEqual([61]);

    const output = await run();
    const direct = await claimReferralReviewDelivery(REQUEST_ID, COLLEAGUE, "email", "probe-lease");
    console.log(`[negative-2] due ids=${JSON.stringify(due.map(row => row.id))} (row 62 at attempt 5 excluded) sends=${JSON.stringify(sent.map(item => item.to))} row62=${JSON.stringify({ status: rowOf(62)?.status, attemptCount: rowOf(62)?.attemptCount })} directClaim=${String(direct)}`);
    expect(output).toMatchObject({ processed: 1, failed: 0 });
    expect(sent.map(item => item.to)).toEqual(["riya@acme.com"]);
    expect(rowOf(62)).toMatchObject({ status: "failed", attemptCount: 5 });
    expect(direct).toBeUndefined();
  });

  it("negative 3: a paused claimer rewrites attemptCount 5 after a completed attempt 5 and sends a sixth email", async () => {
    seed({ deliveries: [delivery(61, REQUEST_ID, REFERRER, { attemptCount: 4 })] });
    sendResult = async () => ({ sent: false, reason: "delivery_failed", providerStatus: 503 });
    alertResult = () => ({ sent: true });

    let release: () => void = () => undefined;
    updateGate = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { updateReached = resolve; });
    holdNextUpdate = true;

    // Runner B: listDue -> prepare -> claim SELECT reads attempt 4 -> UPDATE paused.
    const bRun = run();
    await reached;

    // Runner A: claims 4 -> 5, sends, fails, completes at 5, alerts.
    const aOutput = await run();
    console.log(`[negative-3] after A, B paused: sends=${sent.length} alertCalls=${alertCalls.length} durable=${JSON.stringify({ status: rowOf(61)?.status, attemptCount: rowOf(61)?.attemptCount })} A=${JSON.stringify({ processed: aOutput.processed, failed: aOutput.failed })}`);
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 5 });
    expect(sent).toHaveLength(1);
    expect(alertCalls).toHaveLength(1);
    expect(aOutput).toMatchObject({ processed: 0, failed: 1 });

    // B resumes: its UPDATE has no attemptCount/cap predicate, matches the
    // completed attempt-5 row and writes its stale 4 + 1.
    release();
    const bOutput = await bRun;
    console.log(`[negative-3] after B resumed: sends=${sent.length} alertCalls=${alertCalls.length} durable=${JSON.stringify({ status: rowOf(61)?.status, attemptCount: rowOf(61)?.attemptCount })} B=${JSON.stringify({ processed: bOutput.processed, failed: bOutput.failed })} (stale rewrite kept the counter at 5 while a sixth email went out)`);
    expect(bOutput).toMatchObject({ processed: 0, failed: 1 });
    expect(sent).toHaveLength(2);
    expect(alertCalls).toHaveLength(2);
    expect(rowOf(61)).toMatchObject({ status: "failed", attemptCount: 5 });
  });
});
