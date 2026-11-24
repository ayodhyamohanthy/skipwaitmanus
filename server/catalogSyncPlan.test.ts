import { describe, expect, it } from "vitest";
import { resolveItemPrice } from "../shared/billingCatalog";
import { catalogSyncDryRunSchema, type CatalogSyncAction, type CatalogSyncDryRun } from "../shared/catalogSync";
import { PLAN_FAMILY, REFERRAL_LEVELS } from "../shared/planFamily";
import { desiredCatalog, excludedItemPrices, type DesiredCatalogEntry } from "./catalogSyncDesired";
import { planCatalogSync, type CatalogSiteState } from "./catalogSyncPlan";
import { providerItemFor, providerItemPriceFor, syncedSiteState } from "./catalogSyncFixtures";

const EMPTY: CatalogSiteState = { families: [], items: [], itemPrices: [] };
const CHECKED_AT = new Date("2026-11-20T16:00:00.000Z");
const EXPECTED_IDS = [
  ...PLAN_FAMILY.flatMap(plan => ["INR", "USD"].map(currency => `skipwait_${plan.id}_monthly-${currency}`)),
  ...REFERRAL_LEVELS.flatMap(level => ["INR", "USD"].map(currency => `skipwait_referral_${level}-${currency}`)),
];
function plan(state: CatalogSiteState, options: { site?: string; environment?: "test" | "live"; checkedAt?: Date } = {}): CatalogSyncDryRun {
  const dryRun = planCatalogSync({ desired: desiredCatalog(), excluded: excludedItemPrices(), state, site: options.site ?? "skipwait", environment: options.environment ?? "live", checkedAt: options.checkedAt ?? CHECKED_AT });
  expect(catalogSyncDryRunSchema.parse(dryRun)).toEqual(dryRun);
  return dryRun;
}
const ids = (actions: readonly CatalogSyncAction[], kind: CatalogSyncAction["kind"]) => actions.filter(action => action.kind === kind).map(action => action.params.id);
const specFor = (id: string) => {
  const entry = desiredCatalog().find(candidate => candidate.spec.id === id);
  if (!entry) throw new Error(`no desired price ${id}`);
  return entry;
};
function withPrice(id: string, replace: ((price: ReturnType<typeof providerItemPriceFor>) => ReturnType<typeof providerItemPriceFor>) | null): CatalogSiteState {
  const state = syncedSiteState();
  return { ...state, itemPrices: state.itemPrices.flatMap(price => price.id === id ? (replace ? [replace(price)] : []) : [price]) };
}

describe("desired catalog", () => {
  it("is exactly the 14 banded item prices derived from the frozen family", () => {
    const desired = desiredCatalog();
    expect(desired.map(entry => entry.spec.id)).toEqual(EXPECTED_IDS);
    const amount = (id: string) => specFor(id).spec.price;
    expect(amount("skipwait_early_to_mid_monthly-INR")).toBe(22900);
    expect(amount("skipwait_early_to_mid_monthly-USD")).toBe(449);
    expect(amount("skipwait_mid_to_senior_monthly-INR")).toBe(89900);
    expect(amount("skipwait_senior_to_executive_monthly-USD")).toBe(2599);
    expect(amount("skipwait_referral_mid-INR")).toBe(19900);
    expect(amount("skipwait_referral_executive-USD")).toBe(1600);
    for (const id of desired.map(entry => entry.spec.id)) expect(id).not.toMatch(/pack_|land_|written_review|live_session|skipwait_pro_|skipwait_max_|skipwait_token_/);
    expect(new Set(desired.map(entry => entry.item.id))).toEqual(new Set([...PLAN_FAMILY.map(plan => `skipwait_${plan.id}`), ...REFERRAL_LEVELS.map(level => `skipwait_referral_${level}`)]));
  });

  it("excludes every legacy pack, pass and human session, each with a reason", () => {
    const excluded = excludedItemPrices();
    expect(excluded).toHaveLength(34);
    expect(excluded.map(entry => entry.itemPriceId)).toEqual(expect.arrayContaining(["skipwait_pack_2-INR", "skipwait_pack_5-USD", "skipwait_land_concierge_30d-INR", "skipwait_land_concierge_90d-USD", "skipwait_keep_warm_yearly-INR", "skipwait_live_session-USD", "skipwait_written_review-INR"]));
    expect(new Set(excluded.map(entry => entry.itemPriceId)).size).toBe(34);
    for (const entry of excluded) expect(entry.reason.length).toBeGreaterThan(10);
  });

  it("keeps provider descriptions consistent without making banded prices legacy-checkout billable", () => {
    for (const entry of desiredCatalog()) {
      expect(resolveItemPrice(entry.spec.id)).toBeUndefined();
      expect(entry.price.itemPriceId).toBe(entry.spec.id);
      expect(entry.spec.currencyCode).toBe(entry.price.currency);
      expect(entry.spec.price).toBe(entry.price.amount);
      expect(providerItemPriceFor(entry.spec)).toMatchObject({ id: entry.spec.id, price: entry.price.amount, currency_code: entry.price.currency });
    }
  });

  it("makes extras per_unit charges and monthly plans flat_fee with no fixed-term cancellation", () => {
    for (const { spec, item, price } of desiredCatalog()) {
      expect(spec.name).toBe(spec.id);
      expect(item.name).toBe(item.id);
      expect(spec.itemId).toBe(item.id);
      if (price.kind === "banded_referral") {
        expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "charge", pricingModel: "per_unit", period: null, periodUnit: null, billingCycles: null });
        expect(item).toMatchObject({ type: "charge", enabledInPortal: null });
        expect(spec.externalName).toMatch(/referral request$/);
      } else {
        expect(price.kind).toBe("banded_plan");
        expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "plan", pricingModel: "flat_fee", period: 1, periodUnit: "month", billingCycles: null });
        expect(item).toMatchObject({ type: "plan", enabledInPortal: false });
      }
    }
    expect(specFor("skipwait_early_to_mid_monthly-INR").spec.externalName).toBe("Early to Mid, monthly");
  });
});

