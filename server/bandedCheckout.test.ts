import { describe, expect, it, vi } from "vitest";
import {
  BANDED_MAX_REFERRALS_PER_CHECKOUT,
  BANDED_REFUSALS,
  bandedPlanCheckoutRequestSchema,
  bandedReferralCheckoutRequestSchema,
  bandedReferralQuote,
} from "../shared/subscriptionManagement";
import { bandedPlanItemPriceId, bandedReferralItemPriceId } from "../shared/bandedCatalog";
import { VOLUME_DISCOUNTS, planFeeMinor, topUpMinor, type PlanFamilyId } from "../shared/planFamily";
import {
  BANDED_RESERVATION_TTL_MS,
  bandedCheckoutIntentId,
  bandedSalesEnabled,
  startBandedPlanCheckout,
  startBandedReferralCheckout,
  type BandedCheckoutDeps,
} from "./bandedCheckout";
import { fakeBandedDeps, KEY, NOW, runtime } from "./bandedCheckout.fixtures";

const customer = { email: "member@example.com", firstName: "Sam", lastName: "Lee" };
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };
const member = (bandedPlan: PlanFamilyId | null) => vi.fn(async () => ({ bandedPlan, activeSubscription: bandedPlan !== null }));

function untouched(deps: BandedCheckoutDeps) {
  for (const fn of [deps.membership, deps.reserveFoundingPlace, deps.releaseFoundingPlace, deps.lookupItemPrice, deps.createPlanPage, deps.createReferralPage]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

describe("banded sales switch", () => {
  it("is off unless BANDED_SALES_ENABLED is exactly true (case and spaces ignored)", () => {
    expect(bandedSalesEnabled({})).toBe(false);
    for (const value of ["", "false", "1", "yes", "on", "truee"]) expect(bandedSalesEnabled({ BANDED_SALES_ENABLED: value })).toBe(false);
    for (const value of ["true", " TRUE ", "True"]) expect(bandedSalesEnabled({ BANDED_SALES_ENABLED: value })).toBe(true);
  });
});

describe("extra-referral quote (shared, the charge equals it)", () => {
  it("prices each level from the frozen top-up book and discounts by total quantity", () => {
    const quote = bandedReferralQuote([{ level: "mid", quantity: 2 }, { level: "early", quantity: 3 }], "INR");
    const subtotal = 3 * topUpMinor("early", "INR") + 2 * topUpMinor("mid", "INR");
    const pct = VOLUME_DISCOUNTS.find(rung => rung.minQuantity === 5)!.savePct;
    expect(quote).toEqual({
      currency: "INR",
      lines: [
        { level: "early", quantity: 3, unitAmount: topUpMinor("early", "INR"), amount: 3 * topUpMinor("early", "INR") },
        { level: "mid", quantity: 2, unitAmount: topUpMinor("mid", "INR"), amount: 2 * topUpMinor("mid", "INR") },
      ],
      quantity: 5,
      subtotal,
      discountPct: pct,
      discount: Math.round((subtotal * pct) / 100),
      total: subtotal - Math.round((subtotal * pct) / 100),
    });
  });

  it("gives no discount below the first rung", () => {
    const quote = bandedReferralQuote([{ level: "early", quantity: 4 }], "USD");
    expect(quote).toMatchObject({ quantity: 4, discountPct: 0, discount: 0, subtotal: 4 * topUpMinor("early", "USD"), total: 4 * topUpMinor("early", "USD") });
  });

  it("applies every frozen rung at its exact boundary, in whole minor units", () => {
    for (const rung of VOLUME_DISCOUNTS) {
      for (const book of ["INR", "USD"] as const) {
        const quote = bandedReferralQuote([{ level: "senior", quantity: rung.minQuantity }], book);
        expect(quote.discountPct).toBe(rung.savePct);
        expect(Number.isInteger(quote.discount)).toBe(true);
        expect(quote.total).toBe(quote.subtotal - quote.discount);
        const below = bandedReferralQuote([{ level: "senior", quantity: rung.minQuantity - 1 }], book);
        expect(below.discountPct).toBeLessThan(rung.savePct);
      }
    }
  });

  it("never rounds the discount above what the percentage gives", () => {
    const quote = bandedReferralQuote([{ level: "executive", quantity: 7 }, { level: "early", quantity: 6 }], "USD");
    expect(quote.discount).toBeLessThanOrEqual(Math.ceil((quote.subtotal * quote.discountPct) / 100));
    expect(quote.discount).toBeGreaterThanOrEqual(Math.floor((quote.subtotal * quote.discountPct) / 100));
  });
});

describe("banded request contracts", () => {
  it("accepts a plan and billing route with an idempotency key, nothing else", () => {
    expect(bandedPlanCheckoutRequestSchema.safeParse({ planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }).success).toBe(true);
    for (const body of [
      { planId: "early_to_mid", billingCountry: "IN" },
      { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: "not-a-uuid" },
      { planId: "pro", billingCountry: "IN", idempotencyKey: KEY },
      { planId: "early_to_mid", billingCountry: "US", idempotencyKey: KEY },
      { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY, amount: 1 },
      { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY, role: "referrer" },
    ]) expect(bandedPlanCheckoutRequestSchema.safeParse(body).success).toBe(false);
  });

  it("accepts a cart of distinct levels with whole positive quantities up to the checkout limit", () => {
    const ok = { items: [{ level: "early", quantity: 3 }, { level: "mid", quantity: 2 }], billingCountry: "INTL", idempotencyKey: KEY };
    expect(bandedReferralCheckoutRequestSchema.safeParse(ok).success).toBe(true);
    for (const items of [
      [],
      [{ level: "early", quantity: 0 }],
      [{ level: "early", quantity: 1.5 }],
      [{ level: "early", quantity: 1 }, { level: "early", quantity: 2 }],
      [{ level: "staff", quantity: 1 }],
      [{ level: "early", quantity: 1, unitAmount: 1 }],
      [{ level: "early", quantity: BANDED_MAX_REFERRALS_PER_CHECKOUT }, { level: "mid", quantity: 1 }],
    ]) expect(bandedReferralCheckoutRequestSchema.safeParse({ ...ok, items }).success).toBe(false);
    expect(bandedReferralCheckoutRequestSchema.safeParse({ ...ok, items: [{ level: "early", quantity: BANDED_MAX_REFERRALS_PER_CHECKOUT }] }).success).toBe(true);
  });
});

describe("checkout intent ids are the idempotency key", () => {
  it("is stable per site, person, kind and key, distinct otherwise, and fits both provider and table limits", () => {
    const id = bandedCheckoutIntentId("plan", "test", 7, KEY);
    expect(id).toMatch(/^bp_[0-9a-f]{48}$/);
    expect(bandedCheckoutIntentId("plan", "test", 7, KEY)).toBe(id);
    expect(bandedCheckoutIntentId("plan", "live", 7, KEY)).not.toBe(id);
    expect(bandedCheckoutIntentId("plan", "test", 8, KEY)).not.toBe(id);
    expect(bandedCheckoutIntentId("referral", "test", 7, KEY)).toMatch(/^br_[0-9a-f]{48}$/);
    expect(bandedCheckoutIntentId("plan", "test", 7, "11111111-1111-4111-8111-111111111111")).not.toBe(id);
    expect(id.length).toBeLessThanOrEqual(96);
  });
});

describe("plan checkout decision", () => {
  it("answers not_on_sale while the switch is off, before any read, reservation or provider call", async () => {
    const deps = fakeBandedDeps({ salesEnabled: () => false });
    const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.notOnSale });
    untouched(deps);
  });

  it("refuses Senior to Executive as by application before any read or provider call", async () => {
    const deps = fakeBandedDeps();
    const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "senior_to_executive", billingCountry: "INTL", idempotencyKey: KEY }, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 403, code: BANDED_REFUSALS.applicationRequired });
    untouched(deps);
  });

  it("refuses a second subscription before reserving a founding place", async () => {
    const deps = fakeBandedDeps({ membership: vi.fn(async () => ({ bandedPlan: null, activeSubscription: true })) });
    const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "mid_to_senior", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.activeSubscription });
    expect(deps.reserveFoundingPlace).not.toHaveBeenCalled();
    expect(deps.createPlanPage).not.toHaveBeenCalled();
  });

  it("sells the India book with an Indian billing address and the global book otherwise, reserving first", async () => {
    for (const [billingCountry, book] of [["IN", "INR"], ["INTL", "USD"]] as const) {
      const deps = fakeBandedDeps();
      const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry, idempotencyKey: KEY }, customer, urls, deps });
      const checkoutIntentId = bandedCheckoutIntentId("plan", "test", 7, KEY);
      expect(started).toMatchObject({
        ok: true, checkoutIntentId, site: "test",
        price: { kind: "banded_plan", plan: "early_to_mid", currency: book, amount: planFeeMinor("early_to_mid", book), itemPriceId: bandedPlanItemPriceId("early_to_mid", book) },
        checkout: { hostedPageId: "hp_plan" },
      });
      expect(deps.reserveFoundingPlace).toHaveBeenCalledWith({ site: "test", planId: "early_to_mid", userId: 7, checkoutIntentId, now: NOW, expiresAt: new Date(NOW.getTime() + BANDED_RESERVATION_TTL_MS) });
      expect(deps.createPlanPage).toHaveBeenCalledWith(runtime, expect.objectContaining({ itemPriceId: bandedPlanItemPriceId("early_to_mid", book), checkoutIntentId, idempotencyKey: checkoutIntentId, billingCountry, email: "member@example.com", redirectUrl: urls.redirectUrl, cancelUrl: urls.cancelUrl }));
      const reserveOrder = vi.mocked(deps.reserveFoundingPlace).mock.invocationCallOrder[0];
      expect(reserveOrder).toBeLessThan(vi.mocked(deps.createPlanPage!).mock.invocationCallOrder[0]);
    }
  });

  it("holds the reservation well past the provider page's life", () => {
    expect(BANDED_RESERVATION_TTL_MS).toBeGreaterThanOrEqual(2 * 3 * 60 * 60 * 1000);
  });

  it("refuses an item price that is missing or differs from the frozen book, with no reservation", async () => {
    for (const lookupItemPrice of [vi.fn(async () => null), vi.fn(async (_c: unknown, id: string) => ({ id, status: "active", currency_code: "INR", price: 1, item_type: "plan", period: 1, period_unit: "month" }))]) {
      const deps = fakeBandedDeps({ lookupItemPrice });
      const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps });
      expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.notAvailable });
      expect(deps.reserveFoundingPlace).not.toHaveBeenCalled();
      expect(deps.createPlanPage).not.toHaveBeenCalled();
    }
  });

  it("treats a provider that does not answer, or missing billing keys, as an outage (503) with no reservation", async () => {
    for (const over of [{ lookupItemPrice: vi.fn(async () => { throw new Error("timeout"); }) }, { credentials: () => null }] as Partial<BandedCheckoutDeps>[]) {
      const deps = fakeBandedDeps(over);
      const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps });
      expect(started).toMatchObject({ ok: false, status: 503 });
      expect(deps.reserveFoundingPlace).not.toHaveBeenCalled();
      expect(deps.createPlanPage).not.toHaveBeenCalled();
    }
  });

  it("says founding places are taken when the cap is full, never another price, and opens no page", async () => {
    const deps = fakeBandedDeps({ reserveFoundingPlace: vi.fn(async () => ({ status: "full" as const })) });
    const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "mid_to_senior", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps });
    expect(started).toEqual({ ok: false, status: 409, code: BANDED_REFUSALS.foundingFull, error: "Founding places for Mid to Senior are taken. Nothing has been charged." });
    expect(deps.createPlanPage).not.toHaveBeenCalled();
  });

  it("refuses a key already used for another checkout", async () => {
    const deps = fakeBandedDeps({ reserveFoundingPlace: vi.fn(async () => ({ status: "key_used" as const })) });
    const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.checkoutKeyUsed });
    expect(deps.createPlanPage).not.toHaveBeenCalled();
  });

  it("releases its own new reservation when the provider fails, and rethrows", async () => {
    const deps = fakeBandedDeps({ createPlanPage: vi.fn(async () => { throw new Error("provider down"); }) });
    await expect(startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps })).rejects.toThrow("provider down");
    expect(deps.releaseFoundingPlace).toHaveBeenCalledWith({ site: "test", checkoutIntentId: bandedCheckoutIntentId("plan", "test", 7, KEY), now: NOW });
  });

  it("on a replay of the same key reuses the reservation and never releases it on a provider failure", async () => {
    const replay = fakeBandedDeps({ reserveFoundingPlace: vi.fn(async () => ({ status: "existing" as const })) });
    const started = await startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps: replay });
    expect(started).toMatchObject({ ok: true });
    expect(replay.createPlanPage).toHaveBeenCalledWith(runtime, expect.objectContaining({ idempotencyKey: bandedCheckoutIntentId("plan", "test", 7, KEY) }));
    const failing = fakeBandedDeps({ reserveFoundingPlace: vi.fn(async () => ({ status: "existing" as const })), createPlanPage: vi.fn(async () => { throw new Error("in progress"); }) });
    await expect(startBandedPlanCheckout({ userId: 7, request: { planId: "early_to_mid", billingCountry: "IN", idempotencyKey: KEY }, customer, urls, deps: failing })).rejects.toThrow("in progress");
    expect(failing.releaseFoundingPlace).not.toHaveBeenCalled();
  });
});

