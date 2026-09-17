import { afterEach, describe, expect, it, vi } from "vitest";
import { basicAuthMatches, buildCheckoutForm, buildSubscriptionCheckoutForm, CHARGEBEE_TOKEN_PACKS, createChargebeeCheckout, createChargebeeSubscriptionCheckout, isTokenQuantity, parsePaidPaymentEvent, parseSubscriptionEvent, resolveChargebeeHostedPageForPayment, tokenPackFromAmount } from "./chargebee";
import { SUBSCRIPTION_PLANS, currentMonthlyCycleKey, subscriptionPlanFromItemPrice } from "../shared/subscriptionPlans";

describe("Chargebee payment contract", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it.each(["INR", "USD"] as const)("sends the recurring checkout wire contract for %s", async currency => {
    const provider = vi.fn(async (_url: unknown, options?: RequestInit) => {
      const form = options?.body as URLSearchParams;
      return new Response(JSON.stringify({ hosted_page: { id: "hp_subscription", url: "https://checkout.example/plan" } }), { status: form.get("subscription_items[item_price_id][0]") ? 200 : 400 });
    });
    vi.stubGlobal("fetch", provider);
    await expect(createChargebeeSubscriptionCheckout({ plan: "pro", currency, site: "fixture-test", apiKey: "fixture-key", redirectUrl: "https://app.example/plans", cancelUrl: "https://app.example/plans", checkoutIntentId: "intent_subscription" })).resolves.toMatchObject({ hostedPageId: "hp_subscription" });
    expect(provider).toHaveBeenCalledWith("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_new_for_items", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }));
    const form = provider.mock.calls[0][1]?.body as URLSearchParams;
    expect(form.get("subscription_items[item_price_id][0]")).toBe(`skipwait_pro_monthly-${currency}`);
    expect(form.get("subscription_items[quantity][0]")).toBe("1");
    expect(form.get("pass_thru_content")).toBe("intent_subscription");
    expect(form.has("item_prices[item_price_id][0]")).toBe(false);
    expect(form.has("currency_code")).toBe(false);
  });

  it("preserves the one-time wire contract and bounds the provider request", async () => {
    const provider = vi.fn(async () => new Response(JSON.stringify({ hosted_page: { id: "hp_tokens", url: "https://checkout.example/tokens" } })));
    vi.stubGlobal("fetch", provider);
    await createChargebeeCheckout({ itemPriceId: "skipwait_token_1-INR", quantity: 3, site: "fixture-test", apiKey: "fixture-key", redirectUrl: "https://app.example/premium", cancelUrl: "https://app.example/premium", checkoutIntentId: "intent_tokens" });
    expect(provider).toHaveBeenCalledWith("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_one_time_for_items", expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal), body: expect.any(URLSearchParams) }));
  });

  it("uses the selected runtime for both hosted-page and invoice lookups", async () => {
    vi.stubEnv("CHARGEBEE_SITE", "default-fixture");
    vi.stubEnv("CHARGEBEE_API_KEY", "default-key");
    const provider = vi.fn(async (input: unknown, _options?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/hosted_pages/hp_runtime")) return new Response(JSON.stringify({ hosted_page: { id: "hp_runtime", state: "succeeded", pass_thru_content: "intent_runtime", content: { invoice: { id: "inv_runtime" } } } }));
      if (url.endsWith("/invoices/inv_runtime")) return new Response(JSON.stringify({ invoice: { id: "inv_runtime", status: "paid", total: 9900, amount_paid: 9900, currency_code: "INR" } }));
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", provider);
    await expect(resolveChargebeeHostedPageForPayment({ invoiceId: "inv_runtime", amount: 9900, currency: "INR", pendingHostedPageIds: ["hp_runtime"], site: "selected-fixture", apiKey: "selected-key" })).resolves.toMatchObject({ hostedPageId: "hp_runtime", paid: true });
    expect(provider.mock.calls.map(([url]) => url)).toEqual(["https://selected-fixture.chargebee.com/api/v2/hosted_pages/hp_runtime", "https://selected-fixture.chargebee.com/api/v2/invoices/inv_runtime"]);
    for (const [, options] of provider.mock.calls) expect(options?.headers).toEqual({ Authorization: `Basic ${Buffer.from("selected-key:").toString("base64")}` });
  });
  it("maps only the supported INR and USD Razorpay token prices", () => {
    expect(CHARGEBEE_TOKEN_PACKS["skipwait_token_1-INR"]).toEqual({ tokenCount: 1, amount: 9900, currency: "INR" });
    expect(CHARGEBEE_TOKEN_PACKS["skipwait_token_1-USD"]).toEqual({ tokenCount: 1, amount: 100, currency: "USD" });
    expect(tokenPackFromAmount(9900, "INR")).toEqual({ tokenCount: 1, itemPriceId: "skipwait_token_1-INR" });
    expect(tokenPackFromAmount(100, "USD")).toEqual({ tokenCount: 1, itemPriceId: "skipwait_token_1-USD" });
    expect(tokenPackFromAmount(29_700, "INR")).toEqual({ tokenCount: 3, itemPriceId: "skipwait_token_1-INR" });
    expect(tokenPackFromAmount(500, "USD")).toEqual({ tokenCount: 5, itemPriceId: "skipwait_token_1-USD" });
    expect(tokenPackFromAmount(100, "EUR")).toBeUndefined();
    expect(tokenPackFromAmount(10_000, "INR")).toBeUndefined();
    expect(isTokenQuantity(1)).toBe(true);
    expect(isTokenQuantity(1000)).toBe(true);
    expect(isTokenQuantity(0)).toBe(false);
    expect(isTokenQuantity(1.5)).toBe(false);
  });

  it("accepts the dedicated webhook Basic Auth and rejects other credentials", () => {
    const encoded = Buffer.from("skipwait:test-webhook-secret").toString("base64");
    expect(basicAuthMatches(`Basic ${encoded}`, "test-webhook-secret")).toBe(true);
    expect(basicAuthMatches(`Basic ${encoded}`, "different-secret")).toBe(false);
    expect(basicAuthMatches(undefined, "test-webhook-secret")).toBe(false);
  });

  it("accepts only paid INR or USD events with a Chargebee event id", () => {
    const payload = { id: "ev_test_1", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_test", invoice_id: "inv_test" }, hosted_page: { pass_thru_content: "intent_test" } } };
    expect(parsePaidPaymentEvent(payload)).toEqual({ eventId: "ev_test_1", hostedPageId: "hp_test", invoiceId: "inv_test", passThruContent: "intent_test", amount: 9900, currency: "INR" });
    expect(parsePaidPaymentEvent({ ...payload, event_type: "invoice_generated" })).toBeUndefined();
    expect(parsePaidPaymentEvent({ ...payload, content: { payment: { ...payload.content.payment, currency_code: "EUR" } } })).toBeUndefined();
    expect(parsePaidPaymentEvent({ ...payload, content: { payment: { ...payload.content.payment, amount: 100, currency_code: "USD" } } })).toMatchObject({ amount: 100, currency: "USD" });
    expect(parsePaidPaymentEvent({ id: "ev_v2", event_type: "payment_succeeded", api_version: "v2", content: { transaction: { amount: 9900, currency_code: "INR" }, invoice: { id: "inv_v2", total: 9900, currency_code: "INR" } } })).toEqual({ eventId: "ev_v2", invoiceId: "inv_v2", hostedPageId: undefined, passThruContent: undefined, amount: 9900, currency: "INR" });
  });

  it("builds a hosted one-time checkout form for the selected item price", () => {
    const form = buildCheckoutForm({ itemPriceId: "skipwait_token_1-INR", quantity: 4, email: "user@example.com", billingAddress: { firstName: "Test", lastName: "Customer", line1: "1 Test Street", city: "Bengaluru", stateCode: "KA", country: "IN" }, redirectUrl: "https://skipwait.me/premium?payment=pending", cancelUrl: "https://skipwait.me/premium?payment=cancelled", checkoutIntentId: "intent_test" });
    expect(form.get("item_prices[item_price_id][0]")).toBe("skipwait_token_1-INR");
    expect(form.get("item_prices[quantity][0]")).toBe("4");
    expect(form.get("currency_code")).toBe("INR");
    expect(form.get("pass_thru_content")).toBe("intent_test");
    expect(form.get("customer[email]")).toBe("user@example.com");
    expect(form.get("billing_address[country]")).toBe("IN");
    expect(form.get("billing_address[state_code]")).toBe("KA");
    expect(form.get("billing_address[city]")).toBe("Bengaluru");
  });

  it("maps the approved recurring Pro and Max catalog without conflating it with one-time credits", () => {
    expect(SUBSCRIPTION_PLANS.pro.monthlyAllowance).toBe(10);
    expect(SUBSCRIPTION_PLANS.max.monthlyAllowance).toBe(30);
    expect(subscriptionPlanFromItemPrice("skipwait_pro_monthly-INR")).toEqual({ plan: "pro", currency: "INR", amount: 59_900 });
    expect(subscriptionPlanFromItemPrice("skipwait_pro_monthly-USD")).toEqual({ plan: "pro", currency: "USD", amount: 700 });
    expect(subscriptionPlanFromItemPrice("skipwait_max_monthly-USD")).toEqual({ plan: "max", currency: "USD", amount: 1_500 });
    expect(subscriptionPlanFromItemPrice("skipwait_token_1-INR")).toBeUndefined();
    expect(currentMonthlyCycleKey(new Date("2026-08-31T23:00:00.000Z"))).toBe("2026-08");
    expect(currentMonthlyCycleKey(new Date("2026-09-01T00:00:00.000Z"))).toBe("2026-09");
  });

  it("builds an end-to-end recurring hosted checkout form and parses a verified active subscription event", () => {
    const form = buildSubscriptionCheckoutForm({ plan: "pro", currency: "INR", email: "user@example.com", redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled", checkoutIntentId: "subscription_intent" });
    expect(form.get("subscription_items[item_price_id][0]")).toBe("skipwait_pro_monthly-INR");
    expect(form.get("subscription_items[quantity][0]")).toBe("1");
    expect(form.has("item_prices[item_price_id][0]")).toBe(false);
    expect(form.has("currency_code")).toBe(false);
    expect(form.get("pass_thru_content")).toBe("subscription_intent");
    const event = parseSubscriptionEvent({ id: "ev_subscription", event_type: "payment_succeeded", content: { hosted_page: { id: "hp_subscription", pass_thru_content: "subscription_intent" }, subscription: { id: "sub_pro", status: "active", currency_code: "INR", resource_version: 12, current_term_start: 1_786_900_000, current_term_end: 1_789_500_000, subscription_items: [{ item_price_id: "skipwait_pro_monthly-INR" }] } } });
    expect(event).toMatchObject({ eventId: "ev_subscription", subscriptionId: "sub_pro", plan: "pro", status: "active", currency: "INR", hostedPageId: "hp_subscription", passThruContent: "subscription_intent" });
  });
});