describe("planCatalogSync", () => {
  it("plans the family, seven items and 14 prices on an empty site in execution order", () => {
    const dryRun = plan(EMPTY);
    expect(dryRun.family).toMatchObject({ id: "skipwait", action: "create" });
    expect(dryRun.toCreate[0]).toEqual({ kind: "item_family", params: { id: "skipwait", name: "SkipWait" } });
    expect(dryRun.toCreate.slice(1, 8).every(action => action.kind === "item")).toBe(true);
    expect(dryRun.toCreate.slice(8).every(action => action.kind === "item_price")).toBe(true);
    expect(dryRun.toCreate).toHaveLength(22);
    expect(ids(dryRun.toCreate, "item")).toEqual(["skipwait_early_to_mid", "skipwait_mid_to_senior", "skipwait_senior_to_executive", "skipwait_referral_early", "skipwait_referral_mid", "skipwait_referral_senior", "skipwait_referral_executive"]);
    for (const action of dryRun.toCreate) {
      if (action.kind === "item") {
        expect(action.params.itemFamilyId).toBe("skipwait");
        expect(action.params.name).toBe(action.params.id);
      }
      if (action.kind === "item_price") expect(action.params.name).toBe(action.params.id);
    }
    expect(ids(dryRun.toCreate, "item_price")).toEqual(EXPECTED_IDS);
    expect(dryRun.counts).toEqual({ desired: 14, correct: 0, mismatched: 0, blocked: 0, toCreate: 22, itemPricesToCreate: 14, extras: 0, excluded: 34 });
  });

  it("calls exact existing prices correct and preserves the legacy twelve-month yearly equivalence", () => {
    const synced = plan(syncedSiteState());
    expect(synced.toCreate).toEqual([]);
    expect(synced.correct.map(entry => entry.itemPriceId)).toEqual(EXPECTED_IDS);
    expect(synced.family).toMatchObject({ id: "skipwait_credits", action: "reuse" });
    const price = resolveItemPrice("skipwait_keep_warm_yearly-USD");
    if (!price) throw new Error("Missing historical yearly price");
    const entry: DesiredCatalogEntry = {
      price, item: { id: "skipwait_keep_warm", name: "skipwait_keep_warm", type: "plan", externalName: "Keep warm", enabledInPortal: false },
      spec: { id: price.itemPriceId, name: price.itemPriceId, itemId: "skipwait_keep_warm", itemType: "plan", pricingModel: "flat_fee", currencyCode: "USD", price: 2900, externalName: "Keep warm, 1 year", period: 1, periodUnit: "year", billingCycles: 1 },
    };
    const yearly = planCatalogSync({ desired: [entry], excluded: [], state: { families: [], items: [providerItemFor(entry.item, "skipwait_credits")], itemPrices: [{ ...providerItemPriceFor(entry.spec), period: 12, period_unit: "month" }] }, site: "skipwait", environment: "live", checkedAt: CHECKED_AT });
    expect(yearly.correct.map(row => row.itemPriceId)).toEqual([price.itemPriceId]);
    expect(yearly.toCreate).toEqual([]);
  });

  it("flags price, currency, period, archived, pricing-model and billing-cycle differences without queueing updates", () => {
    const cases = [
      { id: "skipwait_referral_mid-INR", patch: { price: 19901 }, field: "price", expected: 19900, actual: 19901 },
      { id: "skipwait_referral_mid-USD", patch: { currency_code: "EUR" }, field: "currency_code", expected: "USD", actual: "EUR" },
      { id: "skipwait_early_to_mid_monthly-INR", patch: { period: 3 }, field: "period", expected: "1 month", actual: "3 months" },
      { id: "skipwait_mid_to_senior_monthly-USD", patch: { status: "archived" }, field: "status", expected: "active", actual: "archived" },
      { id: "skipwait_referral_senior-INR", patch: { pricing_model: "flat_fee" }, field: "pricing_model", expected: "per_unit", actual: "flat_fee" },
      { id: "skipwait_senior_to_executive_monthly-USD", patch: { billing_cycles: 1 }, field: "billing_cycles", expected: null, actual: 1 },
    ] as const;
    for (const fixture of cases) {
      const dryRun = plan(withPrice(fixture.id, price => ({ ...price, ...fixture.patch })));
      const entry = dryRun.mismatched.find(candidate => candidate.itemPriceId === fixture.id);
      expect(entry, fixture.id).toBeDefined();
      expect(entry?.diffs).toEqual([{ field: fixture.field, expected: fixture.expected, actual: fixture.actual }]);
      expect(entry?.sellableNow).toBe(false);
      expect(dryRun.toCreate).toEqual([]);
      expect(dryRun.correct.map(candidate => candidate.itemPriceId)).not.toContain(fixture.id);
    }
  });

  it("plans deleted and missing prices as creates with identical hashes", () => {
    const id = "skipwait_referral_executive-USD";
    const dryRun = plan(withPrice(id, price => ({ ...price, status: "deleted" })));
    expect(dryRun.toCreate).toEqual([{ kind: "item_price", params: specFor(id).spec }]);
    const missing = plan(withPrice(id, null));
    expect(missing.toCreate).toEqual([{ kind: "item_price", params: specFor(id).spec }]);
    expect(missing.planHash).toBe(dryRun.planHash);
  });

  it("lists namespace objects outside the catalog as extras and leaves them alone", () => {
    const state = syncedSiteState();
    const legacy = (id: string, itemId: string, currency: string, price: number) => ({ id, name: id, item_id: itemId, item_type: "charge", status: "active", currency_code: currency, price, pricing_model: "per_unit" });
    const dryRun = plan({ ...state,
      items: [...state.items, { id: "skipwait_token_1", type: "charge", status: "active", item_family_id: "skipwait_credits" }, { id: "skipwait_pro", type: "plan", status: "active", item_family_id: "skipwait_credits" }],
      itemPrices: [...state.itemPrices, legacy("skipwait_token_1-INR", "skipwait_token_1", "INR", 9900), { ...legacy("skipwait_pro_monthly-USD", "skipwait_pro", "USD", 700), item_type: "plan", period: 1, period_unit: "month" }, legacy("skipwait_land_concierge_30d-INR", "skipwait_land_concierge", "INR", 3499900), legacy("skipwait_written_review-USD", "skipwait_written_review", "USD", 4900)],
    });
    expect(dryRun.toCreate).toEqual([]);
    const notes = Object.fromEntries(dryRun.extras.map(extra => [extra.id, extra.note]));
    expect(Object.keys(notes).sort()).toEqual(["skipwait_land_concierge_30d-INR", "skipwait_pro", "skipwait_pro_monthly-USD", "skipwait_token_1", "skipwait_token_1-INR", "skipwait_written_review-USD"]);
    expect(notes["skipwait_token_1-INR"]).toMatch(/legacy/i);
    expect(notes["skipwait_pro_monthly-USD"]).toMatch(/legacy/i);
    expect(notes["skipwait_land_concierge_30d-INR"]).toMatch(/application/i);
    expect(notes["skipwait_written_review-USD"]).toMatch(/session/i);
    for (const extra of dryRun.extras) expect(extra.note).toMatch(/left alone/i);
  });

  it("blocks wrong-type, archived, checkout-disabled and duplicate-frequency items", () => {
    const state: CatalogSiteState = { families: [{ id: "skipwait_credits" }], items: [
      providerItemFor(specFor("skipwait_referral_mid-INR").item, "skipwait_credits", { type: "plan" }),
      providerItemFor(specFor("skipwait_early_to_mid_monthly-INR").item, "skipwait_credits", { status: "archived" }),
      providerItemFor(specFor("skipwait_mid_to_senior_monthly-INR").item, "skipwait_credits", { enabled_for_checkout: false }),
      providerItemFor(specFor("skipwait_senior_to_executive_monthly-INR").item, "skipwait_credits"),
    ], itemPrices: [{ id: "skipwait_senior_to_executive_other-INR", item_id: "skipwait_senior_to_executive", item_type: "plan", status: "active", currency_code: "INR", price: 129900, pricing_model: "flat_fee", period: 1, period_unit: "month" }] };
    const dryRun = plan(state);
    const reasons = Object.fromEntries(dryRun.blocked.map(entry => [entry.itemPriceId, entry.reason]));
    for (const currency of ["INR", "USD"]) {
      expect(reasons[`skipwait_referral_mid-${currency}`]).toMatch(/exists as a plan/);
      expect(reasons[`skipwait_early_to_mid_monthly-${currency}`]).toMatch(/archived/);
      expect(reasons[`skipwait_mid_to_senior_monthly-${currency}`]).toMatch(/[Cc]heckout is switched off/);
    }
    expect(reasons["skipwait_senior_to_executive_monthly-INR"]).toMatch(/skipwait_senior_to_executive_other-INR/);
    expect(Object.keys(reasons)).toHaveLength(7);
    for (const id of ["skipwait_referral_mid", "skipwait_early_to_mid", "skipwait_mid_to_senior", "skipwait_senior_to_executive"]) expect(ids(dryRun.toCreate, "item")).not.toContain(id);
    for (const id of Object.keys(reasons)) expect(ids(dryRun.toCreate, "item_price")).not.toContain(id);
    expect(ids(dryRun.toCreate, "item_price")).toEqual(expect.arrayContaining(["skipwait_senior_to_executive_monthly-USD", "skipwait_referral_early-INR", "skipwait_referral_executive-USD"]));
    expect(ids(dryRun.toCreate, "item_price")).toHaveLength(7);
  });

  it("reuses the one existing family, creates one when absent and blocks ambiguous families", () => {
    const legacyIn = (family: string, suffix: string) => ({ item: { id: `skipwait_token_${suffix}`, type: "charge", status: "active", item_family_id: family }, price: { id: `skipwait_token_${suffix}-INR`, item_id: `skipwait_token_${suffix}`, item_family_id: family, item_type: "charge", status: "active", currency_code: "INR", price: 9900, pricing_model: "per_unit" } });
    const one = legacyIn("skipwait_credits", "1");
    const reused = plan({ families: [{ id: "skipwait_credits" }, { id: "other" }], items: [one.item], itemPrices: [one.price] });
    expect(reused.family).toMatchObject({ id: "skipwait_credits", action: "reuse" });
    expect(reused.toCreate.some(action => action.kind === "item_family")).toBe(false);
    for (const action of reused.toCreate) if (action.kind === "item") expect(action.params.itemFamilyId).toBe("skipwait_credits");
    expect(plan(EMPTY).family.action).toBe("create");
    expect(plan({ families: [{ id: "skipwait" }], items: [], itemPrices: [] }).family).toMatchObject({ id: "skipwait", action: "reuse" });
    const noFamily = plan({ families: [], items: [{ ...one.item, item_family_id: undefined }], itemPrices: [{ ...one.price, item_family_id: undefined }] });
    expect(noFamily.family).toMatchObject({ id: null, action: "none" });
    for (const action of noFamily.toCreate) if (action.kind === "item") expect(action.params.itemFamilyId).toBeNull();
    const two = legacyIn("legacy_family", "5");
    const ambiguous = plan({ families: [], items: [one.item, two.item], itemPrices: [one.price, two.price] });
    expect(ambiguous.family.action).toBe("blocked");
    expect(ambiguous.family.reason).toMatch(/legacy_family/);
    expect(ambiguous.toCreate.filter(action => action.kind !== "item_price")).toEqual([]);
    expect(ambiguous.blocked).toHaveLength(14);
  });

  it("ignores retired (archived or deleted) SkipWait objects when choosing the family, and still blocks two active families (D-387)", () => {
    const legacyIn = (family: string, suffix: string, status = "active") => ({ item: { id: `skipwait_token_${suffix}`, type: "charge", status, item_family_id: family }, price: { id: `skipwait_token_${suffix}-INR`, item_id: `skipwait_token_${suffix}`, item_family_id: family, item_type: "charge", status, currency_code: "INR", price: 9900, pricing_model: "per_unit" } });
    const plans = legacyIn("skipwait_plans", "1");
    const archivedCredits = legacyIn("skipwait_credits", "2", "archived");
    const deletedTopups = legacyIn("skipwait_topups", "3", "deleted");
    // The TEST-site shape: retired packs in two other families, one active family.
    const testSite = plan({ families: [{ id: "skipwait_plans" }, { id: "skipwait_credits" }, { id: "skipwait_topups" }], items: [plans.item, archivedCredits.item, deletedTopups.item], itemPrices: [plans.price, archivedCredits.price, deletedTopups.price] });
    expect(testSite.family).toMatchObject({ id: "skipwait_plans", action: "reuse" });
    expect(testSite.blocked).toEqual([]);
    for (const action of testSite.toCreate) if (action.kind === "item") expect(action.params.itemFamilyId).toBe("skipwait_plans");
    expect(ids(testSite.toCreate, "item_price")).toHaveLength(14);

    // An archived item price alone (its item active elsewhere) does not decide the family either.
    const archivedPriceOnly = plan({ families: [], items: [plans.item], itemPrices: [plans.price, { ...archivedCredits.price, status: "archived" }] });
    expect(archivedPriceOnly.family).toMatchObject({ id: "skipwait_plans", action: "reuse" });

    // Only retired SkipWait objects: plans like an empty site (create-only, D-069).
    const retiredOnly = plan({ families: [{ id: "skipwait_credits" }], items: [archivedCredits.item], itemPrices: [archivedCredits.price] });
    expect(retiredOnly.family).toMatchObject({ id: "skipwait", action: "create" });

    // Two active families still fail closed, naming each family with its active ids, and never the retired ones.
    const activeCredits = legacyIn("skipwait_credits", "4");
    const ambiguous = plan({ families: [], items: [plans.item, activeCredits.item, deletedTopups.item], itemPrices: [plans.price, activeCredits.price, deletedTopups.price] });
    expect(ambiguous.family.action).toBe("blocked");
    expect(ambiguous.family.reason).toContain("skipwait_credits: skipwait_token_4, skipwait_token_4-INR");
    expect(ambiguous.family.reason).toContain("skipwait_plans: skipwait_token_1, skipwait_token_1-INR");
    expect(ambiguous.family.reason).not.toContain("skipwait_topups");
    expect(ambiguous.toCreate.filter(action => action.kind !== "item_price")).toEqual([]);
    expect(ambiguous.blocked).toHaveLength(14);
  });

  it("pins the hash to classifications, actions, site and environment rather than list order or volatile fields", () => {
    const id = "skipwait_referral_mid-INR";
    const base = withPrice(id, price => ({ ...price, price: 19901 }));
    const reference = plan(base);
    expect(reference.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(plan({ families: [...base.families].reverse(), items: [...base.items].reverse(), itemPrices: [...base.itemPrices].reverse() }).planHash).toBe(reference.planHash);
    expect(plan({ ...base, itemPrices: base.itemPrices.map(price => ({ ...price, updated_at: 1_760_000_000, resource_version: 99 })) }).planHash).toBe(reference.planHash);
    expect(plan(base, { checkedAt: new Date("2026-11-21T00:00:00Z") }).planHash).toBe(reference.planHash);
    expect(plan(withPrice(id, price => ({ ...price, price: 19902 }))).planHash).not.toBe(reference.planHash);
    expect(plan({ ...base, itemPrices: base.itemPrices.filter(price => price.id !== "skipwait_referral_senior-USD") }).planHash).not.toBe(reference.planHash);
    expect(plan(base, { site: "skipwait-test" }).planHash).not.toBe(reference.planHash);
    expect(plan(base, { environment: "test" }).planHash).not.toBe(reference.planHash);
  });
});
