import { describe, expect, it } from "vitest";
import { EXPIRING_SOON_MS, RENEWAL_GRACE_MS, creditLedgerEntrySchema, creditLedgerQuerySchema, creditsLedgerSchema, spendIdempotencyKeySchema, type LedgerGrant, type LedgerWallet } from "../shared/creditLedger";
import { addMonthsUtc, grantExpiresAt, grantIsSpendable, grantShouldExpire, paidPlanLapsed, planCreditsExpireAt, planCycleAt, planCycleByIndex, planCycleCount, planCycleIndexOfKey, walletCycleStart } from "../shared/creditCycles";
import { isPaidPlanActive } from "../shared/planEntitlements";
import { allocateSpend, buildCreditsLedger, orderBuckets, spendableBuckets, usedInCycle } from "../shared/creditSpend";

const d = (iso: string) => new Date(iso);
const DAY = 24 * 60 * 60 * 1000;

const free = (patch: Partial<LedgerWallet> = {}): LedgerWallet => ({ plan: "free", balance: 0, monthlyAllowance: 0, monthlyCreditsRemaining: 0, monthlyCycleKey: "2026-10", subscriptionId: null, subscriptionStatus: null, subscriptionCurrentTermStart: null, subscriptionCurrentTermEnd: null, ...patch });
const paid = (patch: Partial<LedgerWallet> = {}): LedgerWallet => free({ plan: "start", monthlyAllowance: 10, monthlyCreditsRemaining: 10, subscriptionId: "sub_1", subscriptionStatus: "active", subscriptionCurrentTermStart: d("2026-10-06T00:00:00Z"), subscriptionCurrentTermEnd: d("2026-11-06T00:00:00Z"), ...patch });
const carry = (patch: Partial<LedgerGrant> = {}): LedgerGrant => ({ id: 1, source: "carryover", subscriptionId: "sub_1", tokenCount: 4, creditsRemaining: 4, expiresAt: d("2026-11-06T00:00:00Z"), status: "active", ...patch });

