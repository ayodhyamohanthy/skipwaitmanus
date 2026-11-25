import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createGroupCheckoutPages,
  groupCheckoutRequestSchema,
  groupIdempotencyKey,
  groupPageForm,
  isStaleGroupProviderEvent,
  planGroupCheckout,
  readGroupProviderEvent,
  type GroupCheckoutRequest,
} from "./groupPlanProvider";

const credentials = { site: "fixture-test", apiKey: "fixture-key" };
const urls = { redirectUrl: "https://skipwait.me/groups?payment=pending", cancelUrl: "https://skipwait.me/groups?payment=cancelled" };

/** A single-band group: one recurring plan component for one candidate. */
const singleBand: GroupCheckoutRequest = {
  site: "fixture-test",
  policyVersion: "policy-2026-11-25",
  currency: "INR",
  components: [{ itemPriceId: "skipwait_early_to_mid_monthly-INR", quantity: 1, kind: "recurring" }],
  discountAmount: 0,
  checkoutIntentId: "gp_intent_1",
  billingCountry: "IN",
  ...urls,
};

function stubProvider() {
  const seen: Array<{ url: string; headers: Record<string, string>; form: URLSearchParams; signal: unknown }> = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { headers: Record<string, string>; body: URLSearchParams; signal: unknown }) => {
    seen.push({ url, headers: init.headers, form: new URLSearchParams(init.body.toString()), signal: init.signal });
    return new Response(JSON.stringify({ hosted_page: { id: "hp_fixture", url: "https://fixture-test.chargebee.com/pages/v4/hp_fixture/checkout" } }), { status: 200 });
  }));
  return seen;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("group checkout plan (no provider call)", () => {
  it("a single-band group maps to one recurring page with no separate-page claim", () => {
    const plan = planGroupCheckout(singleBand, "fixture-test");
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].kind).toBe("recurring");
    expect(plan.pages[0].components).toEqual([{ itemPriceId: "skipwait_early_to_mid_monthly-INR", quantity: 1, kind: "recurring" }]);
    expect(plan.requiresSeparatePages).toBe(false);
  });

  it("a mixed-band order keeps every band on one recurring page, in order", () => {
    const plan = planGroupCheckout({
      ...singleBand,
      components: [
        { itemPriceId: "skipwait_early_to_mid_monthly-INR", quantity: 2, kind: "recurring" },
        { itemPriceId: "skipwait_mid_to_senior_monthly-INR", quantity: 1, kind: "recurring" },
        { itemPriceId: "skipwait_senior_to_exec_monthly-INR", quantity: 1, kind: "recurring" },
      ],
    }, "fixture-test");
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].components.map(component => component.itemPriceId)).toEqual([
      "skipwait_early_to_mid_monthly-INR",
      "skipwait_mid_to_senior_monthly-INR",
      "skipwait_senior_to_exec_monthly-INR",
    ]);
  });

  it("a one-seat addition is a valid order of one component", () => {
    const plan = planGroupCheckout({ ...singleBand, checkoutIntentId: "gp_add_1", components: [{ itemPriceId: "skipwait_mid_to_senior_monthly-INR", quantity: 1, kind: "recurring" }] }, "fixture-test");
    expect(plan.pages).toHaveLength(1);
    expect(plan.pages[0].components[0].quantity).toBe(1);
  });

  it("an order with both recurring and one-time components needs two pages and never claims atomicity", () => {
    const plan = planGroupCheckout({
      ...singleBand,
      components: [
        { itemPriceId: "skipwait_mid_to_senior_monthly-INR", quantity: 1, kind: "recurring" },
        { itemPriceId: "skipwait_extra_referrals_mid-INR", quantity: 2, kind: "one_time" },
      ],
    }, "fixture-test");
    expect(plan.pages.map(page => page.kind)).toEqual(["recurring", "one_time"]);
    expect(plan.requiresSeparatePages).toBe(true);
    // Each page carries its own key: the two pages are separate provider objects.
    expect(plan.pages[0].idempotencyKey).not.toBe(plan.pages[1].idempotencyKey);
  });

  it("refuses a wrong site before any provider call", () => {
    expect(() => planGroupCheckout(singleBand, "skipwait-live")).toThrow(/wrong site/i);
  });

  it("refuses an order with no approved policy version", () => {
    expect(() => planGroupCheckout({ ...singleBand, policyVersion: "  " }, "fixture-test")).toThrow(/policy version/i);
  });

  it("rejects a component with a non-positive quantity at the boundary", () => {
    expect(() => groupCheckoutRequestSchema.parse({ ...singleBand, components: [{ itemPriceId: "x", quantity: 0, kind: "recurring" }] })).toThrow();
  });
});

