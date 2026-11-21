import { afterEach, describe, expect, it, vi } from "vitest";
import { createBandedPlanPage, createBandedReferralPage } from "./bandedCheckoutProvider";

const credentials = { site: "fixture-test", apiKey: "fixture-key" };
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };

function stubProvider() {
  const seen: Array<{ url: string; headers: Record<string, string>; form: URLSearchParams }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string>; body: URLSearchParams }) => {
    seen.push({ url, headers: init.headers, form: new URLSearchParams(init.body.toString()) });
    return new Response(JSON.stringify({ hosted_page: { id: "hp_fixture", url: "https://fixture-test.chargebee.com/pages/v4/hp_fixture/checkout" } }), { status: 200 });
  }));
  return seen;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("banded plan hosted page", () => {
  it("opens a renewing monthly subscription to the one plan item price, keyed for idempotency", async () => {
    const seen = stubProvider();
    const page = await createBandedPlanPage(credentials, { itemPriceId: "skipwait_early_to_mid_monthly-INR", checkoutIntentId: "bp_abc", idempotencyKey: "bp_abc", billingCountry: "IN", email: "member@example.com", firstName: "Sam", ...urls });
    expect(page).toEqual({ hostedPageId: "hp_fixture", checkoutUrl: "https://fixture-test.chargebee.com/pages/v4/hp_fixture/checkout" });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_new_for_items");
    expect(seen[0].headers["chargebee-idempotency-key"]).toBe("bp_abc");
    const form = seen[0].form;
    expect(form.get("subscription_items[item_price_id][0]")).toBe("skipwait_early_to_mid_monthly-INR");
    expect(form.get("subscription_items[quantity][0]")).toBe("1");
    // A monthly plan renews until cancelled: no fixed cycle count (unlike a pass).
    expect(form.has("subscription_items[billing_cycles][0]")).toBe(false);
    expect(form.get("pass_thru_content")).toBe("bp_abc");
    expect(form.get("billing_address[country]")).toBe("IN");
    expect(form.get("customer[email]")).toBe("member@example.com");
    expect(form.get("redirect_url")).toBe(urls.redirectUrl);
    expect(form.get("cancel_url")).toBe(urls.cancelUrl);
    expect([...form.keys()].some(key => key.includes("discount") || key.includes("coupon"))).toBe(false);
  });

  it("leaves the billing country to the buyer on the global book", async () => {
    const seen = stubProvider();
    await createBandedPlanPage(credentials, { itemPriceId: "skipwait_early_to_mid_monthly-USD", checkoutIntentId: "bp_abc", idempotencyKey: "bp_abc", billingCountry: "INTL", ...urls });
    expect(seen[0].form.has("billing_address[country]")).toBe(false);
  });
});

describe("banded extra-referral hosted page", () => {
  it("sends each level as its own charge line with quantity, the currency, and the discount as a fixed invoice amount", async () => {
    const seen = stubProvider();
    await createBandedReferralPage(credentials, {
      lines: [{ itemPriceId: "skipwait_referral_early-INR", quantity: 3 }, { itemPriceId: "skipwait_referral_mid-INR", quantity: 2 }],
      currency: "INR", discountAmount: 1_090, checkoutIntentId: "br_abc", idempotencyKey: "br_abc", billingCountry: "IN", ...urls,
    });
    expect(seen[0].url).toBe("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_one_time_for_items");
    expect(seen[0].headers["chargebee-idempotency-key"]).toBe("br_abc");
    const form = seen[0].form;
    expect(form.get("item_prices[item_price_id][0]")).toBe("skipwait_referral_early-INR");
    expect(form.get("item_prices[quantity][0]")).toBe("3");
    expect(form.get("item_prices[item_price_id][1]")).toBe("skipwait_referral_mid-INR");
    expect(form.get("item_prices[quantity][1]")).toBe("2");
    expect(form.get("currency_code")).toBe("INR");
    expect(form.get("discounts[apply_on][0]")).toBe("invoice_amount");
    expect(form.get("discounts[amount][0]")).toBe("1090");
    expect(form.has("discounts[percentage][0]")).toBe(false);
    expect(form.get("pass_thru_content")).toBe("br_abc");
    expect(form.get("billing_address[country]")).toBe("IN");
  });

  it("sends no discount entry when the cart earns none", async () => {
    const seen = stubProvider();
    await createBandedReferralPage(credentials, { lines: [{ itemPriceId: "skipwait_referral_early-USD", quantity: 4 }], currency: "USD", discountAmount: 0, checkoutIntentId: "br_abc", idempotencyKey: "br_abc", billingCountry: "INTL", ...urls });
    expect([...seen[0].form.keys()].some(key => key.startsWith("discounts"))).toBe(false);
  });

  it("refuses to build a page with no lines, a bad quantity or a negative discount", async () => {
    stubProvider();
    const base = { currency: "USD" as const, discountAmount: 0, checkoutIntentId: "br_abc", idempotencyKey: "br_abc", billingCountry: "INTL" as const, ...urls };
    await expect(createBandedReferralPage(credentials, { ...base, lines: [] })).rejects.toThrow();
    await expect(createBandedReferralPage(credentials, { ...base, lines: [{ itemPriceId: "skipwait_referral_early-USD", quantity: 0 }] })).rejects.toThrow();
    await expect(createBandedReferralPage(credentials, { ...base, discountAmount: -1, lines: [{ itemPriceId: "skipwait_referral_early-USD", quantity: 1 }] })).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
