import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { packPrice, planPrice, sessionPrice } from "../shared/billingCatalog";
import { ChargebeeApiError } from "./chargebeeApi";
import { collectInvoicePayment, listPaymentSources, paymentMethodFromSource } from "./chargebeeAccountApi";
import { availablePriceIds, clearPriceAvailabilityCache, isPriceAvailable, itemPriceMatches } from "./billingAvailability";
import { createChangeCheckout, createPackCheckout, createPlanCheckout, pauseAtTermEnd, retrieveItemPrice, scheduleSubscriptionChange } from "./chargebeeSubscriptionApi";

const credentials = { site: "fixture-test", apiKey: "fixture-key" };
type Call = { url: string; method: string; form: URLSearchParams | null };
let calls: Call[];

function provider(respond: (call: Call) => { status?: number; body: unknown }) {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const call = { url, method: init?.method ?? "GET", form: init?.body instanceof URLSearchParams ? init.body : null };
    calls.push(call);
    const { status = 200, body } = respond(call);
    return new Response(JSON.stringify(body), { status });
  }));
}

beforeEach(() => clearPriceAvailabilityCache());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("hosted checkouts send only catalog item prices", () => {
  it("a kit plan checkout names one item price, reuses the billing customer and carries the intent", async () => {
    provider(() => ({ body: { hosted_page: { id: "hp_1", url: "https://fixture-test.chargebee.com/pages/hp_1" } } }));
    const result = await createPlanCheckout(credentials, { itemPriceId: "skipwait_momentum_90d-USD", customerId: "cust_1", email: "a@example.com", redirectUrl: "https://skipwait.me/billing", cancelUrl: "https://skipwait.me/plans", checkoutIntentId: "intent_1" });
    expect(result).toEqual({ checkoutUrl: "https://fixture-test.chargebee.com/pages/hp_1", hostedPageId: "hp_1" });
    expect(calls[0].url).toBe("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_new_for_items");
    expect(Object.fromEntries(calls[0].form!)).toEqual({ "subscription_items[item_price_id][0]": "skipwait_momentum_90d-USD", "subscription_items[quantity][0]": "1", "customer[id]": "cust_1", "customer[email]": "a@example.com", redirect_url: "https://skipwait.me/billing", cancel_url: "https://skipwait.me/plans", pass_thru_content: "intent_1" });
  });

  it("a pack checkout is one unit of the pack's own item price, never an ad hoc amount", async () => {
    provider(() => ({ body: { hosted_page: { id: "hp_2", url: "https://fixture-test.chargebee.com/pages/hp_2" } } }));
    await createPackCheckout(credentials, { itemPriceId: "skipwait_pack_25-INR", currency: "INR", billingCountry: "IN", redirectUrl: "https://skipwait.me/plans", cancelUrl: "https://skipwait.me/plans", checkoutIntentId: "intent_2" });
    const form = calls[0].form!;
    expect(calls[0].url).toMatch(/checkout_one_time_for_items$/);
    expect(form.get("item_prices[item_price_id][0]")).toBe("skipwait_pack_25-INR");
    expect(form.get("item_prices[quantity][0]")).toBe("1");
    expect(form.get("currency_code")).toBe("INR");
    expect(form.get("billing_address[country]")).toBe("IN");
    expect([...form.keys()].some(key => key.startsWith("charges["))).toBe(false);
  });

  it("an upgrade replaces the subscription's items on a hosted page; a switch down waits for term end", async () => {
    provider(call => call.url.includes("hosted_pages")
      ? { body: { hosted_page: { id: "hp_3", url: "https://fixture-test.chargebee.com/pages/hp_3" } } }
      : { body: { subscription: { id: "sub_1", status: "active", has_scheduled_changes: true, current_term_end: 1_793_000_000 } } });
    await createChangeCheckout(credentials, { subscriptionId: "sub_1", itemPriceId: "skipwait_land_focus_30d-USD", redirectUrl: "https://skipwait.me/billing", cancelUrl: "https://skipwait.me/billing", checkoutIntentId: "intent_3" });
    expect(Object.fromEntries(calls[0].form!)).toMatchObject({ "subscription[id]": "sub_1", replace_items_list: "true", "subscription_items[item_price_id][0]": "skipwait_land_focus_30d-USD", pass_thru_content: "intent_3" });
    const scheduled = await scheduleSubscriptionChange(credentials, { subscriptionId: "sub_1", itemPriceId: "skipwait_start_30d-USD" });
    expect(calls[1].url).toBe("https://fixture-test.chargebee.com/api/v2/subscriptions/sub_1/update_for_items");
    expect(calls[1].form!.get("change_option")).toBe("end_of_term");
    expect(scheduled).toMatchObject({ id: "sub_1", has_scheduled_changes: true, current_term_end: new Date(1_793_000_000_000) });
  });

  it("pauses from term end with the resume date in provider seconds and refuses an answer for another subscription", async () => {
    provider(() => ({ body: { subscription: { id: "sub_other", status: "active" } } }));
    await expect(pauseAtTermEnd(credentials, { subscriptionId: "sub_1", resumeAt: new Date("2026-12-06T00:00:00.000Z") })).rejects.toThrow(/different subscription/);
    expect(calls[0].form!.get("pause_option")).toBe("end_of_term");
    expect(calls[0].form!.get("resume_date")).toBe(String(Date.parse("2026-12-06T00:00:00.000Z") / 1000));
  });

  it("provider errors carry sanitized codes only", async () => {
    provider(() => ({ status: 400, body: { api_error_code: "invalid_state_for_request", message: "Feature\nnot enabled", error_code: "feature_not_enabled" } }));
    const error = await scheduleSubscriptionChange(credentials, { subscriptionId: "sub_1", itemPriceId: "x" }).catch(reason => reason);
    expect(error).toBeInstanceOf(ChargebeeApiError);
    expect(error).toMatchObject({ status: 400, apiErrorCode: "invalid_state_for_request", errorCode: "feature_not_enabled", providerMessage: "Feature not enabled" });
  });
});