describe("idempotency keys", () => {
  it("are deterministic per intent and page, so a retry replays the same page", () => {
    expect(groupIdempotencyKey("gp_intent_1", "recurring")).toBe(groupIdempotencyKey("gp_intent_1", "recurring"));
    expect(groupIdempotencyKey("gp_intent_1", "recurring")).not.toBe(groupIdempotencyKey("gp_intent_1", "one_time"));
    expect(groupIdempotencyKey("gp_intent_1", "recurring")).not.toBe(groupIdempotencyKey("gp_intent_2", "recurring"));
  });

  it("stays inside Chargebee's 100-character bound and keeps long intents distinct", () => {
    const long = "gp_" + "a".repeat(180);
    const other = "gp_" + "a".repeat(179) + "b";
    const first = groupIdempotencyKey(long, "recurring");
    const second = groupIdempotencyKey(other, "recurring");
    expect(first.length).toBeLessThanOrEqual(100);
    expect(second.length).toBeLessThanOrEqual(100);
    expect(first).not.toBe(second);
  });
});

describe("group page form", () => {
  it("sends the exact recurring fields and no amount", () => {
    const plan = planGroupCheckout(singleBand, "fixture-test");
    const form = groupPageForm(plan.pages[0], singleBand);
    expect(form.get("subscription_items[item_price_id][0]")).toBe("skipwait_early_to_mid_monthly-INR");
    expect(form.get("subscription_items[quantity][0]")).toBe("1");
    expect(form.get("pass_thru_content")).toBe("gp_intent_1");
    expect(form.get("billing_address[country]")).toBe("IN");
    expect(form.get("redirect_url")).toBe(urls.redirectUrl);
    expect(form.get("cancel_url")).toBe(urls.cancelUrl);
    // The adapter never sends a price: Chargebee charges the provisioned item price.
    expect(Array.from(form.keys()).some(key => /price|amount/.test(key) && !key.includes("item_price_id"))).toBe(false);
  });

  it("sends the fixed discount as a whole minor-unit amount on the invoice", () => {
    const order = { ...singleBand, discountAmount: 22900 };
    const plan = planGroupCheckout(order, "fixture-test");
    const form = groupPageForm(plan.pages[0], order);
    expect(form.get("discounts[apply_on][0]")).toBe("invoice_amount");
    expect(form.get("discounts[amount][0]")).toBe("22900");
  });

  it("sends the one-time fields with the currency and no subscription field", () => {
    const order: GroupCheckoutRequest = { ...singleBand, components: [{ itemPriceId: "skipwait_extra_referrals_mid-INR", quantity: 2, kind: "one_time" }] };
    const plan = planGroupCheckout(order, "fixture-test");
    const form = groupPageForm(plan.pages[0], order);
    expect(form.get("item_prices[item_price_id][0]")).toBe("skipwait_extra_referrals_mid-INR");
    expect(form.get("item_prices[quantity][0]")).toBe("2");
    expect(form.get("currency_code")).toBe("INR");
    expect(Array.from(form.keys()).some(key => key.startsWith("subscription_items"))).toBe(false);
  });
});

