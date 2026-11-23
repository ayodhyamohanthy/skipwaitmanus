import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { bandedReferralCatalogPrice } from "../shared/bandedCatalog";
import { REFERRAL_LEVELS, type ReferralLevel } from "../shared/planFamily";
import type { BandedCheckoutDeps } from "./bandedCheckout";
import { createSkippieCardStore, type SkippieCardStore } from "./skippieMoneyCards";
import { registerSkippieSeekerRoutes } from "./skippieSeekerRoutes";
import type { SkippieSeekerDeps } from "./skippieSeeker";

const NOW = 1_760_000_000_000;
const KEY = "11111111-1111-4111-8111-111111111111";

function itemPrice(level: ReferralLevel, currency: "INR" | "USD") {
  const price = bandedReferralCatalogPrice(level, currency);
  if (price.kind !== "banded_referral") throw new Error("expected a banded referral price");
  return { id: price.itemPriceId, status: "active", currency_code: price.currency, price: price.amount, item_type: "charge" };
}

type PageInput = { lines: Array<{ itemPriceId: string; quantity: number }>; currency: string; checkoutIntentId: string; idempotencyKey: string };

function bandedDeps(pages: PageInput[], over: Partial<BandedCheckoutDeps> = {}): BandedCheckoutDeps {
  return {
    salesEnabled: () => true,
    credentials: () => ({ environment: "test", site: "acme-test", apiKey: "k" }),
    lookupItemPrice: async (_credentials, id) => {
      for (const level of REFERRAL_LEVELS) {
        for (const currency of ["INR", "USD"] as const) {
          const price = itemPrice(level, currency);
          if (price.id === id) return price;
        }
      }
      return null;
    },
    membership: async () => ({ bandedPlan: "mid_to_senior", activeSubscription: false }),
    reserveFoundingPlace: async () => ({ status: "reserved" }),
    releaseFoundingPlace: async () => ({ released: true }),
    foundingPlacesLeft: async () => ({ early_to_mid: 10, mid_to_senior: 10, senior_to_executive: 10 }),
    createReferralPage: async (_credentials, input) => {
      pages.push(input as unknown as PageInput);
      return { checkoutUrl: "https://acme-test.chargebee.com/hosted/1", hostedPageId: "hp-1" };
    },
    now: () => new Date(NOW),
    ...over,
  };
}

function makeDeps(over: Partial<SkippieSeekerDeps> = {}): SkippieSeekerDeps {
  return {
    previewJob: vi.fn(),
    fetchJobText: vi.fn(),
    extractResumeText: vi.fn(),
    analyzeFit: vi.fn(),
    getQuote: vi.fn(async () => ({ level: 5, cost: 1, totalAvailable: 0, shortfall: 1 })),
    getOwnedResume: vi.fn(),
    createAsk: vi.fn(),
    saveTailoredResume: vi.fn(),
    getBandedOffer: vi.fn(async () => ({ onSale: true })),
    createMoneyCard: vi.fn(() => { throw new Error("the route owns the card store"); }),
    ...over,
  };
}

function setup(opts: { userId?: number; purchase?: boolean; checkout?: BandedCheckoutDeps | null; cards?: SkippieCardStore; deps?: SkippieSeekerDeps } = {}) {
  const app = express();
  app.use(express.json());
  const pages: PageInput[] = [];
  const cards = opts.cards ?? createSkippieCardStore({ now: () => NOW, newId: () => "card-1", newKey: () => KEY });
  const recorded: Array<Record<string, unknown>> = [];
  registerSkippieSeekerRoutes(app, {
    resolveIdentity: async () => ({ account: { id: opts.userId ?? 7, role: "user", email: "seeker@example.com", name: "Asha Rao" } }),
    recordActivity: input => { recorded.push(input as never); },
    enabled: () => true,
    allowedUserIds: () => new Set([7, 8]),
    deps: () => opts.deps ?? makeDeps(),
    listOwnedResumes: async () => [],
    moneyCards: cards,
    bandedCheckout: () => (opts.checkout === null ? undefined : opts.checkout ?? bandedDeps(pages)),
    purchaseEnabled: () => opts.purchase !== false,
    now: () => NOW,
  });
  return { app, cards, pages, recorded };
}

