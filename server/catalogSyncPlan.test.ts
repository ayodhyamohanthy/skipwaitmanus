import { describe, expect, it } from "vitest";
import { resolveItemPrice } from "../shared/billingCatalog";
import { catalogSyncDryRunSchema, type CatalogSyncAction, type CatalogSyncDryRun } from "../shared/catalogSync";
import { CATALOG_PACK_IDS, CATALOG_PLANS, CREDIT_PACKS, catalogItemPriceId, catalogPackItemPriceId } from "../shared/planCatalog";
import { PLAN_CREDIT_LADDER, PLAN_FAMILY } from "../shared/planFamily";
import { packItemPriceId as v2PackItemPriceId, planCreditsItemPriceId as v2CreditsItemPriceId, planItemPriceId as v2PlanItemPriceId } from "../shared/planFamilyBilling";
import { itemPriceMatches } from "./billingAvailability";
import { desiredCatalog, excludedItemPrices } from "./catalogSyncDesired";
import { planCatalogSync, type CatalogSiteState } from "./catalogSyncPlan";
import { providerItemFor, providerItemPriceFor, syncedSiteState } from "./catalogSyncFixtures";

const EMPTY: CatalogSiteState = { families: [], items: [], itemPrices: [] };
const CHECKED_AT = new Date("2026-10-18T10:00:00.000Z");

function plan(state: CatalogSiteState, options: { site?: string; environment?: "test" | "live"; checkedAt?: Date } = {}): CatalogSyncDryRun {
  const dryRun = planCatalogSync({ desired: desiredCatalog(), excluded: excludedItemPrices(), state, site: options.site ?? "skipwait", environment: options.environment ?? "live", checkedAt: options.checkedAt ?? CHECKED_AT });
  // Every dry run the planner produces is a valid contract instance.
  expect(catalogSyncDryRunSchema.safeParse(dryRun).success).toBe(true);
  return dryRun;
}

const ids = (actions: readonly CatalogSyncAction[], kind: CatalogSyncAction["kind"]) => actions.filter(action => action.kind === kind).map(action => action.params.id);
const specFor = (id: string) => {
  const entry = desiredCatalog().find(candidate => candidate.spec.id === id);
  if (!entry) throw new Error(`no desired price ${id}`);
  return entry;
};
/** The synced site with one item price replaced (or removed with `null`). */
function withPrice(id: string, replace: ((price: ReturnType<typeof providerItemPriceFor>) => ReturnType<typeof providerItemPriceFor>) | null): CatalogSiteState {
  const state = syncedSiteState();
  return { ...state, itemPrices: state.itemPrices.flatMap(price => (price.id === id ? (replace ? [replace(price)] : []) : [price])) };
}

const EXPECTED_IDS = [
  "skipwait_pack_2-INR", "skipwait_pack_5-USD", "skipwait_pack_25-INR", "skipwait_pack_25-USD", "skipwait_pack_60-INR", "skipwait_pack_60-USD", "skipwait_pack_150-INR", "skipwait_pack_150-USD",
  "skipwait_keep_warm_yearly-INR", "skipwait_keep_warm_yearly-USD",
  ...["start", "momentum", "land_focus", "land_sprint"].flatMap(plan => ["30d", "90d"].flatMap(term => ["INR", "USD"].map(currency => `skipwait_${plan}_${term}-${currency}`))),
  ...["fast_track", "insider"].flatMap(plan => ["INR", "USD"].map(currency => `skipwait_v2plan_${plan}-${currency}`)),
  ...[5, 10, 25, 50, 100, 200].flatMap(rung => ["INR", "USD"].flatMap(currency => [`skipwait_v2credits_${rung}-${currency}`, `skipwait_v2pack_${rung}-${currency}`])),
].sort();

