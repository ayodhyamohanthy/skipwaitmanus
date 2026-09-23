import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildGiftSubscriptionCheckoutForm,
  createGiftSubscriptionCheckout,
  parseGiftEvent,
  retrieveGiftSubscriptionPlan,
} from "./chargebee";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const claimedPayload = (overrides: Record<string, unknown> = {}) => ({
  id: "ev_gift_claimed_1",
  event_type: "gift_claimed",
  content: {
    gift: {
      id: "gift_abc123",
      status: "claimed",
      resource_version: 1517469689000,
      gifter: { customer_id: "skipwait-u42", signature: "Sam" },
      gift_receiver: {
        customer_id: "receiver",
        email: "James@User.com",
        first_name: "James",
        subscription_id: "sub_gifted_1",
      },
      ...overrides,
    },
  },
});

describe("parseGiftEvent", () => {
  it.each(["gift_scheduled", "gift_unclaimed", "gift_claimed", "gift_expired", "gift_cancelled", "gift_updated"])("parses %s with buyer and receiver linkage", eventType => {
    const parsed = parseGiftEvent({ ...claimedPayload(), event_type: eventType });
    expect(parsed).toMatchObject({
      eventId: "ev_gift_claimed_1",
      eventType,
      giftId: "gift_abc123",
      status: "claimed",
      receiverEmail: "james@user.com",
      receiverCustomerId: "receiver",
      subscriptionId: "sub_gifted_1",
      buyerUserId: 42,
      gifterSignature: "Sam",
    });
  });

  it("rejects non-gift events and malformed gifts", () => {
    expect(parseGiftEvent({ id: "e1", event_type: "subscription_created", content: {} })).toBeUndefined();
    expect(parseGiftEvent({ id: "e1", event_type: "gift_claimed", content: {} })).toBeUndefined();
    expect(parseGiftEvent({ event_type: "gift_claimed", content: { gift: { id: "g1" } } })).toBeUndefined();
    expect(parseGiftEvent(undefined)).toBeUndefined();
  });

  it("never trusts an unverified receiver email verbatim", () => {
    const parsed = parseGiftEvent(claimedPayload({ gift_receiver: { email: "not-an-email", subscription_id: "s1" } }));
    expect(parsed?.receiverEmail).toBeUndefined();
    expect(parsed?.subscriptionId).toBe("s1");
  });

  it("ignores foreign gifter references instead of attributing", () => {
    const parsed = parseGiftEvent(claimedPayload({ gifter: { customer_id: "gifter" } }));
    expect(parsed?.buyerUserId).toBeUndefined();
    expect(parsed?.giftId).toBe("gift_abc123");
  });
});

describe("buildGiftSubscriptionCheckoutForm", () => {
  it("targets the plan price with the buyer reference and no receiver PII", () => {
    const form = buildGiftSubscriptionCheckoutForm({ plan: "pro", currency: "USD", gifterCustomerId: "skipwait-u7", redirectUrl: "https://skipwait.me/plans?gift=done", cancelUrl: "https://skipwait.me/plans?gift=cancelled" });
    expect(form.get("subscription_items[item_price_id][0]")).toBe("skipwait_pro_monthly-USD");
    expect(form.get("subscription_items[quantity][0]")).toBe("1");
    expect(form.get("gifter[customer_id]")).toBe("skipwait-u7");
    expect(form.get("redirect_url")).toBe("https://skipwait.me/plans?gift=done");
  });
});

describe("createGiftSubscriptionCheckout", () => {
  it("posts to the gift checkout endpoint and returns the hosted page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_gift_for_items");
      const body = String(init?.body);
      expect(body).toContain("gifter%5Bcustomer_id%5D=skipwait-u7");
      expect(body).toContain("skipwait_pro_monthly-USD");
      return { ok: true, json: async () => ({ hosted_page: { id: "hp_gift_1", url: "https://checkout.example/gift" } }) };
    }));
    const result = await createGiftSubscriptionCheckout({ plan: "pro", currency: "USD", buyerUserId: 7, site: "fixture-test", apiKey: "k", redirectUrl: "https://skipwait.me/r", cancelUrl: "https://skipwait.me/c" });
    expect(result).toEqual({ checkoutUrl: "https://checkout.example/gift", hostedPageId: "hp_gift_1" });
  });

  it("fails closed without an API key or on provider error", async () => {
    vi.stubEnv("CHARGEBEE_API_KEY", "");
    await expect(createGiftSubscriptionCheckout({ plan: "pro", currency: "USD", buyerUserId: 7, site: "s", redirectUrl: "r", cancelUrl: "c" })).rejects.toThrow("not configured");
    vi.stubEnv("CHARGEBEE_API_KEY", "k");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ message: "nope" }) })));
    await expect(createGiftSubscriptionCheckout({ plan: "pro", currency: "USD", buyerUserId: 7, site: "s", apiKey: "k", redirectUrl: "r", cancelUrl: "c" })).rejects.toThrow("gift checkout failed (400)");
  });
});

describe("retrieveGiftSubscriptionPlan", () => {
  it("resolves plan and currency from the provider subscription", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      expect(String(url)).toContain("/api/v2/subscriptions/sub_gifted_1");
      return { ok: true, json: async () => ({ subscription: { id: "sub_gifted_1", status: "non_renewing", currency_code: "USD", subscription_items: [{ item_price_id: "skipwait_max_monthly-USD" }] } }) };
    }));
    await expect(retrieveGiftSubscriptionPlan("sub_gifted_1", { site: "s", apiKey: "k" })).resolves.toMatchObject({ subscriptionId: "sub_gifted_1", plan: "max", currency: "USD", status: "non_renewing" });
  });

  it("returns undefined when the provider has no matching subscription", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })));
    await expect(retrieveGiftSubscriptionPlan("sub_missing", { site: "s", apiKey: "k" })).resolves.toBeUndefined();
  });
});
