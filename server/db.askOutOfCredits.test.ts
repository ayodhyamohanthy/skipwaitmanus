import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { profiles, referralAttachments, tokenBalances } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { COMPANY_ASK_PRICE_DESCRIPTION, COMPANY_ASK_PRICE_TITLE, askCreditCost, createCompanyReferralRequest } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * Drift-retired-plan-copy (D-027/D-046): an ask sent with no credit left is refused
 * with copy that names only what is on sale (credit packs and the plans), never the
 * retired Pro/Max, and the ask route answers it as the seeker's own 400, not a 500.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const OUT_OF_CREDITS = "You have no referral credits left. Add a credit pack or choose a plan in Plans & credits to send this ask now, or wait for your included credits to renew.";
const SEEKER = 7;
const ROLE_URL = "https://careers.acme.com/jobs/design-1";

type Row = Readonly<Record<string, string | number | boolean | Date | null>>;
let rowsByTable: Map<MySqlTable, readonly Row[]>;

/** The askNoteProjection.test.ts fake: selects return the table's rows, writes succeed. */
function fixtureDatabase() {
  const select = () => {
    let table: MySqlTable | undefined;
    const result = () => structuredClone(table ? rowsByTable.get(table) ?? [] : []);
    const query = {
      from: (next: MySqlTable) => { table = next; return query; },
      innerJoin: () => query, leftJoin: () => query, groupBy: () => query, orderBy: () => query, limit: () => query, where: () => query,
      for: async () => result(),
      then: <T>(resolve: (rows: Row[]) => T, reject?: (error: Error) => T) => Promise.resolve(result()).then(resolve, reject),
    };
    return query;
  };
  let insertId = 900;
  const insert = () => ({
    values: () => Object.assign(Promise.resolve([{ insertId: ++insertId, affectedRows: 1 }]), { onDuplicateKeyUpdate: async () => [{ insertId: 0, affectedRows: 1 }] }),
  });
  const update = () => ({ set: () => ({ where: async () => [{ affectedRows: 1 }] }) });
  const api = { select, insert, update };
  return { ...api, transaction: async <T>(run: (tx: typeof api) => Promise<T>): Promise<T> => run(api) };
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  rowsByTable = new Map();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixtureDatabase());
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("an ask sent with no credit left", () => {
  it("is refused with copy that points to credit packs and plans, never to retired Pro/Max", async () => {
    // A Free wallet in the current cycle with every monthly credit used and nothing bought.
    rowsByTable.set(tokenBalances, [{ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 0, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(), plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: new Date() }]);
    // One available acme.com employee: the ask is covered, so it must pay its credit now (D-034).
    rowsByTable.set(profiles, [{ id: 91, userId: 501, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(), paused: false, referralCapacity: 3 }]);
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    const refusal = await createCompanyReferralRequest(SEEKER, { targetRoleUrl: ROLE_URL, personalPitch: "I led the approvals redesign this role describes.", attachmentIds: [77], idempotencyKey: "ask-out-of-credits-0001" }).then(
      () => { throw new Error("the ask was accepted without a credit"); },
      (error: Error) => error,
    );
    expect(refusal.message).toBe(OUT_OF_CREDITS);
    expect(refusal.message).not.toMatch(/\bPro\b|\bMax\b/);
  });

  it("accepts a waiting ask with no credit and spends nothing: the credit is due only at first visibility (D-034/D-047)", async () => {
    rowsByTable.set(tokenBalances, [{ id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 0, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(), plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: new Date() }]);
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    // No verified acme.com referrer rows: the ask waits for free instead of being refused.
    const result = await createCompanyReferralRequest(SEEKER, { targetRoleUrl: ROLE_URL, personalPitch: "I led the approvals redesign this role describes.", attachmentIds: [77], idempotencyKey: "ask-waiting-0001" });
    expect(result).toMatchObject({ coverageStatus: "waiting_for_company_coverage", notifiedEmployees: 0 });
    expect(rowsByTable.get(tokenBalances)?.[0]).toMatchObject({ monthlyCreditsRemaining: 0, balance: 0 });
  });

  it("flag on: the renewal route is named only when a renewed cycle can reach the ask's cost (D-132 item 3)", async () => {
    // Free gives 3 credits a month with NO carryover: when the classified cost
    // exceeds what one renewed cycle plus the bought balance can reach, "wait
    // for your included credits to renew" would promise a funding path that
    // does not exist. The clause is dropped then, kept when it is real.
    vi.stubEnv("ASK_LEVEL_COST", "true");
    // A senior slug classifies above the Free month's 3: one renewal alone can never fund it.
    const SENIOR_URL = "https://careers.acme.com/jobs/principal-platform-engineer-1";
    const cost = askCreditCost({ title: COMPANY_ASK_PRICE_TITLE, description: COMPANY_ASK_PRICE_DESCRIPTION, url: SENIOR_URL });
    expect(cost).toBeGreaterThan(3); // the fixture's premise: one Free renewal alone can never fund this ask
    rowsByTable.set(profiles, [{ id: 91, userId: 501, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(), paused: false, referralCapacity: 3 }]);
    rowsByTable.set(referralAttachments, [{ id: 77 }]);
    const walletRow = (balance: number) => ({ id: 1, userId: SEEKER, role: "job_seeker", balance, monthlyCreditsRemaining: 0, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(), plan: "free", subscriptionId: null, subscriptionStatus: null, subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null, updatedAt: new Date() });
    const sendAsk = (key: string) => createCompanyReferralRequest(SEEKER, { targetRoleUrl: SENIOR_URL, personalPitch: "I led the approvals redesign this role describes.", attachmentIds: [77], idempotencyKey: key, expectedCost: cost }).then(
      () => { throw new Error("the ask was accepted without enough credit"); },
      (error: Error) => error,
    );
    // Empty wallet: renewal alone (3) cannot reach the cost - no renewal route.
    rowsByTable.set(tokenBalances, [walletRow(0)]);
    const unfundable = await sendAsk("ask-renewal-cannot-fund-0001");
    expect(unfundable.message).toBe(`This ask costs ${cost} credits and your balance is lower. Add credits in Plans & credits to send it.`);
    expect(unfundable.message).not.toContain("renew");
    // Bought 5 credits persist and a renewed cycle adds 3: 5 + 3 reaches 6, so the renewal route is real and stays.
    rowsByTable.set(tokenBalances, [walletRow(cost - 1)]);
    const fundable = await sendAsk("ask-renewal-can-fund-0001");
    expect(fundable.message).toBe(`This ask costs ${cost} credits and your balance is lower. Add credits in Plans & credits to send it now, or wait for your included credits to renew.`);
  });

  it("answers the refusal as the seeker's 400 with the same copy", async () => {
    const app = express();
    app.use(express.json());
    const deps = {
      resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "workos-test" } } : undefined),
      createCompanyReferralRequest: async () => { throw new Error(OUT_OF_CREDITS); },
      recordActivity: async () => undefined,
    };
    registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
    const response = await request(app).post("/api/company-referrals").set("x-test-user", String(SEEKER)).set("Idempotency-Key", "ask-key-0123456789abcdef").send({ expectedCost: 1, targetRoleUrl: "https://careers.wipro.com/job/product-designer-123", attachmentIds: [5], candidateMessage: "A specific note about the role." });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: OUT_OF_CREDITS });
  });
});
