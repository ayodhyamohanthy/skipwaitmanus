import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { canonicalPeople, giftSubscriptionFulfillments, tokenBalances, users, verifiedLoginAliases } from "../drizzle/schema";
import {
  claimGiftSubscription,
  fulfillGiftSubscription,
  listBuyerGifts,
  listClaimableGiftsForUser,
  recordGiftProviderEvent,
  resolveGiftRecipient,
} from "./db";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const dialect = new MySqlDialect();
const NOW = new Date("2026-10-01T00:00:00.000Z");

let gifts: Array<Record<string, unknown>>;
let wallets: Array<Record<string, unknown>>;
let people: Array<Record<string, unknown>>;
let aliasRows: Array<Record<string, unknown>>;
let accountRows: Array<Record<string, unknown>>;

function tableFor(table: unknown): Array<Record<string, unknown>> {
  if (table === giftSubscriptionFulfillments) return gifts;
  if (table === tokenBalances) return wallets;
  if (table === canonicalPeople) return people;
  if (table === verifiedLoginAliases) return aliasRows;
  if (table === users) return accountRows;
  throw new Error("Unexpected table");
}

function matches(condition: SQL, row: Record<string, unknown>): boolean {
  const query = dialect.sqlToQuery(condition);
  const equals = [...query.sql.matchAll(/`[^`]+`\.`([^`]+)` = \?/g)].map(m => m[1]);
  const inMatch = query.sql.match(/`[^`]+`\.`([^`]+)` in \((?:\?,? ?)+\)/i);
  if (!inMatch && equals.length !== query.params.length) return false;
  if (!equals.every((column, index) => row[column] === query.params[index])) return false;
  if (inMatch && !(query.params.slice(equals.length) as unknown[]).includes(row[inMatch[1]])) return false;
  return true;
}

function fixtureDatabase() {
  const select = () => ({
    from: (table: unknown) => ({
      where: (condition: SQL) => ({
        limit: (n: number) => {
          const run = () => structuredClone(tableFor(table).filter(row => matches(condition, row)).slice(0, n));
          return { then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve), for: async (_mode: string) => run() };
        },
      }),
    }),
  });
  const update = (table: unknown) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async (condition: SQL) => {
        const selected = tableFor(table).filter(row => matches(condition, row));
        selected.forEach(row => Object.assign(row, structuredClone(patch)));
        return [{ affectedRows: selected.length }];
      },
    }),
  });
  const insert = (table: unknown) => ({
    values: async (row: Record<string, unknown>) => {
      const rows = tableFor(table);
      if (table === giftSubscriptionFulfillments && rows.some(r => r.giftId === row.giftId)) throw Object.assign(new Error("Duplicate entry"), { code: "ER_DUP_ENTRY" });
      const id = rows.length + 1;
      rows.push({ id, ...structuredClone(row) });
      return [{ affectedRows: 1, insertId: id }];
    },
  });
  const api = { select, update, insert };
  return { ...api, transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(api) };
}

const person = (id: number, email: string, suspended = false) => ({ id, normalizedVerifiedEmail: email, suspended, reviewReason: null });
const alias = (id: number, personId: number, userId: number, email: string) => ({ id, provider: "work_email_otp", subject: email, openId: `otp-${id}`, canonicalPersonId: personId, canonicalUserId: userId, normalizedVerifiedEmail: email, verifiedAt: NOW });
const account = (id: number, personId: number, suspended = false) => ({ id, openId: `oid-${id}`, canonicalPersonId: personId, name: "Recipient", email: "james@user.com", role: "user", suspended });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  gifts = []; wallets = [];
  people = [person(1, "james@user.com")];
  aliasRows = [alias(1, 1, 7, "james@user.com")];
  accountRows = [account(7, 1)];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

const scheduled = { eventId: "ev_sched", eventType: "gift_scheduled", giftId: "gift_1", status: "scheduled", receiverEmail: "james@user.com", buyerUserId: 9 };
const claimed = { eventId: "ev_claim", eventType: "gift_claimed", giftId: "gift_1", status: "claimed", receiverEmail: "james@user.com", subscriptionId: "sub_gift_1", buyerUserId: 9 };

