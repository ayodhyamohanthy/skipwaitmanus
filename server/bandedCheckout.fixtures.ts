// Test fixtures for the BANDED-checkout suites; never imported by runtime code.
import { vi } from "vitest";
import { BANDED_CATALOG_CURRENCIES, bandedPlanCatalogPrice, bandedReferralCatalogPrice } from "../shared/bandedCatalog";
import { PLAN_FAMILY_IDS, REFERRAL_LEVELS } from "../shared/planFamily";
import type { ProviderItemPrice } from "./chargebeeSubscriptionApi";
import type { BandedCheckoutDeps } from "./bandedCheckout";

export const KEY = "6f1c2b7e-3d4a-4f5b-9c8d-1e2f3a4b5c6d";
export const NOW = new Date("2026-11-21T10:00:00.000Z");
export const runtime = { environment: "test" as const, site: "fixture-test", apiKey: "fixture-key" };

/** Every banded item price exactly as catalog sync provisions it on the site. */
export const LIVE_PRICES = new Map<string, ProviderItemPrice>();
for (const currency of BANDED_CATALOG_CURRENCIES) {
  for (const plan of PLAN_FAMILY_IDS) {
    const price = bandedPlanCatalogPrice(plan, currency);
    LIVE_PRICES.set(price.itemPriceId, { id: price.itemPriceId, status: "active", currency_code: currency, price: price.amount, item_type: "plan", period: 1, period_unit: "month" });
  }
  for (const level of REFERRAL_LEVELS) {
    const price = bandedReferralCatalogPrice(level, currency);
    LIVE_PRICES.set(price.itemPriceId, { id: price.itemPriceId, status: "active", currency_code: currency, price: price.amount, item_type: "charge" });
  }
}

export function fakeBandedDeps(over: Partial<BandedCheckoutDeps> = {}): BandedCheckoutDeps {
  return {
    salesEnabled: () => true,
    credentials: () => runtime,
    lookupItemPrice: vi.fn(async (_credentials: unknown, itemPriceId: string) => LIVE_PRICES.get(itemPriceId) ?? null),
    membership: vi.fn(async () => ({ bandedPlan: null, activeSubscription: false })),
    reserveFoundingPlace: vi.fn(async () => ({ status: "reserved" as const })),
    releaseFoundingPlace: vi.fn(async () => ({ released: true })),
    foundingPlacesLeft: vi.fn(async () => ({ early_to_mid: 500, mid_to_senior: 250, senior_to_executive: 100 })),
    createPlanPage: vi.fn(async () => ({ checkoutUrl: "https://fixture-test.chargebee.com/pages/v4/plan/checkout", hostedPageId: "hp_plan" })),
    createReferralPage: vi.fn(async () => ({ checkoutUrl: "https://fixture-test.chargebee.com/pages/v4/referral/checkout", hostedPageId: "hp_referral" })),
    now: () => NOW,
    ...over,
  };
}
