import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerAdminBillingCatalogRoutes } from "./adminBillingCatalog";
import { CHARGEBEE_TOKEN_PACKS } from "./chargebee";
import { SUBSCRIPTION_PLANS, type PaidSubscriptionPlan, type SubscriptionCurrency } from "../shared/subscriptionPlans";

const admin = { account: { id: 1, role: "admin" as const } };
const member = { account: { id: 2, role: "user" as const } };

function priceResponse(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    json: async () => ({
      item_price: {
        id: "skipwait_token_1-INR", status: "active", item_type: "charge",
        pricing_model: "per_unit", price: 9900, currency_code: "INR",
        ...overrides,
      },
    }),
  };
}

function appFor(deps?: Parameters<typeof registerAdminBillingCatalogRoutes>[1]) {
  const app = express();
  registerAdminBillingCatalogRoutes(app, {
    resolveIdentity: async () => admin,
    runtime: { site: "skipwait", apiKey: "test-key", environment: "live" },
    fetchImpl: (async () => priceResponse()) as unknown as typeof fetch,
    ...deps,
  });
  return app;
}

describe("admin billing catalog diagnostic", () => {
  it("rejects non-admins without touching the provider", async () => {
    const fetchImpl = vi.fn();
    const app = appFor({ resolveIdentity: async () => member, fetchImpl: fetchImpl as unknown as typeof fetch });
    await request(app).get("/api/admin/billing/catalog").expect(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when Chargebee is not configured", async () => {
    const app = express();
    registerAdminBillingCatalogRoutes(app, { resolveIdentity: async () => admin });
    const saved: Record<string, string | undefined> = {};
    for (const key of ["CHARGEBEE_API_KEY", "CHARGEBEE_SITE", "CHARGEBEE_WEBHOOK_SECRET", "CHARGEBEE_LIVE_API_KEY", "CHARGEBEE_LIVE_SITE", "CHARGEBEE_LIVE_WEBHOOK_SECRET", "BILLING_ENV"]) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    try {
      await request(app).get("/api/admin/billing/catalog").expect(503);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value !== undefined) process.env[key] = value;
      }
    }
  });

  it("reports allOk when every price matches the checkout contract", async () => {
    const seen: string[] = [];
    const byId = new Map<string, { currency: string; amount: number }>();
    for (const [id, pack] of Object.entries(CHARGEBEE_TOKEN_PACKS)) byId.set(id, { currency: pack.currency, amount: pack.amount });
    for (const plan of Object.keys(SUBSCRIPTION_PLANS) as PaidSubscriptionPlan[]) {
      for (const currency of Object.keys(SUBSCRIPTION_PLANS[plan].prices) as SubscriptionCurrency[]) {
        const price = SUBSCRIPTION_PLANS[plan].prices[currency];
        byId.set(price.itemPriceId, { currency, amount: price.amount });
      }
    }
    const fetchImpl = (async (url: unknown) => {
      const urlString = String(url);
      seen.push(urlString);
      const id = [...byId.keys()].find(key => urlString.includes(encodeURIComponent(key))) ?? "";
      const expected = byId.get(id) ?? { currency: "USD", amount: 0 };
      return priceResponse({ id, price: expected.amount, currency_code: expected.currency });
    }) as unknown as typeof fetch;
    const res = await request(appFor({ fetchImpl })).get("/api/admin/billing/catalog").expect(200);
    expect(res.body.allOk).toBe(true);
    expect(res.body.items).toHaveLength(6);
    expect(seen.every(url => url.includes("/api/v2/item_prices/"))).toBe(true);
  });

  it("flags an on_off token pack as the checkout breaker", async () => {
    const fetchImpl = (async () => priceResponse({ pricing_model: "flat_fee" })) as unknown as typeof fetch;
    const res = await request(appFor({ fetchImpl })).get("/api/admin/billing/catalog").expect(200);
    expect(res.body.allOk).toBe(false);
    const flagged = res.body.items.filter((item: { okForCheckout: boolean }) => !item.okForCheckout);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged[0].problems.join(" ")).toMatch(/per_unit/);
  });

  it("flags missing and mispriced entries without failing the whole check", async () => {
    const fetchImpl = (async (url: unknown) => {
      if (String(url).includes("skipwait_token_1-USD")) return { ok: false, status: 404 };
      return priceResponse({ price: 1 });
    }) as unknown as typeof fetch;
    const res = await request(appFor({ fetchImpl })).get("/api/admin/billing/catalog").expect(200);
    expect(res.body.allOk).toBe(false);
    expect(res.body.items.some((item: { found: boolean }) => !item.found)).toBe(true);
  });
});
