import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { directMessageNotificationOutbox, directMessageQuotaWindows, messages, notifications, profiles, tokenBalances, userFollows, users } from "../drizzle/schema";
import { DirectMessageFollowRequiredError, sendDirectMessage } from "./db";
import { DirectMessageReferrerGateError } from "./dmReferrerGate";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";

/*
 * D-067: the member-message "premium" perk is removed. sendDirectMessage runs
 * against the in-memory drizzle client: between two members who are not
 * verified referrers, only an existing thread or a mutual follow opens a send,
 * whatever plan the sender's wallet still carries (a stored Pro or Max, or a
 * kit pass). The D-012(3) referrer gate is unchanged and wins over both.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SENDER = 11, MEMBER = 22, REFERRER = 33;
const FUTURE = new Date(Date.now() + 20 * 86_400_000);
const store = createInMemoryDrizzle();

/** A seeker wallet that the removed check counted as "premium": active, term in the future. */
const paidWallet = (plan: string): Row => ({ id: 81, userId: SENDER, role: "job_seeker", plan, subscriptionStatus: "active", subscriptionCurrentTermEnd: FUTURE, balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3, monthlyCycleKey: "2026-10" });
const follow = (id: number, followerUserId: number, followingUserId: number): Row => ({ id, followerUserId, followingUserId, createdAt: new Date("2026-10-01T00:00:00Z") });

function seed(options: { wallet?: Row; follows?: Row[]; thread?: boolean } = {}) {
  store.reset([
    [users, [{ id: SENDER, suspended: false }, { id: MEMBER, suspended: false }, { id: REFERRER, suspended: false }]],
    [profiles, [{ id: 41, userId: REFERRER, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z") }]],
    [tokenBalances, options.wallet ? [options.wallet] : []],
    [userFollows, options.follows ?? []],
    [messages, options.thread ? [{ id: 5, senderId: MEMBER, recipientId: SENDER, body: "Hello", referralRequestId: null, idempotencyKey: "seeded-thread-key-0001", requestFingerprint: "seeded", createdAt: new Date("2026-10-01T00:00:00Z") }] : []],
    [notifications, []],
    [directMessageQuotaWindows, []],
    [directMessageNotificationOutbox, []],
  ]);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); });

/** Nothing was written: no message, notification, outbox row or quota use. */
function expectNothingSent(threadRows = 0) {
  expect(store.rows(messages)).toHaveLength(threadRows);
  expect(store.rows(notifications)).toEqual([]);
  expect(store.rows(directMessageNotificationOutbox)).toEqual([]);
  expect(store.rows(directMessageQuotaWindows)).toEqual([]);
}

describe("sendDirectMessage member rule (D-067: no plan opens a member thread)", () => {
  it.each(["pro", "max", "momentum", "keep_warm"])("refuses a new thread from a sender whose wallet carries an active %s plan, with no mutual follow", async plan => {
    seed({ wallet: paidWallet(plan), follows: [follow(1, SENDER, MEMBER)] });
    await expect(sendDirectMessage(SENDER, MEMBER, "Hi", "member-rule-key-0001")).rejects.toBeInstanceOf(DirectMessageFollowRequiredError);
    expectNothingSent();
  });

  it("refuses a Free sender with no thread and no follow", async () => {
    seed();
    await expect(sendDirectMessage(SENDER, MEMBER, "Hi", "member-rule-key-0002")).rejects.toBeInstanceOf(DirectMessageFollowRequiredError);
    expectNothingSent();
  });

  it("sends once both members follow each other, with its notification and outbox row", async () => {
    seed({ follows: [follow(1, SENDER, MEMBER), follow(2, MEMBER, SENDER)] });
    await expect(sendDirectMessage(SENDER, MEMBER, "Hi", "member-rule-key-0003")).resolves.toMatchObject({ replayed: false });
    expect(store.rows(messages)).toEqual([expect.objectContaining({ senderId: SENDER, recipientId: MEMBER, body: "Hi" })]);
    expect(store.rows(notifications)).toHaveLength(1);
    expect(store.rows(directMessageNotificationOutbox)).toEqual([expect.objectContaining({ recipientId: MEMBER, status: "pending" })]);
  });

  it("lets a member reply inside an existing thread with no follow", async () => {
    seed({ thread: true });
    await expect(sendDirectMessage(SENDER, MEMBER, "Thanks", "member-rule-key-0004")).resolves.toMatchObject({ replayed: false });
    expect(store.rows(messages)).toHaveLength(2);
  });

  it("keeps the D-012(3) referrer gate ahead of a follow, a thread or a plan", async () => {
    seed({ wallet: paidWallet("pro"), follows: [follow(1, SENDER, REFERRER), follow(2, REFERRER, SENDER)] });
    await expect(sendDirectMessage(SENDER, REFERRER, "Hi", "member-rule-key-0005")).rejects.toBeInstanceOf(DirectMessageReferrerGateError);
    expectNothingSent();
  });
});
