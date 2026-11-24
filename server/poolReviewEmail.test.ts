import { eq, getTableColumns, isNull } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askCosts, canonicalPeople, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralReviewDeliveries, referralTransitionEvents, referrerReviewEmailLinks, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { deliverWaitingAsksToReferrer, prepareReferrerReviewEmailNotifications } from "./db";
import { createPoolReviewEmail, PoolReviewEmailOriginMissingError } from "./poolReviewEmail";

/*
 * D-174-pool-nudges part 2 (D-193 §5.9, D-384): a request delivered from the
 * waiting pool gets the referrer's review grant in the delivery transaction, and
 * the hourly pool-review-email job sends the review email through the existing
 * claim, at most one per referrer per UTC day (D-060). Real server/db.ts calls
 * over the in-memory database; only the email provider and the clock are fakes.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), enabled: true }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("../shared/poolNudges", () => ({ get POOL_NUDGES_ENABLED() { return mocks.enabled; } }));

const NOW = new Date("2026-11-24T09:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const REFERRER = 2;
const OFF_DOMAIN_REFERRER = 3;
const SEEKERS = [7, 8, 9] as const;
const ORIGIN = "https://skipwait.me";

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const person = (id: number, email: string): Row => full(users, { id, openId: `person-${id}`, name: `Person ${id}`, email, suspended: false });
const employee = (id: number, userId: number): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, referralCapacity: 3 });
const wallet = (id: number, userId: number): Row => full(tokenBalances, { id, userId, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(NOW), plan: "free" });
const waiting = (id: number, jobSeekerId: number, ageMs: number): Row => full(referralRequests, { id, jobId: 11, jobSeekerId, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: true, coverageQueuedAt: new Date(NOW.getTime() - ageMs), coverageVisibleAt: null, coverageHeldAt: null, debitTransactionId: null, createdAt: new Date(NOW.getTime() - ageMs), updatedAt: new Date(NOW.getTime() - ageMs) });

function seed(options: { asks?: readonly Row[]; referrerEmail?: string } = {}) {
  store.reset([
    [canonicalPeople, []],
    [users, [person(REFERRER, options.referrerEmail ?? "riya@acme.com"), person(OFF_DOMAIN_REFERRER, "olu@gmail.com"), ...SEEKERS.map(id => person(id, `seeker${id}@example.com`))]],
    [profiles, [employee(31, REFERRER)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/designer" })]],
    [referralRequests, options.asks ?? [waiting(501, SEEKERS[0], DAY)]],
    [tokenBalances, SEEKERS.map((id, index) => wallet(81 + index, id))],
    ...[askCosts, tokenTransactions, planCreditGrants, promoCreditGrants, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralTransitionEvents, notifications, operationalActivityLogs, userBlocks, referrerReviewEmailLinks, referralReviewDeliveries].map(table => [table, []] as const),
  ]);
}

const grants = () => store.rows(referrerReviewEmailLinks);
const deliveries = () => store.rows(referralReviewDeliveries);
/** MySQL fills attemptCount (DEFAULT 0) and createdAt (DEFAULT CURRENT_TIMESTAMP) on insert; the in-memory store does not. */
const applyColumnDefaults = async () => {
  await store.db.update(referralReviewDeliveries).set({ attemptCount: 0 }).where(isNull(referralReviewDeliveries.attemptCount));
  await store.db.update(referralReviewDeliveries).set({ createdAt: new Date() }).where(isNull(referralReviewDeliveries.createdAt));
};

/** The real job over the real prepare/claim/complete; only the provider, the origin and the lease ids are fakes. */
function job(send = vi.fn(async () => ({ sent: true, reason: "sent" as const })), origin: () => string | undefined = () => ORIGIN) {
  let lease = 0;
  const prepare = async (requestId: number) => { const links = await prepareReferrerReviewEmailNotifications(requestId); await applyColumnDefaults(); return links; };
  return { send, run: createPoolReviewEmail({ send, origin, prepare, newLeaseOwner: () => `lease-${++lease}` }) };
}
async function runAt(at: Date, runner: ReturnType<typeof job>) {
  vi.setSystemTime(at);
  return runner.run({ nowMs: at.getTime(), windowKey: "2026-11-24T09:00Z" });
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.enabled = true;
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-384 (2): a pool delivery writes the referrer's review grant", () => {
  it("writes one 7-day grant for the delivered referrer and no delivery row", async () => {
    seed();
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });
    expect(grants()).toEqual([expect.objectContaining({ referralRequestId: 501, referrerId: REFERRER, grantVersion: 1, consumedAt: null, expiresAt: new Date(NOW.getTime() + 7 * DAY) })]);
    expect(String(grants()[0].linkToken)).toMatch(/^[0-9a-f]{48}$/);
    // D-384 (3): no pending row at delivery, or review-delivery-retry would send it past the D-060 cap.
    expect(deliveries()).toEqual([]);
  });

  it("writes no grant while the switch is off", async () => {
    mocks.enabled = false;
    seed();
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });
    expect(grants()).toEqual([]);
  });

  it("writes no grant when the referrer's email is not at the company's domain", async () => {
    seed({ referrerEmail: "riya@gmail.com" });
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 1, held: 0, skipped: 0 });
    expect(grants()).toEqual([]);
  });
});