describe("gift subscription fulfillment", () => {
  it("records the provider gift and replays the same delivery idempotently", async () => {
    const first = await recordGiftProviderEvent({ ...scheduled, plan: "pro", currency: "USD", amount: 700 });
    expect(first.fulfillmentStatus).toBe("pending");
    const replay = await recordGiftProviderEvent({ ...scheduled, plan: "pro", currency: "USD", amount: 700 });
    expect(replay.giftId).toBe(first.giftId);
    expect(gifts).toHaveLength(1);
  });

  it("credits the resolved recipient wallet on claim and ignores replays", async () => {
    await recordGiftProviderEvent({ ...scheduled, plan: "pro", currency: "USD", amount: 700 });
    const credited = await fulfillGiftSubscription({ giftId: "gift_1", subscriptionId: "sub_gift_1", plan: "pro", currency: "USD", status: "non_renewing", receiverEmail: "james@user.com", recipientUserId: 7, role: "job_seeker", currentTermStart: new Date("2026-10-01T00:00:00.000Z"), currentTermEnd: new Date("2026-11-01T00:00:00.000Z") });
    expect(credited.status).toBe("credited");
    expect(wallets).toHaveLength(1);
    expect(wallets[0]).toMatchObject({ userId: 7, role: "job_seeker", plan: "pro", subscriptionId: "sub_gift_1", monthlyAllowance: 10, monthlyCreditsRemaining: 10 });
    const replay = await fulfillGiftSubscription({ giftId: "gift_1", subscriptionId: "sub_gift_1", plan: "pro", currency: "USD", status: "non_renewing", receiverEmail: "james@user.com", recipientUserId: 7, role: "job_seeker" });
    expect(replay.status).toBe("duplicate");
    expect(wallets).toHaveLength(1);
  });

  it("leaves the gift pending when nobody owns the receiver email", async () => {
    await recordGiftProviderEvent({ ...claimed, plan: "max", currency: "USD", amount: 1500 });
    expect(await resolveGiftRecipient("stranger@example.com")).toEqual({ status: "unresolved" });
    const result = await fulfillGiftSubscription({ giftId: "gift_1", subscriptionId: "sub_gift_1", plan: "max", currency: "USD", status: "non_renewing", receiverEmail: "stranger@example.com", recipientUserId: 999, role: "job_seeker" });
    expect(result.status).toBe("pending");
    expect(wallets).toHaveLength(0);
  });

  it("freezes ambiguous duplicates for review instead of crediting", async () => {
    accountRows.push(account(8, 1));
    aliasRows.push(alias(2, 1, 8, "james@user.com"));
    expect(await resolveGiftRecipient("james@user.com")).toEqual({ status: "ambiguous" });
    await recordGiftProviderEvent({ ...claimed, plan: "pro", currency: "USD", amount: 700 });
    const result = await fulfillGiftSubscription({ giftId: "gift_1", subscriptionId: "sub_gift_1", plan: "pro", currency: "USD", status: "non_renewing", receiverEmail: "james@user.com", recipientUserId: 7, role: "job_seeker" });
    expect(result.status).toBe("pending");
    expect(wallets).toHaveLength(0);
  });

  it("never credits a suspended person", async () => {
    people[0].suspended = true;
    expect(await resolveGiftRecipient("james@user.com")).toEqual({ status: "suspended" });
    await recordGiftProviderEvent({ ...claimed, plan: "pro", currency: "USD", amount: 700 });
    const result = await fulfillGiftSubscription({ giftId: "gift_1", subscriptionId: "sub_gift_1", plan: "pro", currency: "USD", status: "non_renewing", receiverEmail: "james@user.com", recipientUserId: 7, role: "job_seeker" });
    expect(result.status).toBe("pending");
    expect(wallets).toHaveLength(0);
  });

  it("parks a conflicting active plan instead of overwriting", async () => {
    wallets.push({ id: 1, userId: 7, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 30, monthlyAllowance: 30, monthlyCycleKey: "2026-10", plan: "max", subscriptionId: "sub_self_max", subscriptionStatus: "active" });
    await recordGiftProviderEvent({ ...claimed, plan: "pro", currency: "USD", amount: 700 });
    const result = await fulfillGiftSubscription({ giftId: "gift_1", subscriptionId: "sub_gift_1", plan: "pro", currency: "USD", status: "non_renewing", receiverEmail: "james@user.com", recipientUserId: 7, role: "job_seeker" });
    expect(result.status).toBe("conflict");
    expect(wallets[0]).toMatchObject({ plan: "max", subscriptionId: "sub_self_max" });
  });

  it("lets the verified recipient claim their pending gift, and nobody else", async () => {
    await recordGiftProviderEvent({ ...claimed, plan: "pro", currency: "USD", amount: 700 });
    await expect(claimGiftSubscription(8, "gift_1")).rejects.toThrow();
    expect(wallets).toHaveLength(0);
    const result = await claimGiftSubscription(7, "gift_1");
    expect(result.status).toBe("credited");
    expect(wallets[0]).toMatchObject({ userId: 7, plan: "pro" });
  });

  it("lists buyer receipts and recipient claimables", async () => {
    await recordGiftProviderEvent({ ...claimed, plan: "pro", currency: "USD", amount: 700 });
    expect(await listBuyerGifts(9)).toHaveLength(1);
    expect(await listBuyerGifts(7)).toHaveLength(0);
    expect(await listClaimableGiftsForUser(7)).toHaveLength(1);
    expect(await listClaimableGiftsForUser(8)).toHaveLength(0);
  });

  it("marks expired and cancelled provider states terminally", async () => {
    await recordGiftProviderEvent({ eventId: "e1", eventType: "gift_expired", giftId: "gift_9", status: "expired", receiverEmail: "james@user.com", buyerUserId: 9 });
    expect(gifts[0]).toMatchObject({ fulfillmentStatus: "expired" });
  });
});
