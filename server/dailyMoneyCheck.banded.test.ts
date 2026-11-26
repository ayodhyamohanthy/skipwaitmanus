import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bandedCheckoutIntents,
  bandedFoundingCounters,
  bandedFoundingMemberships,
  bandedReferralBalances,
  tokenTransactions,
} from "../drizzle/schema";
import { listBandedMoneyCheckFindings } from "./dailyMoneyCheck";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

describe("listBandedMoneyCheckFindings (BANDED-grants D-367)", () => {
  const store = createInMemoryDrizzle();
  const NOW = Date.parse("2026-11-23T12:00:00.000Z");
  const DAY_MS = 24 * 60 * 60 * 1000;

  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
    mocks.createPool.mockResolvedValue({});
    mocks.drizzle.mockReturnValue(store.db);
    store.reset([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns zero findings on a clean banded state", async () => {
    store.reset([
      [bandedFoundingCounters, [
        { site: "test", planId: "early_to_mid", issuedCount: 1, reservedCount: 0, updatedAt: new Date(NOW) },
      ]],
      [bandedFoundingMemberships, [
        { id: 1, site: "test", planId: "early_to_mid", userId: 10, checkoutIntentId: "bp_1", status: "issued", issuedSequence: 1, expiresAt: new Date(NOW), issuedAt: new Date(NOW), createdAt: new Date(NOW) },
      ]],
      [bandedReferralBalances, [
        { id: 1, userId: 10, level: "mid", includedRemaining: 0, purchasedRemaining: 2, updatedAt: new Date(NOW) },
      ]],
      [tokenTransactions, [
        { id: 100, userId: 10, role: "job_seeker", tokenCount: 2, kind: "purchase", source: "banded:purchased:mid", referenceType: "chargebee_invoice", referenceId: "inv_1:mid", creditGrantId: null, createdAt: new Date(NOW) },
      ]],
    ]);

    const findings = await listBandedMoneyCheckFindings(NOW, 50);
    expect(findings).toEqual([]);
  });

  it("flags founding cap exceeded and membership count mismatches", async () => {
    store.reset([
      [bandedFoundingCounters, [
        // senior_to_executive foundingCap is 100; here issued (100) + reserved (2) = 102 > 100
        { site: "test", planId: "senior_to_executive", issuedCount: 100, reservedCount: 2, updatedAt: new Date(NOW) },
      ]],
      [bandedFoundingMemberships, [
        // Only 1 issued membership row despite counter saying 100
        { id: 1, site: "test", planId: "senior_to_executive", userId: 10, checkoutIntentId: "bp_1", status: "issued", issuedSequence: 1, expiresAt: new Date(NOW), issuedAt: new Date(NOW), createdAt: new Date(NOW) },
      ]],
    ]);

    const findings = await listBandedMoneyCheckFindings(NOW, 50);
    expect(findings.some(f => f.includes("banded_founding_cap_exceeded"))).toBe(true);
    expect(findings.some(f => f.includes("banded_founding_issued_count_mismatch"))).toBe(true);
  });

  it("flags paid unfulfilled intents older than 24 hours", async () => {
    store.reset([
      [bandedCheckoutIntents, [
        {
          id: 5,
          site: "test",
          checkoutIntentId: "br_unfulfilled",
          userId: 10,
          kind: "referral",
          billingRoute: "IN",
          currency: "INR",
          expectedTotal: 10000,
          fingerprint: "abc",
          cart: {},
          invoiceId: "inv_paid_unfulfilled",
          status: "pending",
          createdAt: new Date(NOW - 2 * DAY_MS),
          updatedAt: new Date(NOW - 2 * DAY_MS),
          expiresAt: new Date(NOW + DAY_MS),
          replayDeadline: new Date(NOW - DAY_MS),
        },
      ]],
    ]);

    const findings = await listBandedMoneyCheckFindings(NOW, 50);
    expect(findings.some(f => f.includes("banded_paid_unfulfilled_intent"))).toBe(true);
  });

  it("flags duplicate purchase grants and duplicate term grants", async () => {
    store.reset([
      [tokenTransactions, [
        { id: 1, userId: 10, role: "job_seeker", tokenCount: 2, kind: "purchase", referenceType: "chargebee_invoice", referenceId: "inv_dup:mid", creditGrantId: null, createdAt: new Date(NOW) },
        { id: 2, userId: 10, role: "job_seeker", tokenCount: 2, kind: "purchase", referenceType: "chargebee_invoice", referenceId: "inv_dup:mid", creditGrantId: null, createdAt: new Date(NOW) },
        { id: 3, userId: 10, role: "job_seeker", tokenCount: 3, kind: "plan_grant", referenceType: "subscription_term", referenceId: "sub_1:early:1000", idempotencyKey: "grant_dup_term", creditGrantId: null, createdAt: new Date(NOW) },
        { id: 4, userId: 10, role: "job_seeker", tokenCount: 3, kind: "plan_grant", referenceType: "subscription_term", referenceId: "sub_1:early:1000", idempotencyKey: "grant_dup_term", creditGrantId: null, createdAt: new Date(NOW) },
      ]],
    ]);

    const findings = await listBandedMoneyCheckFindings(NOW, 50);
    expect(findings.filter(f => f.includes("banded_duplicate_grant"))).toHaveLength(2);
  });

  it("flags purchased balance mismatch against ledger lots", async () => {
    store.reset([
      [bandedReferralBalances, [
        // Balance says 5, but purchase only granted 2
        { id: 1, userId: 10, level: "senior", includedRemaining: 0, purchasedRemaining: 5, updatedAt: new Date(NOW) },
      ]],
      [tokenTransactions, [
        { id: 10, userId: 10, role: "job_seeker", tokenCount: 2, kind: "purchase", source: "banded:purchased:senior", referenceType: "chargebee_invoice", referenceId: "inv_lot:senior", creditGrantId: null, createdAt: new Date(NOW) },
      ]],
    ]);

    const findings = await listBandedMoneyCheckFindings(NOW, 50);
    expect(findings.some(f => f.includes("banded_purchased_balance_mismatch"))).toBe(true);
  });
});
