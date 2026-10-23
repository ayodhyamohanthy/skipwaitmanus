import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { billingCustomers, billingInvoices, subscriptionCancellationFeedback, subscriptionCheckoutIntents, tokenBalances } from "../drizzle/schema";
import { checkoutIntentStateSchema, paymentFailureReasonFrom, parseReceiptId, receiptSchema } from "../shared/billingAccount";
import { BILLABLE_PLAN_IDS, INTENT_PLAN_IDS, RETIRED_PLAN_IDS, WALLET_PLAN_IDS, adjacentPlans, billingPlanLabel, isRetiredPlanItemPrice, autoExtendMethods, catalogPackForAmount, planCatalogResponse, planCatalogResponseSchema, planChangeDirection, planPrice, planSellsInterval, resolveItemPrice, sellableItemPrices } from "../shared/billingCatalog";
import * as subscriptionManagement from "../shared/subscriptionManagement";
import { CANCELLATION_REASONS, PLAN_RETIRED_CODE, SUBSCRIPTION_REFUSALS, kitPlanCheckoutRequestSchema, packCheckoutRequestSchema, subscriptionCancelRequestSchema, subscriptionChangeRequestSchema, subscriptionChangeResponseSchema, subscriptionPauseRequestSchema } from "../shared/subscriptionManagement";
import { subscriptionStateFor, type SubscriptionWallet } from "../shared/subscriptionState";
import { CATALOG_PLAN_IDS } from "../shared/planCatalog";
import { DESIRED_COLUMNS, DESIRED_FOREIGN_KEYS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";
// These cases test selling passes, so they run with pass sales on; the shipped
// off state (D-084) is pinned in server/passSalesSwitch.test.ts.
vi.mock("../shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("../shared/planCatalog")>()), PASS_SALES_ENABLED: true }));

const migration = readFileSync(new URL("../drizzle/deploy/0090_subscription_management.sql", import.meta.url), "utf8");
const quoted = (values: readonly string[]) => values.map(value => `''${value}''`).join(",");

describe("subscription management schema contract (0090)", () => {
  it("plan enums keep the existing values first and in order, then the kit plans (0091 appends the Oct 14 plans)", () => {
    expect([...tokenBalances.plan.enumValues]).toEqual([...WALLET_PLAN_IDS]);
    expect(WALLET_PLAN_IDS.slice(0, 3)).toEqual(["free", "pro", "max"]);
    expect([...subscriptionCheckoutIntents.plan.enumValues]).toEqual([...INTENT_PLAN_IDS]);
    expect(INTENT_PLAN_IDS.slice(0, 2)).toEqual(["pro", "max"]);
    // 0090 shipped the first eight wallet values; its file is immutable.
    expect(migration).toContain(`MODIFY \`plan\` ENUM(${quoted(WALLET_PLAN_IDS.slice(0, 8))}) NOT NULL DEFAULT ''free''`);
    expect(migration).toContain(`MODIFY \`plan\` ENUM(${quoted(INTENT_PLAN_IDS.slice(0, 7))}) NOT NULL`);
  });

  it("cancellation reasons match the shared contract", () => {
    expect([...subscriptionCancellationFeedback.reason.enumValues]).toEqual([...CANCELLATION_REASONS]);
    expect(migration).toContain(`\`reason\` enum(${CANCELLATION_REASONS.map(value => `'${value}'`).join(",")}) NOT NULL`);
  });

  it("is additive and guarded: no data writes, every ALTER/CREATE INDEX behind information_schema", () => {
    const body = migration.replace(/--.*$/gm, "");
    expect(body).not.toMatch(/\b(INSERT\s+INTO|DELETE\s+FROM|DROP|TRUNCATE|RENAME)\b|^\s*UPDATE\s/im);
    for (const table of ["billingCustomers", "billingInvoices", "subscriptionCancellationFeedback"]) expect(body).toContain(`CREATE TABLE IF NOT EXISTS \`${table}\``);
    expect(body.match(/information_schema\./g)).toHaveLength(5);
    expect(body).not.toMatch(/^\s*ALTER TABLE/im);
  });

  it("boot reconcile requires exactly what 0090 creates", () => {
    for (const table of ["billingCustomers", "billingInvoices", "subscriptionCancellationFeedback"]) expect(DESIRED_TABLES.some(item => item.table === table)).toBe(true);
    const tokenColumns = Object.keys(tokenBalances).filter(column => ["subscriptionItemPriceId", "subscriptionBillingPeriod", "subscriptionAmount", "pendingPlan", "pendingBillingPeriod", "pendingPlanEffectiveAt", "subscriptionPauseAt", "subscriptionResumeAt", "paymentDueSince", "paymentDueInvoiceId", "paymentDueAmount", "paymentNextRetryAt", "paymentFailureReason", "paymentRetryRequestedAt"].includes(column));
    expect(tokenColumns).toHaveLength(14);
    for (const column of tokenColumns) {
      expect(DESIRED_COLUMNS.some(item => item.table === "tokenBalances" && item.column === column)).toBe(true);
      expect(migration).toContain(`\`${column}\``);
    }
    for (const column of ["billingPeriod", "kind", "subscriptionId", "failureReason", "failureCode", "failedAt"]) {
      expect(DESIRED_COLUMNS.some(item => item.table === "subscriptionCheckoutIntents" && item.column === column)).toBe(true);
      expect(Object.keys(subscriptionCheckoutIntents)).toContain(column);
    }
    for (const name of ["billing_customers_provider_customer_unique", "billing_customers_owner_unique", "billing_invoices_provider_invoice_unique", "billing_invoices_owner_paid_idx", "subscription_cancellation_feedback_user_idx", "subscription_checkout_subscription_idx"]) {
      expect(DESIRED_INDEXES.some(index => index.name === name)).toBe(true);
      expect(migration).toContain(name);
    }
    for (const table of ["billingCustomers", "billingInvoices", "subscriptionCancellationFeedback"]) expect(DESIRED_FOREIGN_KEYS).toContainEqual({ table, column: "userId", referencedTable: "users", referencedColumn: "id" });
    expect(Object.keys(billingCustomers)).toEqual(expect.arrayContaining(["site", "providerCustomerId"]));
    expect([...billingInvoices.status.enumValues]).toEqual(["paid", "refunded", "partially_refunded", "payment_due", "not_paid", "voided"]);
  });
});

describe("billing catalog", () => {
  it("resolves every plan term, pack and session item price to what it sells and nothing else", () => {
    expect(resolveItemPrice("skipwait_momentum_90d-USD")).toEqual({ kind: "plan", plan: "momentum", interval: "90d", currency: "USD", amount: 5_900, itemPriceId: "skipwait_momentum_90d-USD" });
    expect(resolveItemPrice("skipwait_land_sprint_30d-INR")).toMatchObject({ plan: "land_sprint", amount: 1_199_900 });
    expect(resolveItemPrice("skipwait_keep_warm_yearly-INR")).toMatchObject({ plan: "keep_warm", interval: "yearly", amount: 99_900 });
    expect(resolveItemPrice("skipwait_pack_25-USD")).toEqual({ kind: "pack", packId: "pack_25", credits: 25, currency: "USD", amount: 2_200, itemPriceId: "skipwait_pack_25-USD" });
    expect(resolveItemPrice("skipwait_pack_2-INR")).toMatchObject({ kind: "pack", credits: 2, amount: 9_900 });
    expect(resolveItemPrice("skipwait_written_review-USD")).toEqual({ kind: "session", sessionId: "written_review", currency: "USD", amount: 4_900, itemPriceId: "skipwait_written_review-USD" });
    for (const unsold of ["skipwait_pack_2-USD", "skipwait_pack_5-INR", "skipwait_keep_warm_30d-USD", "skipwait_start_yearly-USD", "skipwait_momentum_monthly-USD", "skipwait_land_500_monthly-USD", "skipwait_pro_yearly-USD", "skipwait_token_1-USD"]) expect(resolveItemPrice(unsold)).toBeUndefined();
    expect(resolveItemPrice(undefined)).toBeUndefined();
    expect(sellableItemPrices()).toHaveLength(62);
  });

  // D-067: Pro and Max are removed completely. The price book neither sells nor
  // resolves them, while the storage ENUM lists keep them in place (pinned above).
  it("sells and resolves no Pro or Max item price, while the storage enums still list them", () => {
    for (const id of ["skipwait_pro_monthly-INR", "skipwait_pro_monthly-USD", "skipwait_max_monthly-INR", "skipwait_max_monthly-USD"]) expect(resolveItemPrice(id)).toBeUndefined();
    expect([...BILLABLE_PLAN_IDS]).toEqual([...CATALOG_PLAN_IDS]);
    expect(RETIRED_PLAN_IDS).toEqual(["pro", "max"]);
    for (const plan of RETIRED_PLAN_IDS) {
      expect(BILLABLE_PLAN_IDS as readonly string[]).not.toContain(plan);
      expect(WALLET_PLAN_IDS as readonly string[]).toContain(plan);
      expect(INTENT_PLAN_IDS as readonly string[]).toContain(plan);
    }
    const sold = JSON.stringify(sellableItemPrices());
    expect(sold).not.toMatch(/skipwait_(pro|max)_|"plan":"(pro|max)"/);
    expect(sellableItemPrices().every(price => !("legacy" in price))).toBe(true);
    for (const region of ["IN", "INTL"] as const) {
      const catalog = JSON.stringify(planCatalogResponse({ region, available: () => true, usdRecurringConfirmed: true, sessionsStaffed: true, indiaGstRegistered: false }));
      expect(catalog).not.toMatch(/"(pro|max)"|\bPro\b|\bMax\b/);
    }
    expect(adjacentPlans("pro")).toEqual({ up: null, down: null });
    expect(adjacentPlans("max")).toEqual({ up: null, down: null });
    expect(billingPlanLabel("pro")).toBe("Free");
    expect(billingPlanLabel("max")).toBe("Free");
    // Recognised only so a late provider event naming one is refused and alerted.
    for (const id of ["skipwait_pro_monthly-INR", "skipwait_pro_monthly-USD", "skipwait_max_monthly-INR", "skipwait_max_monthly-USD"]) expect(isRetiredPlanItemPrice(id)).toBe(true);
    for (const id of ["skipwait_start_30d-INR", "skipwait_momentum_90d-USD", "skipwait_token_1-INR", "skipwait_pro_yearly-USD", "skipwait_land_500_monthly-USD", "", undefined, null, 7]) expect(isRetiredPlanItemPrice(id)).toBe(false);
  });

  it("kit plans sell only their listed terms; no plan sells monthly", () => {
    expect(planPrice("start", "30d", "INR")?.amount).toBe(29_900);
    expect(planPrice("start", "yearly", "INR")).toBeUndefined();
    expect(planPrice("start", "monthly", "USD")).toBeUndefined();
    expect(planPrice("keep_warm", "90d", "USD")).toBeUndefined();
    for (const plan of CATALOG_PLAN_IDS) for (const currency of ["INR", "USD"] as const) expect(planPrice(plan, "monthly", currency)).toBeUndefined();
    expect(planSellsInterval("keep_warm", "yearly")).toBe(true);
    expect(planSellsInterval("momentum", "yearly")).toBe(false);
  });

  it("recognises a paid amount that is exactly one pack in its currency, never an approximation", () => {
    expect(catalogPackForAmount(2_200, "USD")?.packId).toBe("pack_25");
    expect(catalogPackForAmount(119_900, "INR")?.packId).toBe("pack_25");
    expect(catalogPackForAmount(9_900, "INR")?.packId).toBe("pack_2");
    expect(catalogPackForAmount(2_201, "USD")).toBeUndefined();
    expect(catalogPackForAmount(2_200, "INR")).toBeUndefined();
  });

  it("upgrades now on a stronger plan or a longer term, switches down at term end otherwise", () => {
    const term = (plan: Parameters<typeof planChangeDirection>[0]["plan"], interval: Parameters<typeof planChangeDirection>[0]["interval"], amount = 0) => ({ plan, interval, amount });
    expect(planChangeDirection(term("start", "30d"), term("momentum", "30d"))).toBe("upgrade");
    expect(planChangeDirection(term("land_sprint", "30d"), term("land_focus", "30d"))).toBe("downgrade");
    expect(planChangeDirection(term("momentum", "30d"), term("momentum", "90d"))).toBe("upgrade");
    expect(planChangeDirection(term("momentum", "90d"), term("momentum", "30d"))).toBe("downgrade");
    expect(planChangeDirection(term("momentum", "30d"), term("momentum", "30d"))).toBe("none");
    expect(planChangeDirection(term("keep_warm", "yearly"), term("start", "30d"))).toBe("upgrade");
  });

  it("walks the self-serve ladder for the billing actions; Concierge is by application", () => {
    expect(adjacentPlans("momentum")).toEqual({ up: "land_focus", down: "start" });
    expect(adjacentPlans("start")).toEqual({ up: "momentum", down: "keep_warm" });
    expect(adjacentPlans("keep_warm")).toEqual({ up: "start", down: null });
    expect(adjacentPlans("land_sprint")).toEqual({ up: null, down: "land_focus" });
    expect(adjacentPlans("land_concierge")).toEqual({ up: null, down: null });
    expect(adjacentPlans("free")).toEqual({ up: null, down: null });
    expect(adjacentPlans("land_500")).toEqual({ up: null, down: null });
  });

  it("auto-extend follows the payment rails: INR mandates by amount, never Land 90-day or Concierge, USD only behind the flag", () => {
    expect(autoExtendMethods("start", "30d", "INR", false)).toEqual(["upi_autopay", "card_netbanking_mandate"]);
    expect(autoExtendMethods("momentum", "90d", "INR", false)).toEqual(["upi_autopay", "card_netbanking_mandate"]);
    expect(autoExtendMethods("keep_warm", "yearly", "INR", false)).toEqual(["upi_autopay", "card_netbanking_mandate"]);
    expect(autoExtendMethods("land_focus", "30d", "INR", false)).toEqual(["card_netbanking_mandate"]);
    expect(autoExtendMethods("land_sprint", "30d", "INR", false)).toEqual(["card_netbanking_mandate"]);
    expect(autoExtendMethods("land_focus", "90d", "INR", false)).toEqual([]);
    expect(autoExtendMethods("land_concierge", "30d", "INR", false)).toEqual([]);
    expect(autoExtendMethods("momentum", "30d", "USD", false)).toEqual([]);
    expect(autoExtendMethods("momentum", "30d", "USD", true)).toEqual(["usd_recurring"]);
    expect(autoExtendMethods("land_concierge", "30d", "USD", true)).toEqual([]);
    expect(autoExtendMethods("keep_warm", "30d", "INR", false)).toEqual([]);
  });
});

describe("public catalog payload (GET /api/plans/catalog)", () => {
  const live = new Set(["skipwait_start_30d-USD", "skipwait_pack_5-USD", "skipwait_land_concierge_30d-USD", "skipwait_written_review-USD", "skipwait_momentum_30d-INR"]);
  const base = { available: (id: string) => live.has(id), usdRecurringConfirmed: false, sessionsStaffed: false, indiaGstRegistered: false };

  it("global callers see USD prices only, each with its availability and auto-extend rails", () => {
    const catalog = planCatalogResponse({ ...base, region: "INTL" });
    expect(catalog).toMatchObject({ region: "INTL", currency: "USD", priceNote: null, fairness: { maxOpenAsksPerCompany: 2, planVisibleToReferrers: false } });
    // D-051: nothing grants the reverse trial yet (no caller of grantTrialCreditsTx), so the
    // public catalog no longer advertises it. The field is optional, not removed: a payload
    // that carries it still parses, so switching the trial back on is additive for clients.
    expect(catalog.free).toEqual({ openRequests: 3, creditsPerMonth: 3 });
    const withTrial = { ...catalog, free: { ...catalog.free, trial: { plan: "momentum", planLabel: "Momentum", days: 14, openRequests: 15, credits: 5 } } };
    expect(planCatalogResponseSchema.parse(withTrial).free.trial).toEqual(withTrial.free.trial);
    expect(catalog.plans.map(plan => [plan.id, plan.terms.map(term => [term.interval, term.amount, term.available])])).toEqual([
      ["keep_warm", [["yearly", 2_900, false]]],
      ["start", [["30d", 800, true], ["90d", 1_900, false]]],
      ["momentum", [["30d", 2_400, false], ["90d", 5_900, false]]],
      ["land_focus", [["30d", 10_000, false], ["90d", 24_900, false]]],
      ["land_sprint", [["30d", 20_000, false], ["90d", 49_900, false]]],
      ["land_concierge", [["30d", 75_000, false], ["90d", 199_000, false]]],
    ]);
    expect(catalog.plans.find(plan => plan.id === "start")?.terms[0]).toEqual({ interval: "30d", days: 30, amount: 800, available: true, autoExtend: [] });
    expect(catalog.plans.find(plan => plan.id === "keep_warm")?.terms[0].days).toBeNull();
    expect(catalog.plans.find(plan => plan.id === "momentum")).toMatchObject({ displayName: "Momentum", recommended: true, openRequests: 15, creditsPerMonth: 36, carryover: 3 });
    // D-041: Focus/Sprint human time reads as "coming later" until reviewers are staffed; everything else is offered.
    expect(catalog.plans.map(plan => [plan.id, plan.humanTimeOffered])).toEqual([["keep_warm", true], ["start", true], ["momentum", true], ["land_focus", false], ["land_sprint", false], ["land_concierge", true]]);
    expect(catalog.plans.find(plan => plan.id === "land_concierge")).toMatchObject({ byApplication: true, openRequests: 75 });
    expect(catalog.packs.map(pack => [pack.id, pack.credits, pack.amount, pack.available, pack.firstPack, pack.recommended])).toEqual([["pack_5", 5, 500, true, true, false], ["pack_25", 25, 2_200, false, false, true], ["pack_60", 60, 4_800, false, false, false], ["pack_150", 150, 10_500, false, false, false]]);
    expect(catalog.sessions).toEqual([{ id: "written_review", label: "Written expert review", detail: "Returned within 48 hours", amount: 4_900, available: false }, { id: "live_session", label: "Live 45-minute session", detail: "Mock interview or search strategy", amount: 9_900, available: false }]);
    expect(catalog.creditCosts).toHaveLength(11);
  });

  it("India sees its own pack set and UPI/e-mandate rails, labelled \"India price\" until a GSTIN exists (D-007)", () => {
    const catalog = planCatalogResponse({ ...base, region: "IN" });
    expect(catalog).toMatchObject({ region: "IN", currency: "INR", priceNote: "India price" });
    expect(planCatalogResponse({ ...base, region: "IN", indiaGstRegistered: true })).toMatchObject({ priceNote: "India price, incl. GST" });
    expect(planCatalogResponse({ ...base, region: "INTL", indiaGstRegistered: true })).toMatchObject({ priceNote: null });
    expect(catalog.plans.find(plan => plan.id === "momentum")?.terms).toEqual([
      { interval: "30d", days: 30, amount: 99_900, available: true, autoExtend: ["upi_autopay", "card_netbanking_mandate"] },
      { interval: "90d", days: 90, amount: 249_900, available: false, autoExtend: ["upi_autopay", "card_netbanking_mandate"] },
    ]);
    expect(catalog.packs.map(pack => [pack.id, pack.credits, pack.amount])).toEqual([["pack_2", 2, 9_900], ["pack_25", 25, 119_900], ["pack_60", 60, 259_900], ["pack_150", 150, 599_900]]);
  });

  it("human sessions sell only once staffed and live; Concierge never sells from checkout", () => {
    const staffed = planCatalogResponse({ ...base, region: "INTL", sessionsStaffed: true });
    expect(staffed.sessions.map(session => [session.id, session.available])).toEqual([["written_review", true], ["live_session", false]]);
    expect(staffed.plans.find(plan => plan.id === "land_concierge")?.terms.every(term => !term.available)).toBe(true);
    expect(planCatalogResponse({ ...base, region: "INTL", usdRecurringConfirmed: true }).plans.find(plan => plan.id === "start")?.terms[0].autoExtend).toEqual(["usd_recurring"]);
  });

  it("is a strict contract: no item price ids or unknown fields leave the server", () => {
    const catalog = planCatalogResponse({ ...base, region: "INTL" });
    expect(JSON.stringify(catalog)).not.toContain("skipwait_");
    expect(planCatalogResponseSchema.safeParse({ ...catalog, extra: 1 }).success).toBe(false);
  });
});

describe("checkout and lifecycle requests", () => {
  it("accepts a kit plan on its billing route and refuses a mismatched currency or an unknown plan", () => {
    expect(kitPlanCheckoutRequestSchema.parse({ planId: "momentum", interval: "90d", currency: "USD", billingCountry: "INTL" })).toEqual({ planId: "momentum", interval: "90d", currency: "USD", billingCountry: "INTL", role: "job_seeker" });
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "keep_warm", interval: "yearly", currency: "INR", billingCountry: "IN" }).success).toBe(true);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "momentum", interval: "90d", currency: "USD", billingCountry: "IN" }).success).toBe(false);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "momentum", interval: "yearly", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "keep_warm", interval: "30d", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "land", interval: "30d", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "start", interval: "monthly", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    // D-067: the pre-kit Pro/Max body has no schema any more; the route refuses it with 410 plan_retired.
    expect(subscriptionManagement).not.toHaveProperty("legacyPlanCheckoutRequestSchema");
    expect(PLAN_RETIRED_CODE).toBe("plan_retired");
    expect(SUBSCRIPTION_REFUSALS.planRetired).toBe(PLAN_RETIRED_CODE);
    expect(kitPlanCheckoutRequestSchema.safeParse({ plan: "pro", currency: "INR", billingCountry: "IN" }).success).toBe(false);
    expect(packCheckoutRequestSchema.safeParse({ packId: "pack_25", billingCountry: "IN" }).success).toBe(true);
    expect(packCheckoutRequestSchema.safeParse({ packId: "pack_10", billingCountry: "IN" }).success).toBe(false);
    expect(packCheckoutRequestSchema.safeParse({ packId: "pack_25", billingCountry: "IN", amount: 1 }).success).toBe(true);
    expect(packCheckoutRequestSchema.parse({ packId: "pack_25", billingCountry: "IN", amount: 1 })).not.toHaveProperty("amount");
  });

  it("change, cancel and pause bodies are closed sets", () => {
    expect(subscriptionChangeRequestSchema.safeParse({ planId: "land_sprint", interval: "30d" }).success).toBe(true);
    expect(subscriptionChangeRequestSchema.safeParse({ planId: "land_200", interval: "30d" }).success).toBe(false);
    expect(subscriptionChangeRequestSchema.safeParse({ planId: "start", interval: "yearly" }).success).toBe(false);
    expect(subscriptionChangeRequestSchema.safeParse({ planId: "pro", interval: "monthly" }).success).toBe(false);
    expect(subscriptionCancelRequestSchema.parse({})).toEqual({ role: "job_seeker" });
    expect(subscriptionCancelRequestSchema.safeParse({ reason: "moved" }).success).toBe(false);
    expect(subscriptionPauseRequestSchema.parse({ reason: "too_expensive" })).toEqual({ months: 1, reason: "too_expensive", role: "job_seeker" });
    expect(subscriptionPauseRequestSchema.safeParse({ months: 2 }).success).toBe(false);
    expect(subscriptionChangeResponseSchema.safeParse({ status: "scheduled", planId: "start", interval: "30d", effectiveAt: "2026-11-06T00:00:00.000Z" }).success).toBe(true);
  });
});

