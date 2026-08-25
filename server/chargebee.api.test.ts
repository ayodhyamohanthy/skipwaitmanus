import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChargebeeCheckout, createChargebeeSubscriptionCheckout, getChargebeeEventId, isTokenPackId, resolveChargebeeHostedPageForPayment, retrieveChargebeeHostedPage, scheduleChargebeeSubscriptionCancellation } from "./chargebee";

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function succeededHostedPage(overrides: Record<string, unknown> = {}) {
  return { hosted_page: { id: "hp_1", state: "succeeded", pass_thru_content: "intent_1", content: { invoice: { id: "inv_1", total: 9900, currency_code: "inr" } }, ...overrides } };
}

describe("Chargebee hosted page and subscription API calls", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    process.env.CHARGEBEE_SITE = "skipwait-test";
    process.env.CHARGEBEE_API_KEY = "cb-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.CHARGEBEE_SITE;
    delete process.env.CHARGEBEE_API_KEY;
  });

  it("recognises only catalog token packs and non-empty Chargebee event ids", () => {
    expect(isTokenPackId("skipwait_token_1-INR")).toBe(true);
    expect(isTokenPackId("skipwait_pro_monthly-INR")).toBe(false);
    expect(isTokenPackId(undefined)).toBe(false);
    expect(getChargebeeEventId({ id: "ev_1" })).toBe("ev_1");
    expect(getChargebeeEventId({ id: "" })).toBeUndefined();
    expect(getChargebeeEventId({ id: 7 })).toBeUndefined();
  });

  it("verifies a succeeded hosted page against the configured site with Basic API-key auth", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(succeededHostedPage()));

    expect(await retrieveChargebeeHostedPage("hp_1")).toEqual({ hostedPageId: "hp_1", invoiceId: "inv_1", passThruContent: "intent_1", amount: 9900, currency: "INR" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://skipwait-test.chargebee.com/api/v2/hosted_pages/hp_1");
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from("cb-key:").toString("base64")}`);
  });

  it("rejects a hosted page that is unpaid, mismatched, or unavailable, and refuses to call without an API key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(succeededHostedPage({ state: "requested" })));
    expect(await retrieveChargebeeHostedPage("hp_1")).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse(succeededHostedPage({ id: "hp_other" })));
    expect(await retrieveChargebeeHostedPage("hp_1")).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    expect(await retrieveChargebeeHostedPage("hp_1")).toBeUndefined();

    delete process.env.CHARGEBEE_API_KEY;
    await expect(retrieveChargebeeHostedPage("hp_1")).rejects.toThrow("Chargebee API key is not configured");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("credits a payment only to the pending hosted page whose invoice, amount, and currency all match", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(succeededHostedPage({ id: "hp_other", content: { invoice: { id: "inv_other", total: 9900, currency_code: "INR" } } })))
      .mockResolvedValueOnce(jsonResponse(succeededHostedPage()));

    expect(await resolveChargebeeHostedPageForPayment({ invoiceId: "inv_1", amount: 9900, currency: "INR", pendingHostedPageIds: ["hp_other", "hp_1"] })).toMatchObject({ hostedPageId: "hp_1", passThruContent: "intent_1" });

    fetchMock.mockResolvedValue(jsonResponse(succeededHostedPage()));
    expect(await resolveChargebeeHostedPageForPayment({ invoiceId: "inv_1", amount: 100, currency: "USD", pendingHostedPageIds: ["hp_1"] })).toBeUndefined();
  });

  it("never looks up an unlinked payment and caps the pending hosted page scan", async () => {
    expect(await resolveChargebeeHostedPageForPayment({ amount: 9900, currency: "INR", pendingHostedPageIds: ["hp_1"] })).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse(succeededHostedPage({ id: "hp_unmatched", content: { invoice: { id: "inv_unmatched" } } })));
    expect(await resolveChargebeeHostedPageForPayment({ invoiceId: "inv_1", amount: 9900, currency: "INR", pendingHostedPageIds: Array.from({ length: 40 }, (_, index) => `hp_${index}`) })).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(25);
  });

  it("creates a one-time token checkout, forwards the checkout intent, and returns the Chargebee customer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hosted_page: { id: "hp_new", url: "https://skipwait-test.chargebee.com/pages/v3/hp_new", customer: { id: "cus_1" } } }));

    const checkout = await createChargebeeCheckout({ itemPriceId: "skipwait_token_1-INR", quantity: 2, email: "seeker@example.com", redirectUrl: "https://skipwait.me/premium?payment=pending", cancelUrl: "https://skipwait.me/premium?payment=cancelled", checkoutIntentId: "intent_1" });
    expect(checkout).toEqual({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_new", hostedPageId: "hp_new", checkoutIntentId: "intent_1", customerId: "cus_1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://skipwait-test.chargebee.com/api/v2/hosted_pages/checkout_one_time_for_items");
    expect(init.method).toBe("POST");
    expect((init.body as URLSearchParams).get("pass_thru_content")).toBe("intent_1");
    expect((init.body as URLSearchParams).get("item_prices[quantity][0]")).toBe("2");
  });

  it("generates a checkout intent when the caller supplies none and rejects an incomplete or failed hosted page", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hosted_page: { id: "hp_new", checkout_url: "https://skipwait-test.chargebee.com/pages/v3/hp_new" } }));
    const checkout = await createChargebeeCheckout({ itemPriceId: "skipwait_token_1-USD", redirectUrl: "https://skipwait.me/premium", cancelUrl: "https://skipwait.me/premium" });
    expect(checkout.checkoutIntentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(checkout.customerId).toBeUndefined();

    fetchMock.mockResolvedValueOnce(jsonResponse({ hosted_page: { id: "hp_new" } }));
    await expect(createChargebeeCheckout({ itemPriceId: "skipwait_token_1-USD", redirectUrl: "https://skipwait.me/premium", cancelUrl: "https://skipwait.me/premium" })).rejects.toThrow("incomplete hosted checkout");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 400));
    await expect(createChargebeeCheckout({ itemPriceId: "skipwait_token_1-USD", redirectUrl: "https://skipwait.me/premium", cancelUrl: "https://skipwait.me/premium" })).rejects.toThrow("Chargebee checkout failed (400)");
  });

  it("creates a recurring plan checkout on the new-subscription endpoint and surfaces a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ hosted_page: { id: "hp_sub", url: "https://skipwait-test.chargebee.com/pages/v3/hp_sub" } }));

    const checkout = await createChargebeeSubscriptionCheckout({ plan: "pro", currency: "USD", email: "seeker@example.com", redirectUrl: "https://skipwait.me/plans", cancelUrl: "https://skipwait.me/plans", checkoutIntentId: "intent_sub" });
    expect(checkout).toEqual({ checkoutUrl: "https://skipwait-test.chargebee.com/pages/v3/hp_sub", hostedPageId: "hp_sub", checkoutIntentId: "intent_sub" });
    expect(fetchMock.mock.calls[0][0]).toBe("https://skipwait-test.chargebee.com/api/v2/hosted_pages/checkout_new_for_items");
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("currency_code")).toBe("USD");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await expect(createChargebeeSubscriptionCheckout({ plan: "max", currency: "INR", redirectUrl: "https://skipwait.me/plans", cancelUrl: "https://skipwait.me/plans" })).rejects.toThrow("Chargebee subscription checkout failed (500)");
  });

  it("cancels a subscription at end of term and keeps the paid term end date", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscription: { id: "sub_1", status: "non_renewing", current_term_end: 1_800_000_000 } }));

    expect(await scheduleChargebeeSubscriptionCancellation({ subscriptionId: "sub_1" })).toEqual({ status: "non_renewing", currentTermEnd: new Date(1_800_000_000 * 1000) });
    expect(fetchMock.mock.calls[0][0]).toBe("https://skipwait-test.chargebee.com/api/v2/subscriptions/sub_1/cancel_for_items");
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("cancel_option")).toBe("end_of_term");
  });

  it("rejects a cancellation response for another subscription, a failed call, or an unset API key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ subscription: { id: "sub_other", status: "non_renewing" } }));
    await expect(scheduleChargebeeSubscriptionCancellation({ subscriptionId: "sub_1" })).rejects.toThrow("incomplete cancellation response");

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 502));
    await expect(scheduleChargebeeSubscriptionCancellation({ subscriptionId: "sub_1" })).rejects.toThrow("Chargebee cancellation failed (502)");

    delete process.env.CHARGEBEE_API_KEY;
    await expect(scheduleChargebeeSubscriptionCancellation({ subscriptionId: "sub_1" })).rejects.toThrow("Chargebee API key is not configured");
  });
});
