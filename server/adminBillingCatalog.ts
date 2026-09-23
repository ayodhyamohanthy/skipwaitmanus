import type { Express, Request } from "express";
import { z } from "zod";
import { CHARGEBEE_TOKEN_PACKS } from "./chargebee";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";
import { SUBSCRIPTION_PLANS, type PaidSubscriptionPlan, type SubscriptionCurrency } from "../shared/subscriptionPlans";

/**
 * Admin billing-catalog diagnostic: GET /api/admin/billing/catalog.
 *
 * Read-only. Retrieves every item price the checkout flows depend on and
 * reports whether each one accepts the parameters we send. Exists because a
 * catalog misconfiguration (e.g. a token pack created as flat_fee/on_off
 * instead of per_unit) sails through checkout creation and only explodes on
 * the hosted page with "This param should not be sent for on_off addon type"
 * after a ~25s wait. This endpoint turns that into a 2-second answer.
 *
 * Rules encoded here mirror the two checkout forms in server/chargebee.ts:
 * - token packs send item_prices[quantity] up to 1000, so the price MUST be
 *   per_unit (Chargebee default is flat_fee — the classic misconfiguration).
 * - subscriptions always send quantity 1; their model is reported but not
 *   gated, since flat recurring plans are the normal shape there.
 */

const itemPriceSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  item_type: z.string().optional(),
  pricing_model: z.string().optional(),
  price: z.number().optional(),
  currency_code: z.string().optional(),
});

export type CatalogCheckItem = {
  id: string;
  kind: "token-pack" | "subscription";
  found: boolean;
  status?: string;
  itemType?: string;
  pricingModel?: string;
  currency?: string;
  price?: number;
  okForCheckout: boolean;
  problems: string[];
};

export type AdminBillingCatalogDeps = {
  resolveIdentity: (req: Request) => Promise<{ account: { id: number; role?: string } } | undefined>;
  fetchImpl?: typeof fetch;
  runtime?: { site: string; apiKey: string; environment: "test" | "live" };
};

type ExpectedPrice = { id: string; kind: CatalogCheckItem["kind"]; currency: string; amount: number };

function expectedPrices(): ExpectedPrice[] {
  const out: ExpectedPrice[] = [];
  for (const [id, pack] of Object.entries(CHARGEBEE_TOKEN_PACKS)) {
    out.push({ id, kind: "token-pack", currency: pack.currency, amount: pack.amount });
  }
  for (const plan of Object.keys(SUBSCRIPTION_PLANS) as PaidSubscriptionPlan[]) {
    for (const currency of Object.keys(SUBSCRIPTION_PLANS[plan].prices) as SubscriptionCurrency[]) {
      const price = SUBSCRIPTION_PLANS[plan].prices[currency];
      out.push({ id: price.itemPriceId, kind: "subscription", currency, amount: price.amount });
    }
  }
  return out;
}

async function checkPrice(fetchImpl: typeof fetch, authorization: string, site: string, expected: ExpectedPrice): Promise<CatalogCheckItem> {
  const base = { id: expected.id, kind: expected.kind, found: false, okForCheckout: false, problems: [] as string[] };
  let response: Response;
  try {
    response = await fetchImpl(`https://${site}.chargebee.com/api/v2/item_prices/${encodeURIComponent(expected.id)}`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return { ...base, problems: ["provider request failed (network/timeout)"] };
  }
  if (!response.ok) return { ...base, problems: [`not retrievable (HTTP ${response.status})`] };
  const parsed = itemPriceSchema.safeParse(((await response.json().catch(() => ({}))) as { item_price?: unknown })?.item_price);
  if (!parsed.success) return { ...base, problems: ["unparseable provider response"] };
  const live = parsed.data;
  const problems: string[] = [];
  if (live.status !== "active") problems.push(`status is ${live.status ?? "unknown"} (must be active)`);
  if ((live.currency_code ?? "").toUpperCase() !== expected.currency) problems.push(`currency is ${live.currency_code ?? "unknown"} (expected ${expected.currency})`);
  if (live.price !== expected.amount) problems.push(`price is ${live.price ?? "unknown"} (expected ${expected.amount} minor units)`);
  if (expected.kind === "token-pack" && live.pricing_model !== "per_unit") {
    problems.push(`pricing_model is ${live.pricing_model ?? "unknown"} (must be per_unit: quantity checkout is rejected for on_off/flat_fee types)`);
  }
  return {
    ...base,
    found: true,
    status: live.status,
    itemType: live.item_type,
    pricingModel: live.pricing_model,
    currency: live.currency_code,
    price: live.price,
    okForCheckout: problems.length === 0,
    problems,
  };
}

export function registerAdminBillingCatalogRoutes(app: Express, deps: AdminBillingCatalogDeps): void {
  app.get("/api/admin/billing/catalog", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity || identity.account.role !== "admin") return res.status(403).json({ error: "Administrator access is required" });
      let runtime = deps.runtime;
      if (!runtime) {
        try {
          runtime = resolveChargebeeRuntime(req.hostname);
        } catch {
          return res.status(503).json({ error: "Chargebee is not configured" });
        }
      }
      const authorization = `Basic ${Buffer.from(`${runtime.apiKey}:`).toString("base64")}`;
      const fetchImpl = deps.fetchImpl ?? fetch;
      const items = [];
      for (const expected of expectedPrices()) {
        items.push(await checkPrice(fetchImpl, authorization, runtime.site, expected));
      }
      res.json({ site: runtime.site, environment: runtime.environment, checkedAt: new Date().toISOString(), items, allOk: items.every(item => item.okForCheckout) });
    } catch {
      res.status(502).json({ error: "Catalog check failed" });
    }
  });
}
