// REL-webhook-auth-alarm (D-212): the daily money check reports refused Chargebee webhooks from the last 24 hours.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { operationalActivityLogs } from "../drizzle/schema";
import { countWebhookUnauthorizedSince, createDailyMoneyCheck, type DailyMoneyCheckDeps } from "./dailyMoneyCheck";
import { createInMemoryDrizzle } from "./inMemoryDrizzle.testkit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const store = createInMemoryDrizzle();
const NOW = Date.parse("2026-10-30T02:00:00Z");
const HOUR = 60 * 60_000;
const logRow = (id: number, action: string, hoursAgo: number) => ({ id, actorUserId: null, action, outcome: "failure", resourceType: "chargebee_webhook", resourceId: null, companyDomain: null, metadata: null, createdAt: new Date(NOW - hoursAgo * HOUR) });

type Sent = { subject: string; text: string };
function makeDeps(sent: Sent[]): DailyMoneyCheckDeps {
  return {
    auditWallets: vi.fn(async () => ({ checkedWallets: 1, mismatches: [], integrity: [] })),
    listCreditedPayments: vi.fn(async () => []),
    countPaymentCreditRows: vi.fn(async () => []),
    listParkedPayments: vi.fn(async () => []),
    listUnmatchedRefunds: vi.fn(async () => []),
    listStaleCheckouts: vi.fn(async () => []),
    summarizeStaleCheckouts: vi.fn(async () => ({ total: 0, users: 0, oldest: null, newest: null })),
    listAllocatedAsks: vi.fn(async () => []),
    listLegacyPlanWallets: vi.fn(async () => []),
    listAskDeliverySpendsWhileWaiting: vi.fn(async () => []),
    listDoublyReversedSpends: vi.fn(async () => []),
    listAskCostMismatches: vi.fn(async () => []),
    listRefundsAfterPickup: vi.fn(async () => []),
    listReferredPastDeadline: vi.fn(async () => []),
    countWebhookUnauthorizedSince,
    sendEmail: vi.fn(async (input: Sent) => { sent.push(input); return true; }),
    recordActivity: vi.fn(async () => undefined),
  };
}
const run = (deps: DailyMoneyCheckDeps) => createDailyMoneyCheck(deps)({ nowMs: NOW, windowKey: "2026-10-30" });

describe("webhook_unauthorized_24h (D-212)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("reports the refused deliveries of the last 24 hours from seeded rows, and writes nothing", async () => {
    store.reset([[operationalActivityLogs, [logRow(1, "chargebee.webhook.unauthorized", 2), logRow(2, "chargebee.webhook.unauthorized", 23), logRow(3, "chargebee.webhook.unauthorized", 25), logRow(4, "billing.refund_needs_review", 1)]]]);
    const before = structuredClone(store.rows(operationalActivityLogs));
    const sent: Sent[] = [];
    const output = await run(makeDeps(sent));
    expect(output.failed).toBe(0);
    expect(sent).toHaveLength(1);
    const lines = sent[0]!.text.split("\n").filter(line => line.startsWith("webhook_unauthorized_24h"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^webhook_unauthorized_24h: 2 Chargebee webhook deliveries/);
    expect(sent[0]!.subject).toContain("1 finding");
    expect(store.rows(operationalActivityLogs)).toEqual(before);
  });

  it("stays silent with no refused delivery in the last 24 hours", async () => {
    store.reset([[operationalActivityLogs, [logRow(3, "chargebee.webhook.unauthorized", 25), logRow(4, "billing.refund_needs_review", 1)]]]);
    const sent: Sent[] = [];
    const output = await run(makeDeps(sent));
    expect(output).toEqual({ processed: 1, failed: 0 });
    expect(sent).toEqual([]);
  });
});