describe("desired catalog", () => {
  it("is exactly the 54 sold item prices (26 kit + 28 v2), derived from shared/planCatalog.ts and shared/planFamily.ts", () => {
    const desired = desiredCatalog();
    expect(desired.map(entry => entry.spec.id).sort()).toEqual(EXPECTED_IDS);
    const fromCatalog = [
      ...CREDIT_PACKS.flatMap(pack => (["USD", "INR"] as const).flatMap(currency => (pack.prices[currency] === undefined ? [] : [catalogPackItemPriceId(pack.id, currency)]))),
      ...CATALOG_PLANS.filter(plan => !plan.byApplication).flatMap(plan => (["30d", "90d", "yearly"] as const).flatMap(term => (plan.prices[term] ? (["USD", "INR"] as const).map(currency => catalogItemPriceId(plan.id, term, currency)) : []))),
      ...PLAN_FAMILY.filter(plan => plan.id !== "open_door").flatMap(plan => (["INR", "USD"] as const).map(currency => v2PlanItemPriceId(plan.id, currency))),
      ...PLAN_CREDIT_LADDER.flatMap(rung => (["INR", "USD"] as const).flatMap(currency => [v2CreditsItemPriceId(rung.credits, currency), v2PackItemPriceId(rung.credits, currency)])),
    ];
    expect(fromCatalog.sort()).toEqual(EXPECTED_IDS);
    const amount = (id: string) => specFor(id).spec.price;
    expect(amount("skipwait_pack_2-INR")).toBe(9900);
    expect(amount("skipwait_pack_5-USD")).toBe(500);
    expect(amount("skipwait_pack_25-INR")).toBe(119900);
    expect(amount("skipwait_pack_150-USD")).toBe(10500);
    expect(amount("skipwait_momentum_90d-INR")).toBe(249900);
    expect(amount("skipwait_land_sprint_90d-INR")).toBe(2799900);
    expect(amount("skipwait_keep_warm_yearly-USD")).toBe(2900);
    for (const id of desired.map(entry => entry.spec.id)) expect(id).not.toMatch(/land_concierge|written_review|live_session|skipwait_pro_|skipwait_max_|skipwait_token_/);
    expect(new Set(desired.map(entry => entry.item.id))).toEqual(new Set([...CATALOG_PACK_IDS.map(id => `skipwait_${id}`), "skipwait_keep_warm", "skipwait_start", "skipwait_momentum", "skipwait_land_focus", "skipwait_land_sprint", "skipwait_v2plan_fast_track", "skipwait_v2plan_insider", ...[5, 10, 25, 50, 100, 200].flatMap(rung => [`skipwait_v2credits_${rung}`, `skipwait_v2pack_${rung}`])]));
  });

  it("excludes Concierge (by application) and the human sessions, each with a reason", () => {
    const excluded = excludedItemPrices();
    expect(excluded.map(entry => entry.itemPriceId).sort()).toEqual(["skipwait_land_concierge_30d-INR", "skipwait_land_concierge_30d-USD", "skipwait_land_concierge_90d-INR", "skipwait_land_concierge_90d-USD", "skipwait_live_session-INR", "skipwait_live_session-USD", "skipwait_written_review-INR", "skipwait_written_review-USD"]);
    for (const entry of excluded) expect(entry.reason.length).toBeGreaterThan(10);
  });

  it("sells every desired price exactly as checkout and billingAvailability expect", () => {
    for (const entry of desiredCatalog()) {
      const resolved = resolveItemPrice(entry.spec.id);
      expect(resolved, entry.spec.id).toEqual(entry.price);
      // D-067 retired Pro/Max, so the price book no longer carries a legacy flag.
      expect(resolved?.itemPriceId).toBe(entry.spec.id);
      expect(entry.spec.currencyCode).toBe(entry.price.currency);
      expect(entry.spec.price).toBe(entry.price.amount);
      // Creating exactly this spec flips /api/plans/catalog to available.
      expect(itemPriceMatches(providerItemPriceFor(entry.spec), entry.price), entry.spec.id).toBe(true);
    }
  });

  it("makes packs per_unit charges with no period, passes flat_fee plans at 1 or 3 months for one cycle, Keep warm one year for one cycle", () => {
    for (const { spec, item, price } of desiredCatalog()) {
      expect(spec.name).toBe(spec.id);
      expect(item.name).toBe(item.id);
      expect(spec.itemId).toBe(item.id);
      if (price.kind === "v2pack") {
        expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "charge", pricingModel: "per_unit", period: null, periodUnit: null, billingCycles: null });
        expect(item).toMatchObject({ type: "charge", enabledInPortal: null });
        continue;
      }
      if (price.kind === "v2plan") {
        // The bundle runs until cancelled: no billing-cycles cap (D-132).
        expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "plan", pricingModel: "flat_fee", period: 1, periodUnit: "month", billingCycles: null });
        expect(item).toMatchObject({ type: "plan", enabledInPortal: false });
        continue;
      }
      if (price.kind === "v2credits") {
        // The in-plan monthly rung is an addon: a subscription holds one plan plus addons.
        expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "addon", pricingModel: "flat_fee", period: 1, periodUnit: "month", billingCycles: null });
        expect(item).toMatchObject({ type: "addon", enabledInPortal: false });
        continue;
      }
      if (price.kind === "pack") {
        expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "charge", pricingModel: "per_unit", period: null, periodUnit: null, billingCycles: null });
        expect(item).toMatchObject({ type: "charge", enabledInPortal: null });
        expect(spec.externalName).toBe(`${price.credits} credits`);
        continue;
      }
      const expectedPeriod = price.interval === "yearly" ? { period: 1, periodUnit: "year" } : price.interval === "90d" ? { period: 3, periodUnit: "month" } : { period: 1, periodUnit: "month" };
      expect({ itemType: spec.itemType, pricingModel: spec.pricingModel, period: spec.period, periodUnit: spec.periodUnit, billingCycles: spec.billingCycles }).toEqual({ itemType: "plan", pricingModel: "flat_fee", ...expectedPeriod, billingCycles: 1 });
      expect(item).toMatchObject({ type: "plan", enabledInPortal: false });
    }
    expect(specFor("skipwait_keep_warm_yearly-INR").spec.externalName).toBe("Keep warm, 1 year");
    expect(specFor("skipwait_land_focus_90d-USD").spec.externalName).toBe("Land Focus, 90 days");
    expect(specFor("skipwait_start_30d-INR").item.externalName).toBe("Start");
  });
});

