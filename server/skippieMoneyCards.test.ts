import { describe, expect, it, vi } from "vitest";
import { bandedReferralQuote } from "../shared/subscriptionManagement";
import {
  SKIPPIE_CARD_TTL_MS,
  approveSkippieMoneyCard,
  buildSkippieMoneyCard,
  createSkippieCardStore,
  type SkippieMoneyCard,
} from "./skippieMoneyCards";

const NOW = 1_760_000_000_000;
const KEY = "11111111-1111-4111-8111-111111111111";

function card(over: Partial<Parameters<typeof buildSkippieMoneyCard>[0]> = {}): SkippieMoneyCard {
  return buildSkippieMoneyCard({ userId: 7, level: 5, quantity: 1, billingCountry: "IN", id: "card-1", idempotencyKey: KEY, now: NOW, ...over });
}

function deps(over: Partial<Parameters<typeof approveSkippieMoneyCard>[0]["deps"]> = {}) {
  const startCheckout = vi.fn(async () => ({ ok: true as const, checkoutUrl: "https://acme.chargebee.com/hosted/1", hostedPageId: "hp-1" }));
  const markUsed = vi.fn(() => true);
  return {
    startCheckout,
    markUsed,
    deps: {
      offer: vi.fn(async () => ({ onSale: true })),
      startCheckout,
      markUsed,
      now: () => NOW,
      ...over,
    },
  };
}

describe("Skippy money cards: the card is the quote", () => {
  it("binds the card to the banded quote for the same cart in the India book", () => {
    const built = card();
    const quote = bandedReferralQuote([{ level: "senior", quantity: 1 }], "INR");
    expect(built.level).toBe(5);
    expect(built.quantity).toBe(1);
    expect(built.billingCountry).toBe("IN");
    expect(built.currency).toBe("INR");
    expect(built.total).toBe(quote.total);
    expect(built.subtotal).toBe(quote.subtotal);
    expect(built.discount).toBe(quote.discount);
    expect(built.discountPct).toBe(quote.discountPct);
    expect(built.expiresAt).toBe(NOW + SKIPPIE_CARD_TTL_MS);
  });

  it("uses the global book for a non-India billing route", () => {
    const built = card({ billingCountry: "INTL" });
    const quote = bandedReferralQuote([{ level: "senior", quantity: 1 }], "USD");
    expect(built.currency).toBe("USD");
    expect(built.total).toBe(quote.total);
  });

  it("carries the volume discount when the cart earns one", () => {
    const built = card({ quantity: 5 });
    const quote = bandedReferralQuote([{ level: "senior", quantity: 5 }], "INR");
    expect(built.discountPct).toBeGreaterThan(0);
    expect(built.discount).toBe(quote.discount);
    expect(built.total).toBe(quote.total);
  });
});

describe("Skippy money cards: approve", () => {
  it("starts one checkout with the card's own idempotency key and cart", async () => {
    const { deps: d, startCheckout, markUsed } = deps();
    const result = await approveSkippieMoneyCard({ card: card(), userId: 7, deps: d });
    expect(result).toEqual({ ok: true, checkoutUrl: "https://acme.chargebee.com/hosted/1", hostedPageId: "hp-1" });
    expect(markUsed).toHaveBeenCalledWith("card-1", NOW);
    expect(startCheckout).toHaveBeenCalledTimes(1);
    const input = startCheckout.mock.calls[0][0] as unknown as { userId: number; request: { items: Array<{ level: string; quantity: number }>; billingCountry: string; idempotencyKey: string } };
    expect(input.userId).toBe(7);
    expect(input.request).toEqual({ items: [{ level: "senior", quantity: 1 }], billingCountry: "IN", idempotencyKey: KEY });
  });

  it("is one-use: a second approve is refused and only one checkout starts", async () => {
    const store = createSkippieCardStore({ now: () => NOW, newId: () => "card-1", newKey: () => KEY });
    const built = store.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const { deps: d, startCheckout } = deps({ markUsed: (id, at) => store.markUsed(id, at) });
    expect((await approveSkippieMoneyCard({ card: store.get(built.id), userId: 7, deps: d })).ok).toBe(true);
    const second = await approveSkippieMoneyCard({ card: store.get(built.id), userId: 7, deps: d });
    expect(second).toMatchObject({ ok: false, status: 409, code: "card_used" });
    expect(startCheckout).toHaveBeenCalledTimes(1);
  });

  it("refuses an expired card without starting a checkout", async () => {
    const { deps: d, startCheckout } = deps({ now: () => NOW + SKIPPIE_CARD_TTL_MS + 1 });
    const result = await approveSkippieMoneyCard({ card: card(), userId: 7, deps: d });
    expect(result).toMatchObject({ ok: false, status: 409, code: "card_expired" });
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("answers 404 for another account's card", async () => {
    const { deps: d, startCheckout } = deps();
    const result = await approveSkippieMoneyCard({ card: card(), userId: 8, deps: d });
    expect(result).toMatchObject({ ok: false, status: 404, code: "card_not_found" });
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("refuses when the price changed between the card and the approve", async () => {
    const { deps: d, startCheckout } = deps();
    const stale = { ...card(), total: card().total - 1 };
    const result = await approveSkippieMoneyCard({ card: stale, userId: 7, deps: d });
    expect(result).toMatchObject({ ok: false, status: 409, code: "price_changed" });
    expect(result.ok === false && result.error).toBe("The price changed. Nothing was charged.");
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("refuses while extra referrals are off sale, before any provider call", async () => {
    const { deps: d, startCheckout } = deps({ offer: vi.fn(async () => ({ onSale: false })) });
    const result = await approveSkippieMoneyCard({ card: card(), userId: 7, deps: d });
    expect(result).toMatchObject({ ok: false, status: 409, code: "not_on_sale" });
    expect(startCheckout).not.toHaveBeenCalled();
  });

  it("explains an outside_band refusal and never retries at another level", async () => {
    const startCheckout = vi.fn(async () => ({ ok: false as const, status: 409, code: "outside_band", error: "Your plan covers Mid and Senior referral requests only. Nothing has been charged." }));
    const { deps: d } = deps({ startCheckout });
    const result = await approveSkippieMoneyCard({ card: card(), userId: 7, deps: d });
    expect(result).toMatchObject({ ok: false, status: 409, code: "outside_band" });
    expect(startCheckout).toHaveBeenCalledTimes(1);
  });

  it("keeps the card used when the provider call throws, so a retry cannot charge twice", async () => {
    const store = createSkippieCardStore({ now: () => NOW, newId: () => "card-1", newKey: () => KEY });
    const built = store.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const startCheckout = vi.fn(async () => { throw new Error("provider down"); });
    const { deps: d } = deps({ startCheckout, markUsed: (id, at) => store.markUsed(id, at) });
    await expect(approveSkippieMoneyCard({ card: store.get(built.id), userId: 7, deps: d })).rejects.toThrow("provider down");
    expect(store.get(built.id)?.usedAt).toBe(NOW);
    const retry = await approveSkippieMoneyCard({ card: store.get(built.id), userId: 7, deps: d });
    expect(retry).toMatchObject({ ok: false, code: "card_used" });
    expect(startCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("Skippy money cards: the store", () => {
  it("keeps cards per account and expires them", () => {
    let t = NOW;
    const store = createSkippieCardStore({ now: () => t, newId: () => `card-${Math.random()}`, newKey: () => KEY });
    const mine = store.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    expect(store.get(mine.id)?.userId).toBe(7);
    t = NOW + SKIPPIE_CARD_TTL_MS + 1;
    expect(store.get(mine.id)).toBeUndefined();
  });
});
