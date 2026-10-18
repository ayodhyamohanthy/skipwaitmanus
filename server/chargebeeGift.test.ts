import { afterEach, describe, expect, it, vi } from "vitest";
import * as chargebee from "./chargebee";
import { parseGiftEvent } from "./chargebee";

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

// D-067: the Pro/Max hosted pages (monthly checkout and gift checkout) are
// deleted; gift events are still parsed so every delivery is recorded as a receipt.
describe("retired Pro/Max hosted pages", () => {
  it("exports no Pro/Max or gift checkout builder", () => {
    for (const name of ["buildGiftSubscriptionCheckoutForm", "createGiftSubscriptionCheckout", "buildSubscriptionCheckoutForm", "createChargebeeSubscriptionCheckout"]) {
      expect(chargebee).not.toHaveProperty(name);
    }
  });
});
