import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerPlansCatalogRoutes } from "./plansCatalogRoutes";
import { EDGE_COUNTRY_HEADER } from "../shared/billingRegion";

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
});