describe("item price availability", () => {
  const pass30 = planPrice("momentum", "30d", "USD")!;
  const pass90 = planPrice("momentum", "90d", "USD")!;
  const yearly = planPrice("keep_warm", "yearly", "INR")!;
  const pack = packPrice("pack_25", "USD")!;
  const session = sessionPrice("written_review", "INR")!;

  it("sells a price only when the site has it active, in the catalog currency, amount and period", () => {
    const live = { id: pass30.itemPriceId, status: "active", currency_code: "USD", price: 2_400, period: 1, period_unit: "month", item_type: "plan" };
    expect(itemPriceMatches(live, pass30)).toBe(true);
    expect(itemPriceMatches({ ...live, status: "archived" }, pass30)).toBe(false);
    expect(itemPriceMatches({ ...live, price: 2_399 }, pass30)).toBe(false);
    expect(itemPriceMatches({ ...live, currency_code: "INR" }, pass30)).toBe(false);
    // A 30-day pass is 30 days, never "1 month" (months run 28 to 31 days).
    expect(itemPriceMatches({ ...live, period: 30, period_unit: "day" }, pass30)).toBe(false);
    expect(itemPriceMatches({ ...live, id: pass90.itemPriceId, price: 5_900, period: 3, period_unit: "month" }, pass90)).toBe(true);
    expect(itemPriceMatches({ ...live, id: pass90.itemPriceId, price: 5_900, period: 90, period_unit: "day" }, pass90)).toBe(false);
    expect(itemPriceMatches({ ...live, id: yearly.itemPriceId, currency_code: "INR", price: 99_900, period: 1, period_unit: "year" }, yearly)).toBe(true);
    expect(itemPriceMatches({ ...live, id: yearly.itemPriceId, currency_code: "INR", price: 99_900, period: 12, period_unit: "month" }, yearly)).toBe(true);
    expect(itemPriceMatches({ ...live, id: yearly.itemPriceId, currency_code: "INR", price: 99_900, period: 1, period_unit: "month" }, yearly)).toBe(false);
    expect(itemPriceMatches({ id: pack.itemPriceId, status: "active", currency_code: "USD", price: 2_200, item_type: "charge" }, pack)).toBe(true);
    expect(itemPriceMatches({ id: pack.itemPriceId, status: "active", currency_code: "USD", price: 2_200, item_type: "plan" }, pack)).toBe(false);
    expect(itemPriceMatches({ id: session.itemPriceId, status: "active", currency_code: "INR", price: 79_900, item_type: "charge" }, session)).toBe(true);
    expect(itemPriceMatches(null, pack)).toBe(false);
  });

  it("caches each answer, shares an in-flight probe and treats a provider error as not available", async () => {
    const lookup = vi.fn(async (_credentials: unknown, id: string) => (id === pass30.itemPriceId ? { id, status: "active", currency_code: "USD", price: 2_400, period: 1, period_unit: "month" } : null));
    const ids = await availablePriceIds([pass30, pass90, pass30], { credentials, lookup });
    expect([...ids]).toEqual([pass30.itemPriceId]);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(await isPriceAvailable(pass30, { credentials, lookup })).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(2);
    const failing = vi.fn(async () => { throw new Error("network"); });
    expect(await isPriceAvailable(pack, { credentials, lookup: failing })).toBe(false);
    expect(await isPriceAvailable(pack, { credentials: null, lookup })).toBe(false);
  });

  it("a missing item price reads as null, other provider failures throw", async () => {
    provider(() => ({ status: 404, body: { api_error_code: "resource_not_found" } }));
    expect(await retrieveItemPrice(credentials, "skipwait_start_30d-USD")).toBeNull();
    provider(() => ({ status: 500, body: {} }));
    await expect(retrieveItemPrice(credentials, "skipwait_start_30d-USD")).rejects.toBeInstanceOf(ChargebeeApiError);
  });
});

