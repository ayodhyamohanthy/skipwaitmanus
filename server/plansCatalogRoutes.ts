import type { Express, Request } from "express";
import { EDGE_COUNTRY_HEADER, regionFromHeader } from "../shared/billingRegion";
import { planCatalogResponse, sellableItemPrices } from "../shared/billingCatalog";
import { availablePriceIds, type AvailabilityDeps } from "./billingAvailability";
import { indiaGstRegistered, humanReviewersStaffed, usdRecurringConfirmed } from "./billingSettings";
import { resolveChargebeeRuntime } from "./chargebeeEnvironment";

/**
 * GET /api/plans/catalog — the public price book, in the caller's region.
 *
 * Public and unauthenticated: the Prices page renders real prices before
 * sign-in, and no personal data is involved. The region comes from the
 * Worker-set `CF-IPCountry` header (src/worker.ts rewrites it from the edge's
 * own request.cf.country, so a caller cannot pick a region by sending the
 * header); anything other than IN reads as the one global USD price.
 *
 * `available` answers whether the owner has already created that Chargebee item
 * price at the catalog amount. Checkout re-checks the same question before it
 * opens a hosted page, so a stale "true" here can never charge the wrong price.
 */

export type PlansCatalogDeps = {
  /** Chargebee credentials for the current request, or null when billing is not configured. */
  credentials?: (req: Request) => AvailabilityDeps["credentials"];
  /** Overridable for tests: which item price ids are live. */
  availableFor?: (req: Request) => Promise<(itemPriceId: string) => boolean> | ((itemPriceId: string) => boolean);
  indiaGstRegistered?: () => boolean;
  usdRecurringConfirmed?: () => boolean;
  humanReviewersStaffed?: () => boolean;
  /** Cache seconds for the public response; prices change only when the owner edits Chargebee. */
  maxAgeSeconds?: number;
};

const DEFAULT_MAX_AGE_SECONDS = 300;

async function resolveAvailable(req: Request, deps: PlansCatalogDeps): Promise<(itemPriceId: string) => boolean> {
  if (deps.availableFor) {
    const answer = await deps.availableFor(req);
    return typeof answer === "function" ? answer : () => false;
  }
  let credentials: AvailabilityDeps["credentials"] = null;
  try {
    credentials = deps.credentials ? deps.credentials(req) : resolveChargebeeRuntime(req.hostname);
  } catch {
    credentials = null;
  }
  const live = await availablePriceIds(sellableItemPrices(), { credentials });
  return itemPriceId => live.has(itemPriceId);
}

export function registerPlansCatalogRoutes(app: Express, deps: PlansCatalogDeps = {}): void {
  app.get("/api/plans/catalog", async (req, res) => {
    try {
      const region = regionFromHeader(req.headers[EDGE_COUNTRY_HEADER]);
      const available = await resolveAvailable(req, deps);
      const catalog = planCatalogResponse({
        region,
        available,
        usdRecurringConfirmed: (deps.usdRecurringConfirmed ?? usdRecurringConfirmed)(),
        sessionsStaffed: (deps.humanReviewersStaffed ?? humanReviewersStaffed)(),
        indiaGstRegistered: (deps.indiaGstRegistered ?? indiaGstRegistered)(),
      });
      // Public prices, no personal data: shareable and cheap to cache. Availability
      // itself is cached in-process for five minutes (server/billingAvailability.ts).
      res.set("Cache-Control", `public, max-age=${deps.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS}`);
      res.json(catalog);
    } catch {
      res.status(503).json({ error: "Prices are unavailable right now. Try again in a moment." });
    }
  });
}
