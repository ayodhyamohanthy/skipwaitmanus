import { afterEach, describe, expect, it, vi } from "vitest";
import { planPrice, type CatalogPrice } from "../shared/billingCatalog";
import { availablePriceIds, clearPriceAvailabilityCache, isPriceAvailable, itemPriceAvailability, priceAvailability } from "./billingAvailability";
import type { ProviderItemPrice } from "./chargebeeSubscriptionApi";

// The live site sells a start pass in USD; the test pretends the owner has just
// created exactly that one Chargebee item price.
const start = planPrice("start", "30d", "USD") as CatalogPrice;
const liveStart: ProviderItemPrice = { id: start.itemPriceId, status: "active", currency_code: start.currency, price: start.amount, period_unit: "day", period: 30, item_type: "plan" } as ProviderItemPrice;

const credentials = { environment: "test" as const, site: "fixture-test", apiKey: "fixture-key" };

afterEach(() => {
  clearPriceAvailabilityCache();
  vi.restoreAllMocks();
});

describe("billing availability", () => {
  it("says available only for the item price that matches the catalog exactly", async () => {
    const lookup = async (_credentials: unknown, itemPriceId: string) => (itemPriceId === start.itemPriceId ? liveStart : null);
    await expect(itemPriceAvailability(start, { credentials, lookup })).resolves.toBe("available");
    const wrongAmount: ProviderItemPrice = { ...liveStart, price: 100 } as ProviderItemPrice;
    clearPriceAvailabilityCache();
    await expect(itemPriceAvailability(start, { credentials, lookup: async () => wrongAmount })).resolves.toBe("missing");
  });

  it("separates a missing item price from a provider that does not answer", async () => {
    clearPriceAvailabilityCache();
    await expect(itemPriceAvailability(start, { credentials, lookup: async () => null })).resolves.toBe("missing");
    clearPriceAvailabilityCache();
    await expect(itemPriceAvailability(start, { credentials, lookup: async () => { throw new Error("Chargebee 500"); } })).resolves.toBe("unknown");
    clearPriceAvailabilityCache();
    await expect(isPriceAvailable(start, { credentials, lookup: async () => { throw new Error("Chargebee 500"); } })).resolves.toBe(false);
  });

  it("bounds a lookup that never settles, and does not let it block later callers", async () => {
    const hung = vi.fn(() => new Promise<ProviderItemPrice | null>(() => {}));
    let clock = 1_000;
    const deps = { credentials, lookup: hung, probeTimeoutMs: 25, now: () => clock };

    await expect(itemPriceAvailability(start, deps)).resolves.toBe("unknown");
    expect(hung).toHaveBeenCalledTimes(1);

    // While the "unknown" answer is cached the probe is not repeated...
    await expect(itemPriceAvailability(start, deps)).resolves.toBe("unknown");
    expect(hung).toHaveBeenCalledTimes(1);

    // ...and once it expires a working lookup answers normally instead of joining
    // the promise that never settled.
    clock += 31_000;
    await expect(itemPriceAvailability(start, { ...deps, lookup: async () => liveStart })).resolves.toBe("available");
  });

  it("reports unknown ids and saleable ids together for a whole catalog", async () => {
    const prices = [start, planPrice("momentum", "30d", "USD") as CatalogPrice];
    const report = await priceAvailability(prices, {
      credentials,
      lookup: async (_credentials, itemPriceId) => {
        if (itemPriceId === start.itemPriceId) return liveStart;
        throw new Error("provider unreachable");
      },
    });
    expect([...report.available]).toEqual([start.itemPriceId]);
    expect([...report.unknown]).toEqual([prices[1].itemPriceId]);
    expect(await availablePriceIds(prices, { credentials, lookup: async () => liveStart })).toEqual(new Set([start.itemPriceId]));
  });
});