describe("cycle math", () => {
  it("adds months in UTC and clamps to the target month's last day", () => {
    expect(addMonthsUtc(d("2026-01-31T10:00:00Z"), 1).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addMonthsUtc(d("2028-01-31T00:00:00Z"), 1).toISOString()).toBe("2028-02-29T00:00:00.000Z");
    expect(addMonthsUtc(d("2026-11-15T00:00:00Z"), 3).toISOString()).toBe("2027-02-15T00:00:00.000Z");
    expect(addMonthsUtc(d("2026-03-31T00:00:00Z"), -1).toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("a monthly term is one cycle keyed by its start month, even after the term ends", () => {
    const start = d("2026-09-30T23:00:00Z"); const end = d("2026-10-30T23:00:00Z");
    expect(planCycleAt(start, end, d("2026-10-14T00:00:00Z"))).toMatchObject({ index: 0, key: "2026-09" });
    expect(planCycleAt(start, end, d("2026-12-01T00:00:00Z"))).toMatchObject({ index: 0, key: "2026-09", endsAt: end });
  });

  it("a yearly term grants twelve monthly cycles, the last ending with the term", () => {
    const start = d("2026-01-31T00:00:00Z"); const end = d("2027-01-31T00:00:00Z");
    expect(planCycleAt(start, end, d("2026-03-01T00:00:00Z"))).toMatchObject({ index: 1, key: "2026-02" });
    expect(planCycleAt(start, end, d("2026-03-31T00:00:00Z"))).toMatchObject({ index: 2, key: "2026-03" });
    expect(planCycleAt(start, end, d("2027-06-01T00:00:00Z"))).toMatchObject({ index: 11, key: "2026-12", endsAt: end });
    expect(planCycleAt(start, end, d("2025-12-01T00:00:00Z"))).toMatchObject({ index: 0, key: "2026-01" });
    expect(planCycleIndexOfKey(start, end, "2026-07")).toBe(6);
    expect(planCycleIndexOfKey(start, end, "2027-02")).toBe(-1);
  });

  it("a 30-day pass is one cycle and a 90-day pass three, however the calendar months fall", () => {
    const DAY_MS = DAY;
    for (const startIso of ["2026-01-31T00:00:00Z", "2026-02-01T00:00:00Z", "2026-07-01T00:00:00Z", "2026-10-14T09:30:00Z", "2028-02-29T00:00:00Z", "2026-12-31T23:59:59Z"]) {
      const start = d(startIso);
      expect(planCycleCount(start, new Date(start.getTime() + 30 * DAY_MS))).toBe(1);
      const end90 = new Date(start.getTime() + 90 * DAY_MS);
      expect(planCycleCount(start, end90)).toBe(3);
      const cycles = [0, 1, 2].map(index => planCycleByIndex(start, end90, index)!);
      expect(cycles[2].endsAt).toEqual(end90);
      expect(new Set(cycles.map(cycle => cycle.key)).size).toBe(3);
      expect(planCycleByIndex(start, end90, 3)).toBeNull();
      expect(planCycleAt(start, end90, new Date(end90.getTime() - 1))?.index).toBe(2);
    }
    // 31 Jan + 90 days = 1 May: the 1-day stub after 30 April joins the third cycle.
    const start = d("2026-01-31T00:00:00Z"); const end = d("2026-05-01T00:00:00Z");
    expect([0, 1, 2].map(index => planCycleByIndex(start, end, index)!.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(planCycleAt(start, end, d("2026-04-30T12:00:00Z"))).toMatchObject({ index: 2, endsAt: end });
    expect(planCycleCount(start, start)).toBe(0);
  });

  it("calendar terms keep their cycles: a month is one, a year twelve", () => {
    expect(planCycleCount(d("2026-10-06T00:00:00Z"), d("2026-11-06T00:00:00Z"))).toBe(1);
    expect(planCycleCount(d("2026-01-31T00:00:00Z"), d("2027-01-31T00:00:00Z"))).toBe(12);
    expect(planCycleCount(d("2026-02-28T00:00:00Z"), d("2027-02-28T00:00:00Z"))).toBe(12);
  });

  it("carryover: Start 1 month, Momentum 3 months, Land while subscribed, Free none", () => {
    const start = d("2026-10-06T00:00:00Z");
    expect(planCreditsExpireAt(start, 0)?.toISOString()).toBe("2026-11-06T00:00:00.000Z");
    expect(planCreditsExpireAt(start, 1)?.toISOString()).toBe("2026-12-06T00:00:00.000Z");
    expect(planCreditsExpireAt(start, 3)?.toISOString()).toBe("2027-02-06T00:00:00.000Z");
    expect(planCreditsExpireAt(start, "subscribed")).toBeNull();
  });

  it("finds the wallet's cycle start from its paid term, else the key's calendar month", () => {
    expect(walletCycleStart(paid({ monthlyCycleKey: "2026-10" }))?.toISOString()).toBe("2026-10-06T00:00:00.000Z");
    expect(walletCycleStart(free({ monthlyCycleKey: "2026-09" }))?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(walletCycleStart(free({ monthlyCycleKey: "legacy" }))).toBeNull();
  });
});

describe("plan lapse and grants", () => {
  const now = d("2026-10-20T00:00:00Z");
  it("a cancelled or non-renewing plan lapses at term end; a renewing plan only after the grace", () => {
    const ended = { subscriptionCurrentTermEnd: d("2026-10-19T00:00:00Z") };
    expect(paidPlanLapsed(paid(), now)).toBe(false);
    expect(paidPlanLapsed(paid({ ...ended, subscriptionStatus: "non_renewing" }), now)).toBe(true);
    expect(paidPlanLapsed(paid({ ...ended, subscriptionStatus: "cancelled" }), now)).toBe(true);
    expect(paidPlanLapsed(paid(ended), now)).toBe(false);
    expect(paidPlanLapsed(paid(ended), new Date(d("2026-10-19T00:00:00Z").getTime() + RENEWAL_GRACE_MS))).toBe(true);
    expect(paidPlanLapsed(free(), now)).toBe(false);
  });

  // D-067: a stored plan outside the catalog (retired Pro/Max, reserved Land ids) is
  // lapsed now, whatever its status or term, so the ledger rolls the wallet to Free.
  it.each(["pro", "max", "land_100", "land_500"])("a wallet still marked %s has lapsed now, even mid-term and renewing", plan => {
    for (const subscriptionStatus of ["active", "non_renewing", "cancelled", "paused"]) {
      expect(paidPlanLapsed(paid({ plan, subscriptionStatus }), now)).toBe(true);
    }
    expect(grantIsSpendable(carry(), paid({ plan }), now)).toBe(false);
  });

  // D-132: a stored family plan (fast_track/insider) is a real subscription.
  // It is never instantly lapsed the way retired Pro/Max ids are (the QA
  // go-live blocker: first wallet read reverted a paying fast_track member).
  it.each(["fast_track", "insider"])("a wallet on the family plan %s follows the normal status/term lapse rules", plan => {
    const ended = { subscriptionCurrentTermEnd: d("2026-10-19T00:00:00Z") };
    expect(paidPlanLapsed(paid({ plan }), now)).toBe(false);
    expect(isPaidPlanActive(paid({ plan }), now)).toBe(true);
    expect(paidPlanLapsed(paid({ plan, ...ended, subscriptionStatus: "non_renewing" }), now)).toBe(true);
    expect(paidPlanLapsed(paid({ plan, ...ended, subscriptionStatus: "cancelled" }), now)).toBe(true);
    expect(paidPlanLapsed(paid({ plan, ...ended }), now)).toBe(false);
    expect(paidPlanLapsed(paid({ plan, ...ended }), new Date(d("2026-10-19T00:00:00Z").getTime() + RENEWAL_GRACE_MS))).toBe(true);
  });

  it("carried credits are spendable only while their own subscription bills, and expire by date or when it ends", () => {
    expect(grantIsSpendable(carry(), paid(), now)).toBe(true);
    expect(grantIsSpendable(carry({ subscriptionId: "sub_old" }), paid(), now)).toBe(false);
    expect(grantShouldExpire(carry({ subscriptionId: "sub_old" }), paid(), now)).toBe(true);
    expect(grantIsSpendable(carry({ expiresAt: d("2026-10-19T00:00:00Z") }), paid(), now)).toBe(false);
    expect(grantShouldExpire(carry({ expiresAt: d("2026-10-19T00:00:00Z") }), paid(), now)).toBe(true);
    // Renewing plan waiting for its webhook: not spendable, not expired.
    const waiting = paid({ subscriptionCurrentTermEnd: d("2026-10-19T00:00:00Z") });
    expect(grantIsSpendable(carry(), waiting, now)).toBe(false);
    expect(grantShouldExpire(carry(), waiting, now)).toBe(false);
    expect(grantShouldExpire(carry(), free(), now)).toBe(true);
    // Welcome credits never depend on a plan.
    const welcome = carry({ source: "welcome", subscriptionId: null, expiresAt: null });
    expect(grantIsSpendable(welcome, free(), now)).toBe(true);
    expect(grantShouldExpire(welcome, free(), now)).toBe(false);
    expect(grantShouldExpire(carry({ status: "exhausted" }), free(), now)).toBe(false);
  });
});

describe("spend order", () => {
  const now = d("2026-10-20T00:00:00Z");
  it("spends soonest-expiring first: promo, then carried, then the cycle, then welcome, then purchased", () => {
    const wallet = paid({ monthlyCreditsRemaining: 10, balance: 7 });
    const grants = [carry({ id: 2, expiresAt: d("2026-11-06T00:00:00Z") }), carry({ id: 3, source: "welcome", subscriptionId: null, expiresAt: null, creditsRemaining: 3 })];
    const buckets = spendableBuckets({ wallet, carryover: 1, grants, promo: { grantId: 9, credits: 2, expiresAt: d("2026-10-30T00:00:00Z") }, now });
    expect(buckets.map(bucket => bucket.bucket)).toEqual(["promo", "carryover", "cycle", "welcome", "purchased"]);
    expect(allocateSpend(buckets, 9)).toEqual({ allocations: [{ bucket: "promo", credits: 2, grantId: 9 }, { bucket: "carryover", credits: 4, grantId: 2 }, { bucket: "cycle", credits: 3, grantId: null }], shortfall: 0 });
    expect(allocateSpend(buckets, 30).shortfall).toBe(4);
  });

  it("orders Land's while-subscribed credits oldest carried first, ties by grant id", () => {
    const ordered = orderBuckets([
      { bucket: "cycle", credits: 5, expiresAt: null, grantId: null },
      { bucket: "carryover", credits: 1, expiresAt: null, grantId: 8 },
      { bucket: "carryover", credits: 1, expiresAt: null, grantId: 4 },
      { bucket: "purchased", credits: 1, expiresAt: null, grantId: null },
      { bucket: "welcome", credits: 0, expiresAt: null, grantId: 2 },
    ]);
    expect(ordered.map(bucket => `${bucket.bucket}${bucket.grantId ?? ""}`)).toEqual(["carryover4", "carryover8", "cycle", "purchased"]);
  });

  it("refuses non-positive or fractional spends", () => {
    expect(() => allocateSpend([], 0)).toThrow();
    expect(() => allocateSpend([], 1.5)).toThrow();
  });

  it("a paid plan past its term end cannot spend its cycle credits", () => {
    const waiting = paid({ subscriptionCurrentTermEnd: d("2026-10-19T00:00:00Z"), balance: 2 });
    expect(spendableBuckets({ wallet: waiting, carryover: 1, grants: [], promo: null, now }).map(bucket => bucket.bucket)).toEqual(["purchased"]);
  });
});

describe("ledger summary", () => {
  it("reports buckets, cycle usage, the next expiry and plan credits expiring within 7 days", () => {
    const now = d("2026-11-01T00:00:00Z");
    const wallet = paid({ monthlyCreditsRemaining: 6, balance: 5 });
    const summary = buildCreditsLedger({ wallet, rules: { creditsPerMonth: 10, carryover: 1 }, grants: [carry({ expiresAt: d("2026-11-06T00:00:00Z"), creditsRemaining: 3 }), carry({ id: 5, source: "welcome", subscriptionId: null, expiresAt: null, tokenCount: 3, creditsRemaining: 1 })], promo: null, usedThisCycle: 6, now });
    expect(creditsLedgerSchema.parse(summary)).toEqual({
      balance: 6 + 3 + 1 + 5,
      buckets: { cycle: 6, carriedOver: 3, trial: 0, welcome: 1, purchased: 5, promo: 0 },
      creditsPerMonth: 10,
      carryover: 1,
      cycle: { key: "2026-10", startsAt: "2026-10-06T00:00:00.000Z", endsAt: "2026-11-06T00:00:00.000Z", granted: 10, used: 6 },
      planCreditsRemaining: 9,
      nextExpiry: { credits: 3, expiresAt: "2026-11-06T00:00:00.000Z" },
      planCreditsExpiringSoon: { credits: 3, expiresAt: "2026-11-06T00:00:00.000Z" },
      welcome: { granted: true, credits: 3, remaining: 1 },
    });
  });

  it("a cancelling plan's cycle credits expire with the term", () => {
    const now = d("2026-11-01T00:00:00Z");
    const summary = buildCreditsLedger({ wallet: paid({ subscriptionStatus: "non_renewing", monthlyCreditsRemaining: 4 }), rules: { creditsPerMonth: 10, carryover: 1 }, grants: [], promo: null, usedThisCycle: 0, now });
    expect(summary.planCreditsExpiringSoon).toEqual({ credits: 4, expiresAt: "2026-11-06T00:00:00.000Z" });
  });

  it("a Free account shows no plan credits and no welcome grant until one exists", () => {
    const summary = buildCreditsLedger({ wallet: free({ balance: 2 }), rules: { creditsPerMonth: 0, carryover: 0 }, grants: [], promo: null, usedThisCycle: 0, now: d("2026-10-10T00:00:00Z") });
    expect(summary).toMatchObject({ balance: 2, planCreditsRemaining: 0, nextExpiry: null, planCreditsExpiringSoon: null, welcome: { granted: false, credits: 0, remaining: 0 } });
    expect(EXPIRING_SOON_MS).toBe(7 * DAY);
  });

  it("counts a cycle's spends net of refunds and ignores grants and moves", () => {
    expect(usedInCycle([{ kind: "credit_spend", tokenCount: -3 }, { kind: "direct_request", tokenCount: -1 }, { kind: "expiry_refund", tokenCount: 1 }, { kind: "plan_grant", tokenCount: 10 }, { kind: "plan_credit_carryover", tokenCount: -4 }])).toBe(3);
  });
});

describe("reverse trial credits", () => {
  const trial = (patch: Partial<LedgerGrant> = {}): LedgerGrant => ({ id: 9, source: "trial", subscriptionId: null, tokenCount: 5, creditsRemaining: 5, expiresAt: d("2026-10-28T00:00:00Z"), status: "active", ...patch });

  it("are spendable on Free until the trial ends, then expire with a ledger row", () => {
    const wallet = free({ monthlyCreditsRemaining: 2, monthlyAllowance: 2 });
    expect(grantIsSpendable(trial(), wallet, d("2026-10-20T00:00:00Z"))).toBe(true);
    expect(grantExpiresAt(trial(), wallet, d("2026-10-20T00:00:00Z"))).toEqual(d("2026-10-28T00:00:00Z"));
    expect(grantIsSpendable(trial(), wallet, d("2026-10-28T00:00:00Z"))).toBe(false);
    expect(grantShouldExpire(trial(), wallet, d("2026-10-28T00:00:00Z"))).toBe(true);
    expect(grantShouldExpire(trial(), wallet, d("2026-10-27T23:59:59Z"))).toBe(false);
  });

  it("spend before Free's month credits and the welcome credits (they end sooner) and count in the summary", () => {
    const now = d("2026-10-20T00:00:00Z");
    const wallet = free({ monthlyCreditsRemaining: 2, monthlyAllowance: 2, balance: 1 });
    const grants = [trial({ creditsRemaining: 4 }), carry({ id: 3, source: "welcome", subscriptionId: null, expiresAt: null, tokenCount: 3, creditsRemaining: 3 })];
    const buckets = spendableBuckets({ wallet, carryover: 0, grants, promo: null, now });
    expect(buckets.map(bucket => bucket.bucket)).toEqual(["trial", "cycle", "welcome", "purchased"]);
    expect(allocateSpend(buckets, 5).allocations).toEqual([{ bucket: "trial", credits: 4, grantId: 9 }, { bucket: "cycle", credits: 1, grantId: null }]);
    const summary = creditsLedgerSchema.parse(buildCreditsLedger({ wallet, rules: { creditsPerMonth: 2, carryover: 0 }, grants, promo: null, usedThisCycle: 1, now }));
    expect(summary).toMatchObject({ balance: 4 + 2 + 3 + 1, buckets: { cycle: 2, carriedOver: 0, trial: 4, welcome: 3, purchased: 1, promo: 0 }, nextExpiry: { credits: 4, expiresAt: "2026-10-28T00:00:00.000Z" } });
  });
});

describe("wire contracts", () => {
  it("ledger entries are strict and signed", () => {
    const entry = { id: 4, kind: "plan_grant", credits: 10, bucket: "cycle", reference: { type: "plan_cycle", id: "2026-10:abc" }, createdAt: "2026-10-06T00:00:00.000Z" };
    expect(creditLedgerEntrySchema.parse(entry)).toEqual(entry);
    expect(creditLedgerEntrySchema.safeParse({ ...entry, userId: 7 }).success).toBe(false);
    expect(creditLedgerEntrySchema.safeParse({ ...entry, kind: "gift" }).success).toBe(false);
    expect(creditLedgerEntrySchema.safeParse({ ...entry, credits: 1.5 }).success).toBe(false);
  });

  it("the ledger query defaults to the seeker's last 50 rows and caps the page", () => {
    expect(creditLedgerQuerySchema.parse({})).toEqual({ role: "job_seeker", limit: 50 });
    expect(creditLedgerQuerySchema.parse({ role: "referrer", limit: "10" })).toEqual({ role: "referrer", limit: 10 });
    expect(creditLedgerQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(creditLedgerQuerySchema.safeParse({ role: "admin" }).success).toBe(false);
  });

  it("spend keys are short, opaque and safe to suffix", () => {
    expect(spendIdempotencyKeySchema.safeParse("tool-run:1234abcd").success).toBe(true);
    expect(spendIdempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(spendIdempotencyKeySchema.safeParse("x".repeat(57)).success).toBe(false);
    expect(spendIdempotencyKeySchema.safeParse("has space 12345").success).toBe(false);
  });
});
