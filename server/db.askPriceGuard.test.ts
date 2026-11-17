import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import type { AcceptedAskCost } from "../shared/acceptedAskCost";
import { createAskCreateFixture, type AskFixtureTables, type Row } from "./askCreateFixtureDb";
import { createCompanyReferralRequest, previewAskCost, type CreateCompanyReferralInput } from "./db";
import { AskPriceChangedError, CoverageOpenedUpError } from "./planGates";

/*
 * D-132-item3 §7 tests 5-15: a covered referral request is charged exactly the
 * cost the seeker accepted, or refused with AskPriceChangedError and nothing
 * written. Every zero-write assertion here runs on the rollback-capable
 * askCreateFixtureDb (§7a); a permissive fixture would keep the rows a refused
 * send wrote before the throw and prove nothing.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const REFERRER = 9;
const URL_ = "https://careers.acme.com/jobs/123";
/** Classified at level 3, so it costs 3 while ASK_LEVEL_COST is on (tests 7, 8). */
const LEVEL3_URL = "https://careers.acme.com/jobs/assistant-manager-123";
const KEY = "price-guard-key-0001";
const ZERO_WRITE_TABLES = ["jobs", "referralRequests", "askWorkItems", "askCosts", "notifications", "referrerReviewEmailLinks", "referralReviewDeliveries", "companyCoverageInvitations", "tokenTransactions"];

const fixture = createAskCreateFixture();
const referrerProfile = (userId: number): Row => ({ id: userId, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(NOW - 30 * DAY), paused: false, notifyNewAsk: true, referralCapacity: null });
const wallet = (over: Row = {}): Row => ({
  id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 3, monthlyAllowance: 3,
  monthlyCycleKey: currentMonthlyCycleKey(new Date(NOW)), plan: "free", subscriptionId: null, subscriptionStatus: null,
  subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null,
  ...over,
});
const paidWallet = (over: Row = {}): Row => wallet({ plan: "momentum", subscriptionId: "sub_momentum", subscriptionStatus: "active", subscriptionCurrentTermEnd: new Date(NOW + 20 * DAY), ...over });
const carryoverGrant = (credits: number): Row => ({ id: 21, userId: SEEKER, role: "job_seeker", source: "carryover", grantKey: "carryover:test:21", planId: "momentum", subscriptionId: "sub_momentum", tokenCount: credits, creditsRemaining: credits, status: "active", grantedAt: new Date(NOW - 5 * DAY), expiresAt: new Date(NOW + 2 * DAY), closedAt: null });
const promoGrant = (credits: number): Row => ({ id: 31, userId: SEEKER, role: "job_seeker", source: "launch", providerRef: "promo:test", tokenCount: credits, creditsRemaining: credits, status: "active", grantedAt: new Date(NOW - DAY), expiresAt: new Date(NOW + DAY), consumedAt: null });

function seed(options: { wallet?: Row; covered?: boolean; grants?: Row[]; promo?: Row[] } = {}) {
  const tables: AskFixtureTables = {
    users: [{ id: SEEKER, name: "Sam Seeker", email: "sam@example.com", suspended: false, canonicalPersonId: null }, { id: REFERRER, name: "Maya Chen", email: "maya@acme.com", suspended: false, canonicalPersonId: null }],
    canonicalPeople: [], profiles: options.covered === false ? [] : [referrerProfile(REFERRER)], jobs: [],
    tokenBalances: [options.wallet ?? wallet()], tokenTransactions: [], planCreditGrants: options.grants ?? [], promoCreditGrants: options.promo ?? [], referralRequests: [],
    referralAttachments: [{ id: 41, ownerId: SEEKER, referralRequestId: null, fileName: "resume.pdf", fileKey: "private/resume", mimeType: "application/pdf", fileSize: 3 }],
    workItems: [], askCosts: [], askWorkItems: [], referralTransitionEvents: [], referralRequestPasses: [], referralRequestSaves: [],
    referralDocumentAccessGrants: [], referrerReviewEmailLinks: [], referralReviewDeliveries: [], notifications: [], operationalActivityLogs: [],
    companyCoverageInvitations: [],
  };
  fixture.reset(tables);
}