describe("createGroupCheckoutPages", () => {
  it("opens one recurring page with the idempotency header and a bounded deadline", async () => {
    const seen = stubProvider();
    const pages = await createGroupCheckoutPages(credentials, singleBand);
    expect(pages).toEqual([{ kind: "recurring", hostedPageId: "hp_fixture", checkoutUrl: "https://fixture-test.chargebee.com/pages/v4/hp_fixture/checkout" }]);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_new_for_items");
    expect(seen[0].headers["chargebee-idempotency-key"]).toBe(groupIdempotencyKey("gp_intent_1", "recurring"));
    expect(seen[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("opens both pages for a mixed order, each on its own endpoint", async () => {
    const seen = stubProvider();
    const pages = await createGroupCheckoutPages(credentials, {
      ...singleBand,
      components: [
        { itemPriceId: "skipwait_mid_to_senior_monthly-INR", quantity: 1, kind: "recurring" },
        { itemPriceId: "skipwait_extra_referrals_mid-INR", quantity: 2, kind: "one_time" },
      ],
    });
    expect(pages.map(page => page.kind)).toEqual(["recurring", "one_time"]);
    expect(seen.map(call => call.url)).toEqual([
      "https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_new_for_items",
      "https://fixture-test.chargebee.com/api/v2/hosted_pages/checkout_one_time_for_items",
    ]);
    expect(seen[1].form.get("currency_code")).toBe("INR");
  });

  it("makes no request at all for a wrong site", async () => {
    const seen = stubProvider();
    await expect(createGroupCheckoutPages(credentials, { ...singleBand, site: "someone-else" })).rejects.toThrow(/wrong site/i);
    expect(seen).toHaveLength(0);
  });

  it("rejects an unexpected provider response instead of reporting a page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ hosted_page: { id: "", url: "not-a-url" } }), { status: 200 })));
    // The shared helper turns a schema miss into its own 502 invalid_response.
    await expect(createGroupCheckoutPages(credentials, singleBand)).rejects.toThrow(/invalid_response/);
  });

  it("surfaces a provider error with its status instead of a partial success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ type: "payment", api_error_code: "resource_limit_exhausted" }), { status: 429 })));
    await expect(createGroupCheckoutPages(credentials, singleBand)).rejects.toThrow(/429/);
  });

  it("page-loss recovery: a retried call reuses the same key so the provider replays the page", async () => {
    const seen = stubProvider();
    await createGroupCheckoutPages(credentials, singleBand);
    await createGroupCheckoutPages(credentials, singleBand);
    expect(seen).toHaveLength(2);
    expect(seen[0].headers["chargebee-idempotency-key"]).toBe(seen[1].headers["chargebee-idempotency-key"]);
  });
});

describe("provider events", () => {
  const event = {
    id: "ev_fixture",
    event_type: "invoice.paid",
    occurred_at: 1_764_000_000,
    resource_version: 7,
    content: { invoice: { id: "inv_1", status: "paid", total: 22900, currency_code: "INR" } },
  };

  it("reads a supported event and keeps the provider's ordering value", () => {
    expect(readGroupProviderEvent(event)).toEqual({ eventId: "ev_fixture", eventType: "invoice.paid", supported: true, resourceVersion: 7 });
  });

  it("reports an unknown type as unsupported instead of guessing", () => {
    expect(readGroupProviderEvent({ ...event, event_type: "customer.moved" }).supported).toBe(false);
  });

  it("rejects a body without an id or content", () => {
    expect(() => readGroupProviderEvent({ event_type: "invoice.paid", occurred_at: 1 })).toThrow();
  });

  it("treats a lower resource_version as stale and an unorderable one as stale once a version is stored", () => {
    const incoming = readGroupProviderEvent(event);
    expect(isStaleGroupProviderEvent(incoming, 7)).toBe(false);
    expect(isStaleGroupProviderEvent(incoming, 8)).toBe(true);
    expect(isStaleGroupProviderEvent({ ...incoming, resourceVersion: null }, 8)).toBe(true);
    expect(isStaleGroupProviderEvent({ ...incoming, resourceVersion: null }, null)).toBe(false);
  });
});
