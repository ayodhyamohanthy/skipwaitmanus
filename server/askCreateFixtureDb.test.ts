import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, referralRequests } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { createAskCreateFixture, type AskFixtureTables, type Row } from "./askCreateFixtureDb";
import { createCompanyReferralRequest, type CreateCompanyReferralInput } from "./db";

/*
 * D-132-item3 §7a: the create-path fixture must roll a failed transaction back,
 * or a "nothing was written" assertion after a refused send proves nothing.
 * (c)-(e) run the real createCompanyReferralRequest against it; (f) keeps the
 * reason for the fixture visible: the permissive `cb(api)` semantics the older
 * create-path fixtures use leave orphan rows behind.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const SEEKER = 7;
const REFERRER = 9;
const URL_ = "https://careers.acme.com/jobs/123";
const BUSINESS_TABLES = ["jobs", "referralRequests", "askWorkItems", "askCosts", "notifications", "referrerReviewEmailLinks", "referralReviewDeliveries", "companyCoverageInvitations", "tokenTransactions", "tokenBalances", "planCreditGrants", "referralAttachments"];

const fixture = createAskCreateFixture();
const referrerProfile = (userId: number): Row => ({ id: userId, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date(NOW - 30 * DAY), paused: false, notifyNewAsk: true, referralCapacity: null });
const wallet = (credits: number): Row => ({
  id: 1, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: credits, monthlyAllowance: 3,
  monthlyCycleKey: currentMonthlyCycleKey(new Date(NOW)), plan: "free", subscriptionId: null, subscriptionStatus: null,
  subscriptionCurrency: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, subscriptionResourceVersion: null,
});

function seed(options: { credits?: number; covered?: boolean } = {}): AskFixtureTables {
  const tables: AskFixtureTables = {
    users: [{ id: SEEKER, name: "Sam Seeker", email: "sam@example.com", suspended: false, canonicalPersonId: null }, { id: REFERRER, name: "Maya Chen", email: "maya@acme.com", suspended: false, canonicalPersonId: null }],
    canonicalPeople: [], profiles: options.covered === false ? [] : [referrerProfile(REFERRER)], jobs: [],
    tokenBalances: [wallet(options.credits ?? 3)], tokenTransactions: [], planCreditGrants: [], promoCreditGrants: [], referralRequests: [],
    referralAttachments: [{ id: 41, ownerId: SEEKER, referralRequestId: null, fileName: "resume.pdf", fileKey: "private/resume", mimeType: "application/pdf", fileSize: 3 }],
    workItems: [], askCosts: [], askWorkItems: [], referralTransitionEvents: [], referralRequestPasses: [], referralRequestSaves: [],
    referralDocumentAccessGrants: [], referrerReviewEmailLinks: [], referralReviewDeliveries: [], notifications: [], operationalActivityLogs: [],
    companyCoverageInvitations: [],
  };
  fixture.reset(tables);
  return structuredClone(tables);
}

const ask = (over: Partial<CreateCompanyReferralInput> = {}): CreateCompanyReferralInput => ({ targetRoleUrl: URL_, personalPitch: "I shipped the approvals redesign this role describes.", attachmentIds: [41], idempotencyKey: "fixture-key-0001", ...over });
const business = () => Object.fromEntries(BUSINESS_TABLES.map(name => [name, structuredClone(fixture.tables[name] ?? [])]));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  fixture.setRollback(true);
  seed();
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(fixture.database);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("askCreateFixtureDb: a transaction that throws leaves nothing behind", () => {
  it("(a) restores every table and the id sequence after inserts in two tables and a throw", async () => {
    const tablesBefore = structuredClone(fixture.tables);
    const sequenceBefore = structuredClone(fixture.sequence);
    await expect(fixture.database.transaction(async tx => {
      await tx.insert(jobs).values({ title: "Role", company: "acme.com" });
      await tx.insert(referralRequests).values({ jobId: 1, jobSeekerId: SEEKER });
      throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(fixture.tables).toEqual(tablesBefore);
    expect(fixture.sequence).toEqual(sequenceBefore);
  });

  it("(b) keeps the writes of a transaction that succeeds", async () => {
    await fixture.database.transaction(async tx => {
      await tx.insert(jobs).values({ title: "Role", company: "acme.com" });
      await tx.insert(referralRequests).values({ jobId: 1, jobSeekerId: SEEKER });
    });
    expect(fixture.tables.jobs).toHaveLength(1);
    expect(fixture.tables.referralRequests).toHaveLength(1);
    expect(fixture.sequence).toEqual({ jobs: 1, referralRequests: 1 });
  });

  it("(c) a real create whose spend fails after its inserts (no credit left) leaves the business tables as they were", async () => {
    seed({ credits: 0 });
    const before = business();
    await expect(createCompanyReferralRequest(SEEKER, ask())).rejects.toThrow(/no referral credits left/);
    expect(business()).toEqual(before);
  });

  it("(d) a real covered create commits one request and one #1 debit", async () => {
    const result = await createCompanyReferralRequest(SEEKER, ask());
    expect(result).toMatchObject({ coverageStatus: "covered", replayed: false });
    expect(fixture.tables.referralRequests).toHaveLength(1);
    const debits = fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend");
    expect(debits.map(row => row.idempotencyKey)).toEqual(["fixture-key-0001#1"]);
  });

  it("(e) a real waiting create commits one request and one coverage invitation, with no debit", async () => {
    seed({ covered: false });
    const result = await createCompanyReferralRequest(SEEKER, ask());
    expect(result).toMatchObject({ coverageStatus: "waiting_for_company_coverage", replayed: false });
    expect(fixture.tables.referralRequests).toHaveLength(1);
    expect(fixture.tables.companyCoverageInvitations).toHaveLength(1);
    expect(fixture.tables.tokenTransactions.filter(row => row.kind === "credit_spend")).toEqual([]);
  });

  it("(f) the permissive cb(api) semantics keep the orphan rows the same failure wrote", async () => {
    fixture.setRollback(false);
    seed({ credits: 0 });
    await expect(createCompanyReferralRequest(SEEKER, ask())).rejects.toThrow(/no referral credits left/);
    expect(fixture.tables.jobs).toHaveLength(1);
    expect(fixture.tables.referralRequests).toHaveLength(1);
  });
});