const ask = (over: Partial<CreateCompanyReferralInput> = {}): CreateCompanyReferralInput => ({ targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: KEY, ...over });
const send = (over: Partial<CreateCompanyReferralInput> = {}) => createCompanyReferralRequest(SEEKER, ask(over));
const cost = (units: number, ...source: Array<[AcceptedAskCost["source"][number]["bucket"], number]>): AcceptedAskCost => ({ units, band: null, source: source.map(([bucket, n]) => ({ bucket, units: n })) });
const snapshot = () => structuredClone({ tables: fixture.tables, sequence: fixture.sequence });

/** A refused send: no business row, no bound document, wallet and grants byte-equal to before the call. */
function expectNothingWritten(before: ReturnType<typeof snapshot>) {
  for (const name of ZERO_WRITE_TABLES) expect(fixture.tables[name] ?? [], name).toEqual(before.tables[name] ?? []);
  expect(fixture.tables.referralAttachments.every(row => row.referralRequestId === null)).toBe(true);
  expect(fixture.tables.tokenBalances).toEqual(before.tables.tokenBalances);
  expect(fixture.tables.planCreditGrants).toEqual(before.tables.planCreditGrants);
  expect(fixture.sequence).toEqual(before.sequence);
}

async function refusal(promise: Promise<unknown>): Promise<AskPriceChangedError> {
  const error = await promise.then(() => null, (caught: unknown) => caught);
  expect(error).toBeInstanceOf(AskPriceChangedError);
  return error as AskPriceChangedError;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("ASK_LEVEL_COST", "false");
  vi.stubEnv("PROMO_GRANTS_ENABLED", "false");
  fixture.setRollback(true);
  seed();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("accepted-price guard on a covered referral request", () => {
  it("5. match: charged exactly the previewed cost, ledger rows #1..#n, chargedCost equal to it", async () => {
    const accepted = await previewAskCost(SEEKER, URL_);
    expect(accepted).toEqual(cost(1, ["cycle", 1]));
    const result = await send({ expectedCost: accepted ?? undefined });
    expect(result).toMatchObject({ coverageStatus: "covered", replayed: false, chargedCost: accepted });
    expect(fixture.tables.referralRequests).toHaveLength(1);
    expect(fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend").map(row => row.idempotencyKey)).toEqual([`${KEY}#1`]);
  });

  it("6. bucket drift: refused with the current cost, and nothing is written", async () => {
    seed({ wallet: wallet({ monthlyCreditsRemaining: 0, balance: 5 }) });
    const before = snapshot();
    const error = await refusal(send({ expectedCost: cost(1, ["cycle", 1]) }));
    expect(error.code).toBe("ask_price_changed");
    expect(error.acceptedCost).toEqual(cost(1, ["purchased", 1]));
    expect(error.message).toBe("The cost of this referral request changed since you confirmed it. Nothing was sent and nothing was charged. Check the new cost and confirm again to send.");
    expectNothingWritten(before);
  });

  it("7. split drift: the same units from a different split is refused, with nothing written (F2)", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    seed({ wallet: wallet({ monthlyCreditsRemaining: 2, balance: 5 }) });
    const before = snapshot();
    const error = await refusal(send({ targetRoleUrl: LEVEL3_URL, expectedCost: cost(3, ["cycle", 1], ["purchased", 2]) }));
    expect(error.acceptedCost).toEqual(cost(3, ["cycle", 2], ["purchased", 1]));
    expectNothingWritten(before);
  });

  it("8. units drift: a cost of 1 confirmed against a level that now costs 3 is refused, with nothing written", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const before = snapshot();
    const error = await refusal(send({ targetRoleUrl: LEVEL3_URL, expectedCost: cost(1, ["cycle", 1]) }));
    expect(error.acceptedCost).toEqual(cost(3, ["cycle", 3]));
    expectNothingWritten(before);
  });

  it("9-10. reconfirm with the same key spends once; a replay rebuilds chargedCost from the ledger and writes nothing", async () => {
    seed({ wallet: wallet({ monthlyCreditsRemaining: 0, balance: 5 }) });
    const error = await refusal(send({ expectedCost: cost(1, ["cycle", 1]) }));
    const reconfirmed = await send({ expectedCost: error.acceptedCost });
    expect(reconfirmed).toMatchObject({ replayed: false, chargedCost: cost(1, ["purchased", 1]) });
    expect(fixture.tables.tokenBalances[0].balance).toBe(4);
    expect(fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend")).toHaveLength(1);

    const before = snapshot();
    const replay = await send({ expectedCost: cost(1, ["cycle", 1]) });
    expect(replay).toMatchObject({ replayed: true, chargedCost: reconfirmed.chargedCost });
    expect(snapshot()).toEqual(before);
  });

  it("11. legacy: with no expectedCost the send is today's (one request, one #1 debit) and reports what it charged", async () => {
    const result = await send();
    expect(result).toMatchObject({ coverageStatus: "covered", replayed: false, chargedCost: cost(1, ["cycle", 1]) });
    expect(fixture.tables.referralRequests).toHaveLength(1);
    expect(fixture.tables.tokenBalances[0].monthlyCreditsRemaining).toBe(2);
    expect(fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend").map(row => row.idempotencyKey)).toEqual([`${KEY}#1`]);
  });

  it("12. waiting: an uncovered company is created waiting with no spend, no refusal and chargedCost null", async () => {
    seed({ covered: false });
    const result = await send({ expectedCost: cost(1, ["purchased", 1]) });
    expect(result).toMatchObject({ coverageStatus: "waiting_for_company_coverage", replayed: false, chargedCost: null });
    expect(fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend")).toEqual([]);
    expect(fixture.tables.tokenBalances[0].monthlyCreditsRemaining).toBe(3);
  });

  it("13. shortfall: today's insufficient refusal, not a price change, and nothing is written", async () => {
    seed({ wallet: wallet({ monthlyCreditsRemaining: 0, balance: 0 }) });
    const before = snapshot();
    const error = await send({ expectedCost: cost(1, ["cycle", 1]) }).then(() => null, (caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(AskPriceChangedError);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("You have no referral credits left. Add a credit pack or choose a plan in Plans & credits to send this ask now, or wait for your included credits to renew.");
    expectNothingWritten(before);
  });

  it("14. coverage precedence: a promised free wait that turned covered still throws CoverageOpenedUpError", async () => {
    vi.stubEnv("ASK_LEVEL_COST", "true");
    const before = snapshot();
    await expect(send({ expectedCoverage: "waiting_for_company_coverage", expectedCost: cost(9, ["cycle", 9]) })).rejects.toBeInstanceOf(CoverageOpenedUpError);
    expectNothingWritten(before);
  });
});

describe("15. preview parity: previewAskCost is the cost an immediate send charges", () => {
  it("an expiring carryover grant pays first in both", async () => {
    seed({ wallet: paidWallet(), grants: [carryoverGrant(2)] });
    const accepted = await previewAskCost(SEEKER, URL_);
    expect(accepted).toEqual(cost(1, ["carryover", 1]));
    const result = await send();
    expect(result.chargedCost).toEqual(accepted);
  });

  it("promo grants on: a live promo pays first in both", async () => {
    vi.stubEnv("PROMO_GRANTS_ENABLED", "true");
    seed({ promo: [promoGrant(2)] });
    const accepted = await previewAskCost(SEEKER, URL_);
    expect(accepted).toEqual(cost(1, ["promo", 1]));
    const result = await send();
    expect(result.chargedCost).toEqual(accepted);
  });

  it("promo grants off: a live promo grant is not counted in either", async () => {
    seed({ promo: [promoGrant(2)] });
    const accepted = await previewAskCost(SEEKER, URL_);
    expect(accepted).toEqual(cost(1, ["cycle", 1]));
    const result = await send();
    expect(result.chargedCost).toEqual(accepted);
  });

  it("the preview writes no spend row and no request, and a shortfall previews as null", async () => {
    await previewAskCost(SEEKER, URL_);
    expect(fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend" || row.kind === "promo_spend")).toEqual([]);
    expect(fixture.tables.referralRequests).toEqual([]);
    expect(fixture.tables.jobs).toEqual([]);
    seed({ wallet: wallet({ monthlyCreditsRemaining: 0, balance: 0 }) });
    expect(await previewAskCost(SEEKER, URL_)).toBeNull();
  });
});
