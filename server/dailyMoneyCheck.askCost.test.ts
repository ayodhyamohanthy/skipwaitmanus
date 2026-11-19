// D-132 audit item 6: the daily money check flags an ask whose credits spent differ from the cost stored at creation. Read-only.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askCosts, referralRequests, tokenTransactions } from "../drizzle/schema";
import { createDailyMoneyCheck, listAskCostMismatches, type DailyMoneyCheckDeps } from "./dailyMoneyCheck";
import { askRow, spendRow, store } from "./heldAsk.testkit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const cost = (id: number, requestId: number, creditCost: number) => ({ id, referralRequestId: requestId, jobLevel: creditCost, creditCost, source: "classified_at_create", createdAt: new Date("2026-10-22T00:00:00Z") });
const spend = (id: number, requestId: number, n: number, over: Record<string, unknown> = {}) => spendRow({ id, referenceId: String(requestId), tokenCount: -n, idempotencyKey: `k${requestId}#${id}`, ...over });

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("ask_cost_mismatch (D-132 audit item 6)", () => {
  it("flags an ask whose spend rows add up to something other than its stored cost, and only that one", async () => {
    store.reset([
      [referralRequests, [askRow({ id: 801 }), askRow({ id: 802 }), askRow({ id: 803 }), askRow({ id: 804 })]],
      [askCosts, [cost(1, 801, 5), cost(2, 802, 5), cost(3, 803, 3)]],
      [tokenTransactions, [
        spend(901, 801, 2), spend(902, 801, 3),            // 801: 2 + 3 = 5, matches
        spend(903, 802, 2),                                // 802: spent 2, stored 5, mismatch
        // 803: stored 3 but still waiting, nothing spent yet, not a finding
        spend(904, 804, 1),                                // 804: no stored cost (made with the flag off), not checked
      ]],
    ]);
    const rows = await listAskCostMismatches(50);
    expect(rows).toEqual([{ requestId: 802, storedCost: 5, spent: 2 }]);
  });

  it("is read-only: no ask, cost or ledger row moves", async () => {
    store.reset([[referralRequests, [askRow({ id: 802 })]], [askCosts, [cost(2, 802, 5)]], [tokenTransactions, [spend(903, 802, 2)]]]);
    const before = structuredClone({ a: store.rows(askCosts), l: store.rows(tokenTransactions), r: store.rows(referralRequests) });
    await listAskCostMismatches(50);
    expect({ a: store.rows(askCosts), l: store.rows(tokenTransactions), r: store.rows(referralRequests) }).toEqual(before);
  });

  it("the job lists it as ask_cost_mismatch with ids and numbers only", async () => {
    const sent: Array<{ text: string }> = [];
    const deps = {
      auditWallets: vi.fn(async () => ({ checkedWallets: 1, mismatches: [], integrity: [] })), listCreditedPayments: vi.fn(async () => []), countPaymentCreditRows: vi.fn(async () => []), listParkedPayments: vi.fn(async () => []), listUnmatchedRefunds: vi.fn(async () => []), listStaleCheckouts: vi.fn(async () => []), summarizeStaleCheckouts: vi.fn(async () => ({ total: 0, users: 0, oldest: null, newest: null })), listAllocatedAsks: vi.fn(async () => []), listLegacyPlanWallets: vi.fn(async () => []), listAskDeliverySpendsWhileWaiting: vi.fn(async () => []), listDoublyReversedSpends: vi.fn(async () => []), listRefundsAfterPickup: vi.fn(async () => []), listReferredPastDeadline: vi.fn(async () => []), listReleasedPassesUnrefunded: vi.fn(async () => []),
      listAskCostMismatches: vi.fn(async () => [{ requestId: 802, storedCost: 5, spent: 2 }]),
      sendEmail: vi.fn(async (input: { text: string }) => { sent.push(input); return true; }), recordActivity: vi.fn(async () => undefined),
    } as unknown as DailyMoneyCheckDeps;
    await createDailyMoneyCheck(deps)({ nowMs: Date.parse("2026-10-23T02:00:00Z"), windowKey: "w" });
    expect(sent[0]!.text).toContain("ask_cost_mismatch: ask #802 was priced at 5 credits when it was created, but 2 were spent");
  });
});