describe("planCatalogSync", () => {
  it("plans the family, 24 items and 54 prices on an empty site, in execution order", () => {
    const dryRun = plan(EMPTY);
    expect(dryRun.family).toMatchObject({ id: "skipwait", action: "create" });
    expect(dryRun.toCreate[0]).toEqual({ kind: "item_family", params: { id: "skipwait", name: "SkipWait" } });
    expect(dryRun.toCreate.slice(1, 25).every(action => action.kind === "item")).toBe(true);
    expect(dryRun.toCreate.slice(25).every(action => action.kind === "item_price")).toBe(true);
    expect(dryRun.toCreate).toHaveLength(79);
    // Items in the order their first price needs them: pack items first, then plan items.
    expect(ids(dryRun.toCreate, "item")).toEqual(["skipwait_pack_2", "skipwait_pack_25", "skipwait_pack_60", "skipwait_pack_150", "skipwait_pack_5", "skipwait_start", "skipwait_momentum", "skipwait_land_focus", "skipwait_land_sprint", "skipwait_keep_warm", "skipwait_v2plan_fast_track", "skipwait_v2plan_insider", "skipwait_v2credits_5", "skipwait_v2pack_5", "skipwait_v2credits_10", "skipwait_v2pack_10", "skipwait_v2credits_25", "skipwait_v2pack_25", "skipwait_v2credits_50", "skipwait_v2pack_50", "skipwait_v2credits_100", "skipwait_v2pack_100", "skipwait_v2credits_200", "skipwait_v2pack_200"]);
    for (const action of dryRun.toCreate) {
      // Items and prices are named after their ids; the family keeps its human name ("SkipWait").
      if (action.kind === "item") {
        expect(action.params.itemFamilyId).toBe("skipwait");
        expect(action.params.name).toBe(action.params.id);
      }
      if (action.kind === "item_price") expect(action.params.name).toBe(action.params.id);
    }
    // Prices: packs, then 30-day passes, then the yearly Keep warm, then 90-day passes (the likeliest provider refusal last).
    const terms = dryRun.toCreate.flatMap(action => (action.kind === "item_price" ? [action.params.itemType === "charge" ? "pack" : action.params.periodUnit === "year" ? "yearly" : action.params.period === 3 ? "90d" : "30d"] : []));
    expect(terms).toEqual([...Array(8).fill("pack"), ...Array(8).fill("30d"), "yearly", "yearly", ...Array(8).fill("90d"), ...Array(2).fill([...Array(2).fill("30d"), ...Array(6).fill(["30d", "pack"]).flat()]).flat()]);
    expect(ids(dryRun.toCreate, "item_price").slice(0, 4)).toEqual(["skipwait_pack_2-INR", "skipwait_pack_25-INR", "skipwait_pack_60-INR", "skipwait_pack_150-INR"]);
    expect(dryRun.counts).toEqual({ desired: 54, correct: 0, mismatched: 0, blocked: 0, toCreate: 79, itemPricesToCreate: 54, extras: 0, excluded: 8 });
  });

  it("calls an exact existing price correct and queues nothing for it; a Keep warm year set as 12 months is also correct", () => {
    const synced = plan(syncedSiteState());
    expect(synced.toCreate).toEqual([]);
    expect(synced.correct.map(entry => entry.itemPriceId).sort()).toEqual(EXPECTED_IDS);
    expect(synced.family).toMatchObject({ id: "skipwait_credits", action: "reuse" });
    const twelveMonths = plan(withPrice("skipwait_keep_warm_yearly-USD", price => ({ ...price, period: 12, period_unit: "month" })));
    expect(twelveMonths.correct.map(entry => entry.itemPriceId)).toContain("skipwait_keep_warm_yearly-USD");
    expect(twelveMonths.toCreate).toEqual([]);
  });

  it("flags price, currency, period, archived, pricing-model and billing-cycle differences as mismatched, never queued", () => {
    const cases = [
      { id: "skipwait_pack_25-INR", patch: { price: 119000 }, field: "price", expected: 119900, actual: 119000, sellableNow: false },
      { id: "skipwait_pack_25-USD", patch: { currency_code: "EUR" }, field: "currency_code", expected: "USD", actual: "EUR", sellableNow: false },
      { id: "skipwait_start_90d-INR", patch: { period: 1 }, field: "period", expected: "3 months", actual: "1 month", sellableNow: false },
      { id: "skipwait_momentum_30d-USD", patch: { status: "archived" }, field: "status", expected: "active", actual: "archived", sellableNow: false },
      { id: "skipwait_pack_60-INR", patch: { pricing_model: "flat_fee" }, field: "pricing_model", expected: "per_unit", actual: "flat_fee", sellableNow: true },
      { id: "skipwait_land_sprint_30d-USD", patch: { billing_cycles: undefined }, field: "billing_cycles", expected: 1, actual: null, sellableNow: true },
    ] as const;
    for (const fixture of cases) {
      const dryRun = plan(withPrice(fixture.id, price => ({ ...price, ...fixture.patch })));
      const entry = dryRun.mismatched.find(candidate => candidate.itemPriceId === fixture.id);
      expect(entry, fixture.id).toBeDefined();
      expect(entry?.diffs).toEqual([{ field: fixture.field, expected: fixture.expected, actual: fixture.actual }]);
      expect(entry?.sellableNow).toBe(fixture.sellableNow);
      expect(dryRun.toCreate).toEqual([]);
      expect(dryRun.correct.map(candidate => candidate.itemPriceId)).not.toContain(fixture.id);
    }
  });

  it("plans a deleted price as a create (Chargebee lets a deleted id be reused)", () => {
    const dryRun = plan(withPrice("skipwait_pack_150-USD", price => ({ ...price, status: "deleted" })));
    expect(dryRun.toCreate).toEqual([{ kind: "item_price", params: specFor("skipwait_pack_150-USD").spec }]);
    const missing = plan(withPrice("skipwait_pack_150-USD", null));
    expect(missing.toCreate).toEqual([{ kind: "item_price", params: specFor("skipwait_pack_150-USD").spec }]);
    expect(missing.planHash).toBe(dryRun.planHash);
  });

  it("lists namespace objects outside the catalog as extras with notes and leaves them alone", () => {
    const state = syncedSiteState();
    const legacy = (id: string, itemId: string, currency: string, price: number) => ({ id, name: id, item_id: itemId, item_type: "charge", status: "active", currency_code: currency, price, pricing_model: "per_unit" });
    const dryRun = plan({
      ...state,
      items: [...state.items, { id: "skipwait_token_1", name: "skipwait_token_1", type: "charge", status: "active", item_family_id: "skipwait_credits" }, { id: "skipwait_pro", name: "Pro", type: "plan", status: "active", item_family_id: "skipwait_credits" }],
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

  it("blocks prices on a wrong-type, archived or checkout-disabled item, and on a currency and frequency another price holds", () => {
    const state: CatalogSiteState = { families: [{ id: "skipwait_credits", name: "SkipWait Credits" }], items: [
      providerItemFor(specFor("skipwait_pack_25-INR").item, "skipwait_credits", { type: "plan" }),
      providerItemFor(specFor("skipwait_start_30d-INR").item, "skipwait_credits", { status: "archived" }),
      providerItemFor(specFor("skipwait_momentum_30d-INR").item, "skipwait_credits", { enabled_for_checkout: false }),
      providerItemFor(specFor("skipwait_land_focus_30d-INR").item, "skipwait_credits"),
    ], itemPrices: [{ id: "skipwait_land_focus_monthly-INR", name: "skipwait_land_focus_monthly-INR", item_id: "skipwait_land_focus", item_type: "plan", status: "active", currency_code: "INR", price: 500000, pricing_model: "flat_fee", period: 1, period_unit: "month" }] };
    const dryRun = plan(state);
    const reasons = Object.fromEntries(dryRun.blocked.map(entry => [entry.itemPriceId, entry.reason]));
    for (const id of ["skipwait_pack_25-INR", "skipwait_pack_25-USD"]) expect(reasons[id]).toMatch(/exists as a plan/);
    for (const id of ["skipwait_start_30d-INR", "skipwait_start_90d-USD"]) expect(reasons[id]).toMatch(/archived/);
    for (const id of ["skipwait_momentum_30d-INR", "skipwait_momentum_90d-INR"]) expect(reasons[id]).toMatch(/[Cc]heckout is switched off/);
    expect(reasons["skipwait_land_focus_30d-INR"]).toMatch(/skipwait_land_focus_monthly-INR/);
    expect(Object.keys(reasons)).toHaveLength(2 + 4 + 4 + 1);
    const itemIds = ids(dryRun.toCreate, "item");
    for (const id of ["skipwait_pack_25", "skipwait_start", "skipwait_momentum", "skipwait_land_focus"]) expect(itemIds).not.toContain(id);
    const priceIds = ids(dryRun.toCreate, "item_price");
    for (const id of Object.keys(reasons)) expect(priceIds).not.toContain(id);
    // Everything else still plans normally, including the other land_focus prices.
    expect(priceIds).toEqual(expect.arrayContaining(["skipwait_land_focus_30d-USD", "skipwait_land_focus_90d-INR", "skipwait_pack_2-INR", "skipwait_keep_warm_yearly-INR"]));
    expect(priceIds).toHaveLength(54 - 11);
  });

  it("reuses the one family existing SkipWait prices use, creates 'skipwait' when there is none, and blocks new items when there are several", () => {
    const legacyIn = (family: string, suffix: string) => ({ item: { id: `skipwait_token_${suffix}`, name: `skipwait_token_${suffix}`, type: "charge", status: "active", item_family_id: family }, price: { id: `skipwait_token_${suffix}-INR`, name: `skipwait_token_${suffix}-INR`, item_id: `skipwait_token_${suffix}`, item_family_id: family, item_type: "charge", status: "active", currency_code: "INR", price: 9900, pricing_model: "per_unit" } });
    const one = legacyIn("skipwait_credits", "1");
    const reused = plan({ families: [{ id: "skipwait_credits", name: "skipwait Credits" }, { id: "other", name: "Other" }], items: [one.item], itemPrices: [one.price] });
    expect(reused.family).toMatchObject({ id: "skipwait_credits", action: "reuse" });
    expect(reused.toCreate.some(action => action.kind === "item_family")).toBe(false);
    for (const action of reused.toCreate) if (action.kind === "item") expect(action.params.itemFamilyId).toBe("skipwait_credits");

    expect(plan(EMPTY).family.action).toBe("create");
    const existingSkipwait = plan({ families: [{ id: "skipwait", name: "SkipWait" }], items: [], itemPrices: [] });
    expect(existingSkipwait.family).toMatchObject({ id: "skipwait", action: "reuse" });

    const noFamily = plan({ families: [], items: [{ ...one.item, item_family_id: undefined }], itemPrices: [{ ...one.price, item_family_id: undefined }] });
    expect(noFamily.family).toMatchObject({ id: null, action: "none" });
    for (const action of noFamily.toCreate) if (action.kind === "item") expect(action.params.itemFamilyId).toBeNull();

    const two = legacyIn("legacy_family", "5");
    const ambiguous = plan({ families: [], items: [one.item, two.item], itemPrices: [one.price, two.price] });
    expect(ambiguous.family.action).toBe("blocked");
    expect(ambiguous.family.reason).toMatch(/legacy_family/);
    expect(ambiguous.toCreate.filter(action => action.kind !== "item_price")).toEqual([]);
    expect(ambiguous.blocked).toHaveLength(54);
  });

  it("keeps the planHash stable across listing order and volatile fields, and changes it with any planned action, classification, site or environment", () => {
    const base = withPrice("skipwait_pack_25-INR", price => ({ ...price, price: 119000 }));
    const reference = plan(base);
    expect(reference.planHash).toMatch(/^[0-9a-f]{64}$/);
    const shuffled = { families: [...base.families].reverse(), items: [...base.items].reverse(), itemPrices: [...base.itemPrices].reverse() };
    expect(plan(shuffled).planHash).toBe(reference.planHash);
    const volatile = { ...base, itemPrices: base.itemPrices.map(price => ({ ...price, updated_at: 1_760_000_000, resource_version: 99 })) };
    expect(plan(volatile).planHash).toBe(reference.planHash);
    expect(plan(base, { checkedAt: new Date("2026-10-19T00:00:00.000Z") }).planHash).toBe(reference.planHash);
    expect(plan(withPrice("skipwait_pack_25-INR", price => ({ ...price, price: 118000 }))).planHash).not.toBe(reference.planHash);
    expect(plan({ ...base, itemPrices: base.itemPrices.filter(price => price.id !== "skipwait_pack_60-USD") }).planHash).not.toBe(reference.planHash);
    expect(plan(base, { site: "skipwait-test" }).planHash).not.toBe(reference.planHash);
    expect(plan(base, { environment: "test" }).planHash).not.toBe(reference.planHash);
  });
});