const NOW = new Date("2026-10-14T00:00:00.000Z");
const wallet = (patch: Partial<SubscriptionWallet> = {}): SubscriptionWallet => ({ plan: "momentum", subscriptionId: "sub_1", subscriptionStatus: "active", subscriptionCurrency: "USD", subscriptionCurrentTermEnd: new Date("2026-11-06T00:00:00.000Z"), subscriptionItemPriceId: "skipwait_momentum_30d-USD", subscriptionBillingPeriod: "30d", subscriptionAmount: 2_400, ...patch });

describe("subscription state", () => {
  it("an active kit plan reads label, price, period and the actions the server accepts", () => {
    const state = subscriptionStateFor(wallet(), NOW);
    expect(state).toMatchObject({ plan: "momentum", planLabel: "Momentum", state: "active", legacy: false, billingPeriod: "30d", currency: "USD", amount: 2_400, currentTermEnd: "2026-11-06T00:00:00.000Z", changes: { up: { plan: "land_focus", planLabel: "Land Focus" }, down: { plan: "start", planLabel: "Start" } } });
    expect(state.actions).toEqual({ changePlan: true, cancel: true, pause: true, reactivate: false, retryPayment: false, cancelScheduledChange: false });
  });

  // D-067: an active Pro or Max subscription reads as Free in the billing state: no price, no actions.
  it.each(["pro", "max"])("an active %s subscription reads as Free with no actions", plan => {
    const free = subscriptionStateFor(null, NOW);
    for (const subscriptionStatus of ["active", "non_renewing", "paused"]) {
      const state = subscriptionStateFor({ plan, subscriptionId: "sub_p", subscriptionStatus, subscriptionCurrency: "INR", subscriptionCurrentTermEnd: new Date("2026-11-01T00:00:00.000Z"), subscriptionItemPriceId: `skipwait_${plan}_monthly-INR`, subscriptionBillingPeriod: "monthly", subscriptionAmount: 59_900, pendingPlan: plan }, NOW);
      expect(state).toEqual(free);
      expect(state).toMatchObject({ plan: "free", planLabel: "Free", state: "free", legacy: false, billingPeriod: null, amount: null });
      expect(Object.values(state.actions).every(action => action === false)).toBe(true);
    }
    expect(subscriptionStateFor(wallet({ pendingPlan: plan, pendingBillingPeriod: "monthly" }), NOW).pendingChange).toBeNull();
  });

  it("a pass without the 0090 period column still reads its 90-day term from the item price", () => {
    expect(subscriptionStateFor(wallet({ subscriptionItemPriceId: "skipwait_momentum_90d-INR", subscriptionBillingPeriod: null, subscriptionAmount: null, subscriptionCurrency: "INR" }), NOW)).toMatchObject({ billingPeriod: "90d", currency: "INR", amount: 249_900 });
  });

  it("a reserved pre-decision Land id reads as Free", () => {
    expect(subscriptionStateFor(wallet({ plan: "land_500" }), NOW)).toMatchObject({ plan: "free", state: "free" });
  });

  it("a lapsed, cancelled or missing plan reads as Free with no actions", () => {
    expect(subscriptionStateFor(wallet({ subscriptionCurrentTermEnd: new Date("2026-10-01T00:00:00.000Z") }), NOW)).toMatchObject({ plan: "free", state: "free", actions: { changePlan: false, cancel: false } });
    expect(subscriptionStateFor(wallet({ subscriptionStatus: "cancelled" }), NOW).state).toBe("free");
    expect(subscriptionStateFor(null, NOW).plan).toBe("free");
  });

  it("cancelling, pausing, paused, a pending switch and a failed renewal each change what is offered", () => {
    expect(subscriptionStateFor(wallet({ subscriptionStatus: "non_renewing" }), NOW)).toMatchObject({ state: "non_renewing", actions: { reactivate: true, cancel: false, changePlan: false } });
    expect(subscriptionStateFor(wallet({ subscriptionPauseAt: new Date("2026-11-06T00:00:00.000Z"), subscriptionResumeAt: new Date("2026-12-06T00:00:00.000Z") }), NOW)).toMatchObject({ state: "pause_scheduled", pause: { pausesAt: "2026-11-06T00:00:00.000Z", resumesAt: "2026-12-06T00:00:00.000Z" }, actions: { reactivate: true, pause: false } });
    expect(subscriptionStateFor(wallet({ subscriptionStatus: "paused" }), NOW)).toMatchObject({ state: "paused", plan: "momentum", actions: { reactivate: true, cancel: false } });
    expect(subscriptionStateFor(wallet({ pendingPlan: "start", pendingBillingPeriod: "30d", pendingPlanEffectiveAt: new Date("2026-11-06T00:00:00.000Z") }), NOW)).toMatchObject({ pendingChange: { plan: "start", planLabel: "Start", billingPeriod: "30d" }, actions: { cancelScheduledChange: true, pause: false } });
    const due = subscriptionStateFor(wallet({ paymentDueSince: new Date("2026-10-06T00:00:00.000Z"), paymentDueInvoiceId: "inv_9", paymentDueAmount: 2_000, paymentFailureReason: "card_declined" }), NOW);
    expect(due.paymentIssue).toEqual({ dueSince: "2026-10-06T00:00:00.000Z", invoiceId: "inv_9", amountDue: 2_000, nextRetryAt: null, reason: "card_declined" });
    expect(due.actions).toMatchObject({ changePlan: false, retryPayment: true, cancel: true });
  });
});

