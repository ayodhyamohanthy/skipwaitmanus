import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { registerPlansCatalogRoutes } from "./plansCatalogRoutes";
import { EDGE_COUNTRY_HEADER } from "../shared/billingRegion";
import { clearPriceAvailabilityCache } from "./billingAvailability";
// These cases test selling passes, so they run with pass sales on; the shipped
// off state (D-084) is pinned in server/passSalesSwitch.test.ts.
vi.mock("../shared/planCatalog", async importOriginal => ({ ...(await importOriginal<typeof import("../shared/planCatalog")>()), PASS_SALES_HELD_PLAN_IDS: [], PASS_SALES_ENABLED: true }));

const LIVE = new Set(["skipwait_start_30d-USD", "skipwait_momentum_30d-INR", "skipwait_pack_2-INR"]);

function appFor(deps: Parameters<typeof registerPlansCatalogRoutes>[1] = {}) {
  const app = express();
  registerPlansCatalogRoutes(app, {
    availableFor: () => itemPriceId => LIVE.has(itemPriceId),
    maxAgeSeconds: 60,
    ...deps,
  });
  return app;
}

describe("GET /api/plans/catalog", () => {
  it("reads the region from the Worker-set CF-IPCountry header, never from anything else", async () => {
    const app = appFor();
    const india = await request(app).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(india.status).toBe(200);
    expect(india.body).toMatchObject({ region: "IN", currency: "INR", priceNote: "India price" });
    const globally = await request(app).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "US");
    expect(globally.body).toMatchObject({ region: "INTL", currency: "USD", priceNote: null });
    const unknown = await request(app).get("/api/plans/catalog");
    expect(unknown.body).toMatchObject({ region: "INTL", currency: "USD" });
    // A caller cannot smuggle a region: a repeated header is not a single country.
    const repeated = await request(app).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN, IN");
    expect(repeated.body).toMatchObject({ region: "INTL" });
  });

  it("says 'incl. GST' only while the seller is GST-registered (D-007 default off)", async () => {
    const registered = await request(appFor({ indiaGstRegistered: () => true }))
      .get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(registered.body.priceNote).toBe("India price, incl. GST");
  });

  it("carries availability and gates human sessions and USD auto-extend behind their flags", async () => {
    const held = await request(appFor()).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "US");
    expect(held.body.sessions.every((session: { available: boolean }) => !session.available)).toBe(true);
    expect(held.body.plans.find((plan: { id: string }) => plan.id === "start").terms[0].available).toBe(true);
    expect(held.body.plans.find((plan: { id: string }) => plan.id === "start").terms[0].autoExtend).toEqual([]);

    const open = await request(appFor({ usdRecurringConfirmed: () => true, humanReviewersStaffed: () => true }))
      .get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "US");
    expect(open.body.plans.find((plan: { id: string }) => plan.id === "start").terms[0].autoExtend).toEqual(["usd_recurring"]);
    expect(open.body.sessions.map((session: { id: string; available: boolean }) => [session.id, session.available]))
      .toEqual([["written_review", false], ["live_session", false]]);
    // A staffed reviewer sells a session only when its own item price is live too.
    const staffedLive = await request(appFor({
      availableFor: () => id => id === "skipwait_written_review-USD",
      humanReviewersStaffed: () => true,
    })).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "US");
    expect(staffedLive.body.sessions).toEqual([
      { id: "written_review", label: "Written expert review", detail: "Returned within 48 hours", amount: 4_900, available: true },
      { id: "live_session", label: "Live 45-minute session", detail: "Mock interview or search strategy", amount: 9_900, available: false },
    ]);
  });

  it("is public and cacheable, leaks no item price ids and never 500s when billing is unreachable", async () => {
    const app = appFor();
    const response = await request(app).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(response.headers["cache-control"]).toBe("public, max-age=60");
    expect(JSON.stringify(response.body)).not.toContain("skipwait_");

    const broken = await request(appFor({ availableFor: () => { throw new Error("Chargebee down"); } }))
      .get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(broken.status).toBe(503);
    expect(broken.body).toEqual({ error: "Prices are unavailable right now. Try again in a moment." });
  });

  it("answers 503 - not 'not on sale' - when the provider cannot be asked, and is bounded when it never answers", async () => {
    const configured = { credentials: () => ({ environment: "test" as const, site: "fixture-test", apiKey: "fixture-key" }) };
    const failed = await request(appFor({ availableFor: undefined, ...configured, lookup: async () => { throw new Error("Chargebee down"); } }))
      .get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ error: "Prices are unavailable right now. Try again in a moment." });
    expect(failed.headers["cache-control"]).toBe("no-store");

    // A lookup that never settles must still produce an answer inside the budget.
    const startedAt = Date.now();
    const hung = await request(appFor({ availableFor: undefined, ...configured, probeTimeoutMs: 40, lookup: () => new Promise(() => {}) }))
      .get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(hung.status).toBe(503);
    expect(Date.now() - startedAt).toBeLessThan(5_000);

    // One price the provider does answer for is enough to render the catalog: only
    // the ids left unknown read as not available yet. Availability is cached per site
    // in process memory, so drop the answers the two cases above cached first.
    clearPriceAvailabilityCache();
    const partial = await request(appFor({
      availableFor: undefined,
      ...configured,
      lookup: async (_credentials, itemPriceId) => {
        if (itemPriceId === "skipwait_start_30d-INR") return { id: itemPriceId, status: "active", currency_code: "INR", price: 29_900, period_unit: "month", period: 1, item_type: "plan" };
        throw new Error("Chargebee down");
      },
    })).get("/api/plans/catalog").set(EDGE_COUNTRY_HEADER, "IN");
    expect(partial.status).toBe(200);
    expect(partial.body.plans.find((plan: { id: string }) => plan.id === "start").terms[0].available).toBe(true);
    expect(partial.body.plans.find((plan: { id: string }) => plan.id === "momentum").terms[0].available).toBe(false);
  });
});