const approve = (app: express.Express, id: string, body: unknown = {}) => request(app).post(`/api/skippie/cards/${id}/approve`).send(body as object);

describe("Skippy money card route: approve", () => {
  it("opens the hosted page from the card's own cart, ignoring a tampered body", async () => {
    const { app, cards, pages } = setup();
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const response = await approve(app, "card-1", { level: 1, quantity: 99, currency: "USD", total: 1, billingCountry: "INTL" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ checkoutUrl: "https://acme-test.chargebee.com/hosted/1", hostedPageId: "hp-1" });
    expect(pages).toHaveLength(1);
    expect(pages[0].lines).toEqual([{ itemPriceId: itemPrice("senior", "INR").id, quantity: 1 }]);
    expect(pages[0].currency).toBe("INR");
  });

  it("is one-use: a second approve is refused and only one page opens", async () => {
    const { app, cards, pages } = setup();
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    expect((await approve(app, "card-1")).status).toBe(200);
    const second = await approve(app, "card-1");
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("card_used");
    expect(pages).toHaveLength(1);
  });

  it("refuses an expired card without opening a page", async () => {
    const cards = createSkippieCardStore({ now: () => NOW, newId: () => "card-1", newKey: () => KEY });
    const { app, pages } = setup({ cards });
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const later = express();
    later.use(express.json());
    registerSkippieSeekerRoutes(later, {
      resolveIdentity: async () => ({ account: { id: 7, role: "user" } }),
      recordActivity: () => undefined,
      enabled: () => true,
      allowedUserIds: () => new Set([7]),
      deps: () => makeDeps(),
      listOwnedResumes: async () => [],
      moneyCards: cards,
      bandedCheckout: () => bandedDeps(pages),
      purchaseEnabled: () => true,
      now: () => NOW + 11 * 60_000,
    });
    const response = await approve(later, "card-1");
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("card_expired");
    expect(pages).toHaveLength(0);
    expect(app).toBeDefined();
  });

  it("answers 404 for another account's card", async () => {
    const { app, cards, pages } = setup({ userId: 8 });
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const response = await approve(app, "card-1");
    expect(response.status).toBe(404);
    expect(response.body.code).toBe("card_not_found");
    expect(pages).toHaveLength(0);
  });

  it("refuses a price change between the card and the approve, with no page", async () => {
    const { app, cards, pages } = setup();
    const card = cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    card.total -= 1;
    const response = await approve(app, "card-1");
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "The price changed. Nothing was charged.", code: "price_changed" });
    expect(pages).toHaveLength(0);
  });

  it("explains an outside_band refusal and never retries at another level", async () => {
    const pages: PageInput[] = [];
    const { app, cards } = setup({ checkout: bandedDeps(pages, { membership: async () => ({ bandedPlan: "early_to_mid", activeSubscription: false }) }) });
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const response = await approve(app, "card-1");
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("outside_band");
    expect(response.body.error).toMatch(/Nothing has been charged/);
    expect(pages).toHaveLength(0);
  });

  it("refuses a referrer-role call before any provider call (D-055)", async () => {
    const { app, cards, pages } = setup();
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const response = await approve(app, "card-1", { role: "referrer" });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("referrers_never_pay");
    expect(pages).toHaveLength(0);
  });

  it("answers 404 while SKIPPIE_PURCHASE_ENABLED is off", async () => {
    const { app, cards, pages } = setup({ purchase: false });
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    expect((await approve(app, "card-1")).status).toBe(404);
    expect(pages).toHaveLength(0);
  });

  it("answers 503 when the banded checkout is not wired", async () => {
    const { app, cards } = setup({ checkout: null });
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    const response = await approve(app, "card-1");
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("not_on_sale");
  });

  it("keys the provider page to the card, so a redelivery maps to one intent", async () => {
    const { app, cards, pages } = setup();
    cards.create({ userId: 7, level: 5, quantity: 1, billingCountry: "IN" });
    await approve(app, "card-1");
    expect(pages[0].checkoutIntentId).toMatch(/^br_[0-9a-f]{48}$/);
    expect(pages[0].idempotencyKey).toBe(pages[0].checkoutIntentId);
  });
});
