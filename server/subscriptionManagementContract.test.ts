import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { billingCustomers, billingInvoices, subscriptionCancellationFeedback, subscriptionCheckoutIntents, tokenBalances } from "../drizzle/schema";
import { checkoutIntentStateSchema, paymentFailureReasonFrom, parseReceiptId, receiptSchema } from "../shared/billingAccount";
import { INTENT_PLAN_IDS, WALLET_PLAN_IDS, adjacentPlans, catalogPackForAmount, planCatalogResponse, planChangeDirection, planPrice, resolveItemPrice, sellableItemPrices } from "../shared/billingCatalog";
import { CANCELLATION_REASONS, kitPlanCheckoutRequestSchema, legacyPlanCheckoutRequestSchema, packCheckoutRequestSchema, subscriptionCancelRequestSchema, subscriptionChangeRequestSchema, subscriptionChangeResponseSchema, subscriptionPauseRequestSchema } from "../shared/subscriptionManagement";
import { subscriptionStateFor, type SubscriptionWallet } from "../shared/subscriptionState";
import { DESIRED_COLUMNS, DESIRED_FOREIGN_KEYS, DESIRED_INDEXES, DESIRED_TABLES } from "./schemaReconcile";

const migration = readFileSync(new URL("../drizzle/deploy/0080_subscription_management.sql", import.meta.url), "utf8");
const quoted = (values: readonly string[]) => values.map(value => `''${value}''`).join(",");

