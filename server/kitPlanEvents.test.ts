import { describe, expect, it } from "vitest";
import { parseSubscriptionEvent } from "./chargebee";
import { catalogItemPriceId } from "../shared/planCatalog";

/**
 * A kit pass must arrive from Chargebee already identified as the plan and the
 * exact term it was sold as: the webhook is the only place a paid pass becomes
 * an entitlement, and db.applyChargebeeSubscriptionEvent refuses a delivery
 * that does not match the checkout intent's item price.
 */
function subscriptionEvent(itemPriceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "event_kit",
    event_type: "subscription_created",
    content: {
      subscription: {
        id: "subscription_kit",
        status: "active",
        currency_code: "INR",
        current_term_start: 1_757_000_000,
        current_term_end: 1_760_000_000,
        resource_version: 3,
        subscription_items: [{ item_price_id: itemPriceId }],
        ...overrides,
      },
      hosted_page: { id: "page_kit", pass_thru_content: "intent_kit" },
    },
  };
}

describe("parseSubscriptionEvent over the kit price book", () => {
  it.each([
    ["start", "30d", { INR: 299, USD: 8 }],
    ["momentum", "90d", { INR: 2_499, USD: 59 }],
    ["keep_warm", "yearly", { INR: 999, USD: 29 }],
    ["land_concierge", "30d", { INR: 34_999, USD: 750 }],
  ] as const)("reads a %s %s pass from its item price", (plan, interval, prices) => {
    const parsed = parseSubscriptionEvent(subscriptionEvent(catalogItemPriceId(plan, interval, "INR")));
    expect(parsed).toMatchObject({ plan, interval, itemPriceId: catalogItemPriceId(plan, interval, "INR"), currency: "INR", status: "active", hostedPageId: "page_kit", passThruContent: "intent_kit" });
    // The USD term is the same plan and interval, and resolves too.
    expect(parseSubscriptionEvent(subscriptionEvent(catalogItemPriceId(plan, interval, "USD"), { currency_code: "USD" }))).toMatchObject({ plan, interval, currency: "USD" });
    expect(prices.INR).toBeGreaterThan(0);
  });

  // D-067 (owner, Oct 18 2026) removed the Pro/Max monthly prices from the book,
  // so a historic event still parses but resolves no plan and no interval.
  it("no longer resolves the retired Pro and Max monthly prices", () => {
    expect(parseSubscriptionEvent(subscriptionEvent("skipwait_pro_monthly-INR"))).toMatchObject({ plan: undefined, interval: undefined, itemPriceId: "skipwait_pro_monthly-INR", currency: "INR" });
    expect(parseSubscriptionEvent(subscriptionEvent("skipwait_max_monthly-USD", { currency_code: "USD" }))).toMatchObject({ plan: undefined, interval: undefined, itemPriceId: "skipwait_max_monthly-USD", currency: "USD" });
  });

  it("ignores an item price outside the price book, which the wallet then refuses", () => {
    const parsed = parseSubscriptionEvent(subscriptionEvent("skipwait_unknown-INR"));
    expect(parsed).toMatchObject({ plan: undefined, interval: undefined, itemPriceId: "skipwait_unknown-INR" });
    expect(parseSubscriptionEvent(subscriptionEvent("skipwait_start_30d-INR", { subscription_items: [] }))).toMatchObject({ plan: undefined, itemPriceId: undefined });
  });
});