describe("D-384 (3): the hourly pool-review-email job", () => {
  it("sends one review email per pool delivery through the existing claim, and nothing on a rerun", async () => {
    seed();
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    const runner = job();
    expect(await runAt(new Date(NOW.getTime() + HOUR), runner)).toEqual({ processed: 1, failed: 0 });
    expect(runner.send).toHaveBeenCalledTimes(1);
    expect(runner.send).toHaveBeenCalledWith({ to: "riya@acme.com", companyDomain: "acme.com", reviewUrl: `${ORIGIN}/email-review/${grants()[0].linkToken}` });
    expect(deliveries()).toEqual([expect.objectContaining({ referralRequestId: 501, referrerId: REFERRER, channel: "email", status: "sent", attemptCount: 1 })]);

    expect(await runAt(new Date(NOW.getTime() + 2 * HOUR), runner)).toEqual({ processed: 0, failed: 0 });
    expect(runner.send).toHaveBeenCalledTimes(1);
  });

  it("D-060: three pool deliveries in one day send one email that day, oldest first, and the next one the following day", async () => {
    seed({ asks: [waiting(501, SEEKERS[0], 3 * DAY), waiting(502, SEEKERS[1], 2 * DAY), waiting(503, SEEKERS[2], DAY)] });
    expect(await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime())).toEqual({ delivered: 3, held: 0, skipped: 0 });
    // Deliveries carry the same instant here; make the oldest unambiguous, as consecutive hand-offs would.
    for (const [id, offset] of [[501, 0], [502, 1], [503, 2]] as const) await store.db.update(referralRequests).set({ coverageVisibleAt: new Date(NOW.getTime() + offset * 60_000) }).where(eq(referralRequests.id, id));
    const runner = job();

    expect(await runAt(new Date(NOW.getTime() + HOUR), runner)).toEqual({ processed: 1, failed: 0 });
    expect(await runAt(new Date(NOW.getTime() + 2 * HOUR), runner)).toEqual({ processed: 0, failed: 0 });
    expect(deliveries().map(row => row.referralRequestId)).toEqual([501]);

    const tomorrow = new Date("2026-11-25T00:30:00.000Z");
    expect(await runAt(tomorrow, runner)).toEqual({ processed: 1, failed: 0 });
    expect(deliveries().map(row => row.referralRequestId)).toEqual([501, 502]);
    expect(runner.send).toHaveBeenCalledTimes(2);
  });

  it("never emails a referrer blocked with the seeker", async () => {
    seed();
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    await store.db.insert(userBlocks).values(full(userBlocks, { id: 91, blockerUserId: SEEKERS[0], blockedUserId: REFERRER }));
    const runner = job();
    expect(await runAt(new Date(NOW.getTime() + HOUR), runner)).toEqual({ processed: 0, failed: 0 });
    expect(runner.send).not.toHaveBeenCalled();
    expect(deliveries()).toEqual([]);
  });

  it("skips a pool delivery older than 72 hours", async () => {
    seed();
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    const runner = job();
    expect(await runAt(new Date(NOW.getTime() + 73 * HOUR), runner)).toEqual({ processed: 0, failed: 0 });
    expect(runner.send).not.toHaveBeenCalled();
  });

  it("fails loudly and sends nothing when no public origin is configured", async () => {
    seed();
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    const runner = job(undefined, () => undefined);
    await expect(runAt(new Date(NOW.getTime() + HOUR), runner)).rejects.toBeInstanceOf(PoolReviewEmailOriginMissingError);
    expect(runner.send).not.toHaveBeenCalled();
    expect(deliveries()).toEqual([]);
  });

  it("records a failed send for review-delivery-retry instead of retrying it here", async () => {
    seed();
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    const runner = job(vi.fn(async () => ({ sent: false, reason: "delivery_failed" as const, providerStatus: 503 })));
    const output = await runAt(new Date(NOW.getTime() + HOUR), runner);
    expect(output).toMatchObject({ processed: 0, failed: 1 });
    expect(deliveries()).toEqual([expect.objectContaining({ status: "failed", attemptCount: 1, lastError: "delivery_failed:503" })]);
  });

  it("does nothing while the switch is off", async () => {
    seed();
    await deliverWaitingAsksToReferrer(REFERRER, "acme.com", NOW.getTime());
    mocks.enabled = false;
    const runner = job();
    expect(await runAt(new Date(NOW.getTime() + HOUR), runner)).toEqual({ processed: 0, failed: 0 });
    expect(runner.send).not.toHaveBeenCalled();
    expect(deliveries()).toEqual([]);
  });
});