describe("subscription management schema contract (0080)", () => {
  it("plan enums keep the existing values first and in order, then the kit plans", () => {
    expect([...tokenBalances.plan.enumValues]).toEqual([...WALLET_PLAN_IDS]);
    expect(WALLET_PLAN_IDS.slice(0, 3)).toEqual(["free", "pro", "max"]);
    expect([...subscriptionCheckoutIntents.plan.enumValues]).toEqual([...INTENT_PLAN_IDS]);
    expect(INTENT_PLAN_IDS.slice(0, 2)).toEqual(["pro", "max"]);
    expect(migration).toContain(`MODIFY \`plan\` ENUM(${quoted(WALLET_PLAN_IDS)}) NOT NULL DEFAULT ''free''`);
    expect(migration).toContain(`MODIFY \`plan\` ENUM(${quoted(INTENT_PLAN_IDS)}) NOT NULL`);
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

  it("boot reconcile requires exactly what 0080 creates", () => {
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
  it("resolves every kit, legacy and pack item price to what it sells and nothing else", () => {
    expect(resolveItemPrice("skipwait_momentum_yearly-USD")).toEqual({ kind: "plan", plan: "momentum", interval: "yearly", currency: "USD", amount: 20_000, itemPriceId: "skipwait_momentum_yearly-USD", legacy: false });
    expect(resolveItemPrice("skipwait_land_200_monthly-INR")).toMatchObject({ plan: "land_200", amount: 1_699_900 });
    expect(resolveItemPrice("skipwait_pro_monthly-INR")).toMatchObject({ kind: "plan", plan: "pro", amount: 59_900, legacy: true });
    expect(resolveItemPrice("skipwait_pack_25-USD")).toEqual({ kind: "pack", packId: "pack_25", credits: 25, currency: "USD", amount: 2_200, itemPriceId: "skipwait_pack_25-USD" });
    expect(resolveItemPrice("skipwait_pro_yearly-USD")).toBeUndefined();
    expect(resolveItemPrice("skipwait_token_1-USD")).toBeUndefined();
    expect(resolveItemPrice(undefined)).toBeUndefined();
    expect(sellableItemPrices()).toHaveLength(28);
  });

  it("yearly is ten monthly payments and legacy plans sell monthly only", () => {
    expect(planPrice("start", "yearly", "INR")?.amount).toBe(planPrice("start", "monthly", "INR")!.amount * 10);
    expect(planPrice("max", "yearly", "USD")).toBeUndefined();
  });

  it("recognises a paid amount that is exactly one pack, never an approximation", () => {
    expect(catalogPackForAmount(2_200, "USD")?.packId).toBe("pack_25");
    expect(catalogPackForAmount(189_900, "INR")?.packId).toBe("pack_25");
    expect(catalogPackForAmount(2_201, "USD")).toBeUndefined();
    expect(catalogPackForAmount(2_200, "INR")).toBeUndefined();
  });

  it("upgrades now on a stronger plan or a longer term, switches down at term end otherwise", () => {
    const term = (plan: Parameters<typeof planChangeDirection>[0]["plan"], interval: "monthly" | "yearly", amount = 0) => ({ plan, interval, amount });
    expect(planChangeDirection(term("start", "monthly"), term("momentum", "monthly"))).toBe("upgrade");
    expect(planChangeDirection(term("land_200", "monthly"), term("land_100", "monthly"))).toBe("downgrade");
    expect(planChangeDirection(term("momentum", "monthly"), term("momentum", "yearly"))).toBe("upgrade");
    expect(planChangeDirection(term("momentum", "yearly"), term("momentum", "monthly"))).toBe("downgrade");
    expect(planChangeDirection(term("momentum", "monthly"), term("momentum", "monthly"))).toBe("none");
    expect(planChangeDirection(term("pro", "monthly", 700), term("start", "monthly", 800))).toBe("upgrade");
    expect(planChangeDirection(term("max", "monthly", 1_500), term("start", "monthly", 800))).toBe("downgrade");
    expect(planChangeDirection(term("max", "monthly", 1_500), term("land_100", "monthly", 10_000))).toBe("upgrade");
  });

  it("walks the kit ladder for the billing actions", () => {
    expect(adjacentPlans("momentum")).toEqual({ up: "land_100", down: "start" });
    expect(adjacentPlans("start")).toEqual({ up: "momentum", down: null });
    expect(adjacentPlans("land_500")).toEqual({ up: null, down: "land_200" });
    expect(adjacentPlans("pro")).toEqual({ up: "momentum", down: null });
    expect(adjacentPlans("max")).toEqual({ up: "land_100", down: "start" });
    expect(adjacentPlans("free")).toEqual({ up: null, down: null });
  });

  it("the catalog payload carries each price's availability and nothing invented", () => {
    const catalog = planCatalogResponse(id => id === "skipwait_start_monthly-USD");
    expect(catalog.plans.map(plan => plan.id)).toEqual(["start", "momentum", "land_100", "land_200", "land_500"]);
    expect(catalog.plans[0].prices.monthly.USD).toEqual({ amount: 800, available: true });
    expect(catalog.plans[0].prices.yearly.USD).toEqual({ amount: 8_000, available: false });
    expect(catalog.packs.map(pack => [pack.id, pack.credits, pack.prices.USD.amount])).toEqual([["pack_5", 5, 500], ["pack_25", 25, 2_200], ["pack_60", 60, 4_800], ["pack_150", 150, 10_500]]);
  });
});

describe("checkout and lifecycle requests", () => {
  it("accepts a kit plan on its billing route and refuses a mismatched currency or an unknown plan", () => {
    expect(kitPlanCheckoutRequestSchema.parse({ planId: "momentum", interval: "yearly", currency: "USD", billingCountry: "INTL" })).toEqual({ planId: "momentum", interval: "yearly", currency: "USD", billingCountry: "INTL", role: "job_seeker" });
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "momentum", interval: "yearly", currency: "USD", billingCountry: "IN" }).success).toBe(false);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "land", interval: "monthly", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    expect(kitPlanCheckoutRequestSchema.safeParse({ planId: "start", interval: "weekly", currency: "USD", billingCountry: "INTL" }).success).toBe(false);
    expect(legacyPlanCheckoutRequestSchema.safeParse({ plan: "pro", currency: "INR", billingCountry: "IN" }).success).toBe(true);
    expect(packCheckoutRequestSchema.safeParse({ packId: "pack_25", billingCountry: "IN" }).success).toBe(true);
    expect(packCheckoutRequestSchema.safeParse({ packId: "pack_10", billingCountry: "IN" }).success).toBe(false);
    expect(packCheckoutRequestSchema.safeParse({ packId: "pack_25", billingCountry: "IN", amount: 1 }).success).toBe(true);
    expect(packCheckoutRequestSchema.parse({ packId: "pack_25", billingCountry: "IN", amount: 1 })).not.toHaveProperty("amount");
  });

  it("change, cancel and pause bodies are closed sets", () => {
    expect(subscriptionChangeRequestSchema.safeParse({ planId: "land_200", interval: "monthly" }).success).toBe(true);
    expect(subscriptionChangeRequestSchema.safeParse({ planId: "pro", interval: "monthly" }).success).toBe(false);
    expect(subscriptionCancelRequestSchema.parse({})).toEqual({ role: "job_seeker" });
    expect(subscriptionCancelRequestSchema.safeParse({ reason: "moved" }).success).toBe(false);
    expect(subscriptionPauseRequestSchema.parse({ reason: "too_expensive" })).toEqual({ months: 1, reason: "too_expensive", role: "job_seeker" });
    expect(subscriptionPauseRequestSchema.safeParse({ months: 2 }).success).toBe(false);
    expect(subscriptionChangeResponseSchema.safeParse({ status: "scheduled", planId: "start", interval: "monthly", effectiveAt: "2026-11-06T00:00:00.000Z" }).success).toBe(true);
  });
});

const NOW = new Date("2026-10-14T00:00:00.000Z");
const wallet = (patch: Partial<SubscriptionWallet> = {}): SubscriptionWallet => ({ plan: "momentum", subscriptionId: "sub_1", subscriptionStatus: "active", subscriptionCurrency: "USD", subscriptionCurrentTermEnd: new Date("2026-11-06T00:00:00.000Z"), subscriptionItemPriceId: "skipwait_momentum_monthly-USD", subscriptionBillingPeriod: "monthly", subscriptionAmount: 2_000, ...patch });

describe("subscription state", () => {
  it("an active kit plan reads label, price, period and the actions the server accepts", () => {
    const state = subscriptionStateFor(wallet(), NOW);
    expect(state).toMatchObject({ plan: "momentum", planLabel: "Momentum", state: "active", legacy: false, billingPeriod: "monthly", currency: "USD", amount: 2_000, currentTermEnd: "2026-11-06T00:00:00.000Z", changes: { up: { plan: "land_100", planLabel: "Land Focus" }, down: { plan: "start", planLabel: "Start" } } });
    expect(state.actions).toEqual({ changePlan: true, cancel: true, pause: true, reactivate: false, retryPayment: false, cancelScheduledChange: false });
  });

  it("grandfathered Pro keeps its label and monthly price even before the 0080 columns exist", () => {
    const state = subscriptionStateFor({ plan: "pro", subscriptionId: "sub_p", subscriptionStatus: "active", subscriptionCurrency: "INR", subscriptionCurrentTermEnd: new Date("2026-11-01T00:00:00.000Z") }, NOW);
    expect(state).toMatchObject({ plan: "pro", planLabel: "Pro", legacy: true, billingPeriod: "monthly", currency: "INR", amount: 59_900 });
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
    expect(subscriptionStateFor(wallet({ pendingPlan: "start", pendingBillingPeriod: "monthly", pendingPlanEffectiveAt: new Date("2026-11-06T00:00:00.000Z") }), NOW)).toMatchObject({ pendingChange: { plan: "start", planLabel: "Start", billingPeriod: "monthly" }, actions: { cancelScheduledChange: true, pause: false } });
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
