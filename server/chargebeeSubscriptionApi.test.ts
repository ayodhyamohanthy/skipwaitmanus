import { afterEach, describe, expect, it, vi } from "vitest";
import { createPackCheckout, createPlanCheckout } from "./chargebeeSubscriptionApi";

const credentials = { site: "skipwait-test", apiKey: "test_key" };
const customer = { email: "candidate@example.com", firstName: "Cand", lastName: "Idate", billingCountry: "IN" as const };
const urls = { redirectUrl: "https://skipwait.me/plans?payment=pending", cancelUrl: "https://skipwait.me/plans?payment=cancelled" };

function stubHostedPage() {
  const forms: URLSearchParams[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: { body?: unknown }) => { forms.push(new URLSearchParams(String((init as { body?: unknown })?.body ?? ""))); return { ok: true, status: 200, json: async () => ({ hosted_page: { id: "hp_1", url: "https://chargebee.test/hp_1" } }) }; }));
  return forms;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe("createPlanCheckout (kit pass or Keep warm)", () => {
  it("sells every kit plan term as non-renewing (billing_cycles = 1)", async () => {
    const forms = stubHostedPage();
    const result = await createPlanCheckout(credentials, { ...customer, ...urls, itemPriceId: "skipwait_momentum_90d-INR", checkoutIntentId: "intent_1" });
    expect(result.checkoutUrl).toBe("https://chargebee.test/hp_1");
    expect(forms).toHaveLength(1);
    expect(forms[0].get("subscription_items[item_price_id][0]")).toBe("skipwait_momentum_90d-INR");
    expect(forms[0].get("subscription_items[billing_cycles][0]")).toBe("1");
    expect(forms[0].get("pass_thru_content")).toBe("intent_1");
  });
});

describe("createPackCheckout (one-time credit pack)", () => {
  it("stays a one-time charge with no billing_cycles", async () => {
    const forms = stubHostedPage();
    await createPackCheckout(credentials, { ...customer, ...urls, itemPriceId: "skipwait_pack_25-INR", currency: "INR", checkoutIntentId: "intent_2" });
    expect(forms[0].get("item_prices[item_price_id][0]")).toBe("skipwait_pack_25-INR");
    expect(forms[0].get("subscription_items[billing_cycles][0]")).toBeNull();
  });
});