describe("billing account contracts", () => {
  it("maps provider failure codes to the kit reasons, unknown when nothing matches", () => {
    expect(paymentFailureReasonFrom("card_declined", "Your card was declined")).toBe("card_declined");
    expect(paymentFailureReasonFrom("card_declined", "International transactions are not enabled")).toBe("international_blocked");
    expect(paymentFailureReasonFrom("insufficient_funds")).toBe("insufficient_funds");
    expect(paymentFailureReasonFrom("payment_intent_authentication_failure", "3DS authentication failed")).toBe("authentication_failed");
    expect(paymentFailureReasonFrom("BAD_REQUEST_ERROR", "UPI collect request expired")).toBe("upi_timeout");
    expect(paymentFailureReasonFrom("gateway_error", "Something odd")).toBe("unknown");
    expect(paymentFailureReasonFrom(null, null)).toBe("unknown");
  });

  it("receipt ids name their source row and nothing else", () => {
    expect(parseReceiptId("inv_12")).toEqual({ source: "invoice", rowId: 12 });
    expect(parseReceiptId("pay_3")).toEqual({ source: "payment", rowId: 3 });
    for (const id of ["inv_0", "inv_x", "12", "inv_12;", "pay_99999999999"]) expect(parseReceiptId(id)).toBeNull();
    expect(receiptSchema.safeParse({ id: "inv_1", kind: "subscription", description: "Momentum · monthly", amount: 2_000, currency: "USD", status: "paid", paidAt: "2026-10-06T00:00:00.000Z", downloadable: true }).success).toBe(true);
    expect(receiptSchema.safeParse({ id: "inv_1", kind: "subscription", description: "x", amount: 1, currency: "USD", status: "paid", paidAt: "2026-10-06T00:00:00.000Z", downloadable: true, providerInvoiceId: "inv_secret" }).success).toBe(false);
    expect(checkoutIntentStateSchema.safeParse({ kind: "plan", state: "failed", failureReason: "card_declined", charged: false, planChanged: false }).success).toBe(true);
  });
});
