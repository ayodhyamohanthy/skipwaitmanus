import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { canonicalPeople, giftSubscriptionFulfillments, tokenBalances, tokenTransactions, users, verifiedLoginAliases } from "../drizzle/schema";
import * as db from "./db";
import {
  claimGiftSubscription,
  listBuyerGifts,
  listClaimableGiftsForUser,
  recordGiftProviderEvent,
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
let ledgerRows: Array<Record<string, unknown>>;

function tableFor(table: unknown): Array<Record<string, unknown>> {
  if (table === giftSubscriptionFulfillments) return gifts;
  if (table === tokenBalances) return wallets;
  if (table === canonicalPeople) return people;
  if (table === verifiedLoginAliases) return aliasRows;
  if (table === users) return accountRows;
  if (table === tokenTransactions) return ledgerRows;
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
  gifts = []; wallets = []; ledgerRows = [];
  people = [person(1, "james@user.com")];
  aliasRows = [alias(1, 1, 7, "james@user.com")];
  accountRows = [account(7, 1)];
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

const scheduled = { eventId: "ev_sched", eventType: "gift_scheduled", giftId: "gift_1", status: "scheduled", receiverEmail: "james@user.com", buyerUserId: 9 };
const claimed = { eventId: "ev_claim", eventType: "gift_claimed", giftId: "gift_1", status: "claimed", receiverEmail: "james@user.com", subscriptionId: "sub_gift_1", buyerUserId: 9 };

// D-067: gifts only ever sold Pro or Max, which are removed completely. Provider gift
// events stay durable receipts, a claimed gift is parked as plan_retired, and nothing
// ever writes a wallet or a ledger row for a gift.
describe("gift receipts after D-067", () => {
  it("records the provider gift and replays the same delivery idempotently", async () => {
    const first = await recordGiftProviderEvent({ ...scheduled, plan: "pro", currency: "USD", amount: 700 });
    expect(first.fulfillmentStatus).toBe("pending");
    const replay = await recordGiftProviderEvent({ ...scheduled, plan: "pro", currency: "USD", amount: 700 });
    expect(replay.giftId).toBe(first.giftId);
    expect(gifts).toHaveLength(1);
    expect(wallets).toEqual([]);
    expect(ledgerRows).toEqual([]);
  });

  it("parks a claimed gift as plan_retired, on its first receipt or on a later one, and writes no wallet", async () => {
    const parked = await recordGiftProviderEvent({ ...claimed, plan: "max", currency: "USD", amount: 1500 });
    expect(parked).toMatchObject({ giftId: "gift_1", fulfillmentStatus: "conflict", failureReason: "plan_retired", providerStatus: "claimed", subscriptionId: "sub_gift_1" });
    await recordGiftProviderEvent({ ...scheduled, eventId: "ev_sched_2", giftId: "gift_2" });
    expect(gifts[1]).toMatchObject({ fulfillmentStatus: "pending", failureReason: null });
    const later = await recordGiftProviderEvent({ ...claimed, eventId: "ev_claim_2", giftId: "gift_2" });
    expect(later).toMatchObject({ fulfillmentStatus: "conflict", failureReason: "plan_retired" });
    expect(wallets).toEqual([]);
    expect(ledgerRows).toEqual([]);
  });

  it("refuses every claim of a retired-plan gift, parks it, and credits nothing; a stranger is refused outright", async () => {
    // A gift recorded as claimed before this change, still pending.
    gifts.push({ id: 1, giftId: "gift_1", provider: "chargebee", buyerUserId: 9, receiverEmail: "james@user.com", recipientUserId: null, role: "job_seeker", plan: "pro", currency: "USD", amount: 700, subscriptionId: "sub_gift_1", providerStatus: "claimed", fulfillmentStatus: "pending", failureReason: null, creditedAt: null });
    await expect(claimGiftSubscription(8, "gift_1")).rejects.toThrow("This gift was sent to a different email address");
    expect(gifts[0]).toMatchObject({ fulfillmentStatus: "pending" });
    expect(await claimGiftSubscription(7, "gift_1")).toEqual({ status: "retired", giftId: "gift_1" });
    expect(gifts[0]).toMatchObject({ fulfillmentStatus: "conflict", failureReason: "plan_retired", recipientUserId: null, creditedAt: null });
    expect(await claimGiftSubscription(7, "gift_1")).toEqual({ status: "retired", giftId: "gift_1" });
    expect(wallets).toEqual([]);
    expect(ledgerRows).toEqual([]);
    await expect(claimGiftSubscription(7, "gift_missing")).rejects.toThrow("We could not find this gift");
  });

  it("answers a gift credited before D-067 as a duplicate and never credits it again", async () => {
    gifts.push({ id: 1, giftId: "gift_old", provider: "chargebee", buyerUserId: 9, receiverEmail: "james@user.com", recipientUserId: 7, role: "job_seeker", plan: "pro", currency: "USD", amount: 700, subscriptionId: "sub_old", providerStatus: "claimed", fulfillmentStatus: "credited", failureReason: null, creditedAt: NOW });
    expect(await claimGiftSubscription(7, "gift_old")).toEqual({ status: "duplicate" });
    expect(await recordGiftProviderEvent({ ...claimed, eventId: "ev_late", giftId: "gift_old" })).toMatchObject({ fulfillmentStatus: "credited" });
    expect(wallets).toEqual([]);
    expect(ledgerRows).toEqual([]);
  });

  it("no longer exports any path that writes a gift into a wallet", () => {
    for (const name of ["fulfillGiftSubscription", "updateGiftPlan", "resolveGiftRecipient"]) expect(db).not.toHaveProperty(name);
  });

  it("keeps buyer receipts readable; a parked gift is no longer offered to claim", async () => {
    await recordGiftProviderEvent({ ...scheduled, plan: "pro", currency: "USD", amount: 700 });
    expect(await listBuyerGifts(9)).toEqual([expect.objectContaining({ giftId: "gift_1", plan: "pro", fulfillmentStatus: "pending" })]);
    expect(await listBuyerGifts(7)).toHaveLength(0);
    await recordGiftProviderEvent({ ...claimed, eventId: "ev_claim_x" });
    expect(await listBuyerGifts(9)).toEqual([expect.objectContaining({ giftId: "gift_1", fulfillmentStatus: "conflict" })]);
    expect(await listClaimableGiftsForUser(7)).toHaveLength(0);
    expect(await listClaimableGiftsForUser(8)).toHaveLength(0);
  });

  it("marks expired and cancelled provider states terminally", async () => {
    await recordGiftProviderEvent({ eventId: "e1", eventType: "gift_expired", giftId: "gift_9", status: "expired", receiverEmail: "james@user.com", buyerUserId: 9 });
    expect(gifts[0]).toMatchObject({ fulfillmentStatus: "expired" });
    await recordGiftProviderEvent({ ...claimed, eventId: "e2", giftId: "gift_8" });
    await recordGiftProviderEvent({ eventId: "e3", eventType: "gift_cancelled", giftId: "gift_8", status: "cancelled" });
    expect(gifts[1]).toMatchObject({ fulfillmentStatus: "cancelled", failureReason: "provider_cancelled" });
  });
});