describe("extra-referral checkout decision", () => {
  const cart = { items: [{ level: "mid" as const, quantity: 2 }, { level: "early" as const, quantity: 3 }], billingCountry: "IN" as const, idempotencyKey: KEY };

  it("answers not_on_sale while the switch is off, before any read or provider call", async () => {
    const deps = fakeBandedDeps({ salesEnabled: () => false });
    const started = await startBandedReferralCheckout({ userId: 7, request: cart, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.notOnSale });
    untouched(deps);
  });

  it("is for plan members only", async () => {
    const deps = fakeBandedDeps({ membership: member(null) });
    const started = await startBandedReferralCheckout({ userId: 7, request: cart, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.noPlan });
    expect(deps.lookupItemPrice).not.toHaveBeenCalled();
    expect(deps.createReferralPage).not.toHaveBeenCalled();
  });

  it("sells only levels inside the member's band; buying never unlocks another level", async () => {
    const deps = fakeBandedDeps({ membership: member("early_to_mid") });
    const started = await startBandedReferralCheckout({ userId: 7, request: { ...cart, items: [{ level: "early", quantity: 1 }, { level: "senior", quantity: 1 }] }, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.outsideBand });
    expect(deps.createReferralPage).not.toHaveBeenCalled();
  });

  it("charges the shared quote: frozen unit prices, level order, and the volume discount as a fixed amount", async () => {
    const deps = fakeBandedDeps({ membership: member("early_to_mid") });
    const started = await startBandedReferralCheckout({ userId: 7, request: cart, customer, urls, deps });
    const quote = bandedReferralQuote(cart.items, "INR");
    const checkoutIntentId = bandedCheckoutIntentId("referral", "test", 7, KEY);
    expect(started).toMatchObject({ ok: true, quote, checkoutIntentId, checkout: { hostedPageId: "hp_referral" } });
    expect(deps.createReferralPage).toHaveBeenCalledWith(runtime, expect.objectContaining({
      currency: "INR", billingCountry: "IN", checkoutIntentId, idempotencyKey: checkoutIntentId, discountAmount: quote.discount,
      lines: [{ itemPriceId: bandedReferralItemPriceId("early", "INR"), quantity: 3 }, { itemPriceId: bandedReferralItemPriceId("mid", "INR"), quantity: 2 }],
    }));
    expect(deps.reserveFoundingPlace).not.toHaveBeenCalled();
  });

  it("refuses the whole cart when any level's item price is not live, before any provider page", async () => {
    const lookupItemPrice = vi.fn(async (_c: unknown, id: string) => (id === bandedReferralItemPriceId("mid", "USD") ? null : { id, status: "active", currency_code: "USD", price: topUpMinor("early", "USD"), item_type: "charge" }));
    const deps = fakeBandedDeps({ membership: member("early_to_mid"), lookupItemPrice });
    const started = await startBandedReferralCheckout({ userId: 7, request: { ...cart, billingCountry: "INTL" }, customer, urls, deps });
    expect(started).toMatchObject({ ok: false, status: 409, code: BANDED_REFUSALS.notAvailable });
    expect(deps.createReferralPage).not.toHaveBeenCalled();
  });
});