describe("billing account calls", () => {
  it("lists only the customer's own valid sources", async () => {
    provider(() => ({ body: { list: [
      { payment_source: { id: "pm_1", customer_id: "cust_1", type: "card", status: "valid", card: { brand: "visa", last4: "4242", expiry_month: 8, expiry_year: 2028 } } },
      { payment_source: { id: "pm_x", customer_id: "cust_other", type: "card", status: "valid" } },
      { payment_source: { id: "pm_bad", customer_id: "cust_1", type: "card", status: "invalid" } },
    ] } }));
    const sources = await listPaymentSources(credentials, "cust_1");
    expect(sources.map(source => source.id)).toEqual(["pm_1"]);
    expect(calls[0].url).toBe("https://fixture-test.chargebee.com/api/v2/payment_sources?customer_id%5Bis%5D=cust_1&limit=20");
  });

  it("renders the kit rows from source labels, never card numbers", () => {
    expect(paymentMethodFromSource({ id: "pm_1", customer_id: "c", type: "card", card: { brand: "visa", last4: "4242", expiry_month: 8, expiry_year: 2028 } }, "pm_1")).toEqual({ id: "pm_1", type: "card", label: "Visa •••• 4242", detail: "Default · expires 08/28", isDefault: true });
    expect(paymentMethodFromSource({ id: "pm_2", customer_id: "c", type: "upi", upi: { vpa: "asha@okbank" } }, "pm_1")).toEqual({ id: "pm_2", type: "upi", label: "UPI · asha@okbank", detail: "India only · AutoPay mandate", isDefault: false });
    expect(paymentMethodFromSource({ id: "pm_3", customer_id: "c", type: "paypal_express_checkout" }, null)).toMatchObject({ type: "paypal", label: "PayPal", detail: "Outside India" });
    expect(paymentMethodFromSource({ id: "pm_4", customer_id: "c", type: "card", status: "expired", card: { brand: "rupay", last4: "1111" } }, null)).toMatchObject({ label: "RuPay •••• 1111", detail: "Expired" });
    expect(paymentMethodFromSource({ id: "pm_5", customer_id: "c", type: "upi", upi: { vpa: `${"a".repeat(90)}@bank` } }, null).label).toHaveLength(80);
  });

  it("collecting a due invoice reports paid, or the mapped failure from a declined charge", async () => {
    provider(() => ({ body: { invoice: { id: "inv_9", status: "paid" } } }));
    expect(await collectInvoicePayment(credentials, "inv_9")).toEqual({ status: "paid" });
    provider(() => ({ status: 402, body: { api_error_code: "payment_processing_failed", error_code: "card_declined", message: "Your card was declined." } }));
    expect(await collectInvoicePayment(credentials, "inv_9")).toEqual({ status: "failed", failureReason: "card_declined", failureCode: "card_declined" });
    provider(() => ({ status: 500, body: {} }));
    await expect(collectInvoicePayment(credentials, "inv_9")).rejects.toBeInstanceOf(ChargebeeApiError);
  });
});
