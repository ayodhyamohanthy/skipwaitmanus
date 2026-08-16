import { describe, expect, it } from "vitest";
import { basicAuthMatches, buildCheckoutForm, CHARGEBEE_TOKEN_PACKS, parsePaidPaymentEvent, tokenPackFromAmount } from "./chargebee";

describe("Chargebee payment contract", () => {
  it("maps only the approved INR Razorpay token", () => {
    expect(CHARGEBEE_TOKEN_PACKS["skipwait_token_1-INR"]).toEqual({ tokenCount: 1, amount: 9900, currency: "INR" });
    expect(tokenPackFromAmount(9900, "INR")).toEqual({ tokenCount: 1, itemPriceId: "skipwait_token_1-INR" });
    expect(tokenPackFromAmount(999)).toBeUndefined();
  });

  it("accepts the dedicated webhook Basic Auth and rejects other credentials", () => {
    const encoded = Buffer.from("skipwait:test-webhook-secret").toString("base64");
    expect(basicAuthMatches(`Basic ${encoded}`, "test-webhook-secret")).toBe(true);
    expect(basicAuthMatches(`Basic ${encoded}`, "different-secret")).toBe(false);
    expect(basicAuthMatches(undefined, "test-webhook-secret")).toBe(false);
  });

  it("accepts only paid INR events with a Chargebee event id", () => {
    const payload = { id: "ev_test_1", event_type: "payment_succeeded", content: { payment: { amount: 9900, currency_code: "INR", hosted_page_id: "hp_test", invoice_id: "inv_test" }, hosted_page: { pass_thru_content: "intent_test" } } };
    expect(parsePaidPaymentEvent(payload)).toEqual({ eventId: "ev_test_1", hostedPageId: "hp_test", invoiceId: "inv_test", customerId: undefined, passThruContent: "intent_test", amount: 9900, currency: "INR" });
    expect(parsePaidPaymentEvent({ ...payload, event_type: "invoice_generated" })).toBeUndefined();
    expect(parsePaidPaymentEvent({ ...payload, content: { payment: { ...payload.content.payment, currency_code: "USD" } } })).toBeUndefined();
  });

  it("builds a hosted one-time checkout form for the selected item price", () => {
    const form = buildCheckoutForm({ itemPriceId: "skipwait_token_1-INR", email: "user@example.com", redirectUrl: "https://skipwait.me/premium?payment=pending", cancelUrl: "https://skipwait.me/premium?payment=cancelled", checkoutIntentId: "intent_test" });
    expect(form.get("item_prices[item_price_id][0]")).toBe("skipwait_token_1-INR");
    expect(form.get("item_prices[quantity][0]")).toBe("1");
    expect(form.get("currency_code")).toBe("INR");
    expect(form.get("pass_thru_content")).toBe("intent_test");
    expect(form.get("customer[email]")).toBe("user@example.com");
  });
});
