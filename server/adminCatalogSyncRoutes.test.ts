import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogSyncApplyResponseSchema, catalogSyncDryRunSchema } from "../shared/catalogSync";
import { packPrice } from "../shared/billingCatalog";
import { registerAdminCatalogSyncRoutes, type AdminCatalogSyncDeps } from "./adminCatalogSyncRoutes";
import { clearPriceAvailabilityCache, itemPriceAvailability } from "./billingAvailability";
import { ChargebeeApiError } from "./chargebeeApi";
import { createFakeCatalogApi, type FakeCatalogOptions } from "./catalogSyncFixtures";
import type { CatalogSiteState } from "./catalogSyncPlan";

const admin = { account: { id: 1, role: "admin" } };
const member = { account: { id: 2, role: "user" } };
const SITE = { site: "skipwait", apiKey: "live-key", environment: "live" as const };

function appWith(options: { seed?: CatalogSiteState; fake?: FakeCatalogOptions; deps?: Partial<AdminCatalogSyncDeps> } = {}) {
  const fake = createFakeCatalogApi(options.seed, options.fake);
  const recordActivity = vi.fn(async () => undefined);
  const reportError = vi.fn();
  const app = express();
  app.use(express.json());
  registerAdminCatalogSyncRoutes(app, { resolveIdentity: async () => admin, recordActivity, site: () => SITE, api: () => fake.api, reportError, ...options.deps });
  return { app, fake, recordActivity, reportError };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  clearPriceAvailabilityCache();
});

describe("admin catalog sync routes", () => {
  it("answers 403 to signed-out and non-admin callers on GET and POST without calling Chargebee", async () => {
    for (const identity of [undefined, member]) {
      const { app, fake } = appWith({ deps: { resolveIdentity: async () => identity } });
      const read = await request(app).get("/api/admin/billing/catalog-sync");
      expect(read.status).toBe(403);
      expect(read.body).toEqual({ error: "Administrator access is required" });
      const write = await request(app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: "a".repeat(64), confirmSite: "skipwait" });
      expect(write.status).toBe(403);
      expect(fake.calls).toEqual([]);
    }
  });

  it("answers 503 when Chargebee is not configured and 502 in plain words when it cannot be read; nothing is created", async () => {
    for (const key of ["CHARGEBEE_SITE", "CHARGEBEE_API_KEY", "CHARGEBEE_LIVE_SITE", "CHARGEBEE_LIVE_API_KEY"]) vi.stubEnv(key, "");
    vi.stubEnv("BILLING_ENV", "test");
    const notConfigured = appWith({ deps: { site: undefined } });
    const missing = await request(notConfigured.app).get("/api/admin/billing/catalog-sync");
    expect(missing.status).toBe(503);
    expect(missing.body).toEqual({ error: "Chargebee is not configured", code: "not_configured" });
    expect(notConfigured.fake.calls).toEqual([]);

    const unreadable = appWith({ fake: { failLists: new ChargebeeApiError(500, "internal_error", null, "boom") } });
    const read = await request(unreadable.app).get("/api/admin/billing/catalog-sync");
    expect(read.status).toBe(502);
    expect(read.body).toEqual({ error: "Chargebee could not be read. Nothing was changed.", code: "provider_unreadable" });
    expect(unreadable.fake.creates()).toEqual([]);
    expect(unreadable.reportError).toHaveBeenCalledTimes(1);
  });

  it("returns the schema-valid dry run with site, environment and planHash, never cached", async () => {
    const { app } = appWith();
    const response = await request(app).get("/api/admin/billing/catalog-sync");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const dryRun = catalogSyncDryRunSchema.parse(response.body);
    expect(dryRun).toMatchObject({ site: "skipwait", environment: "live", counts: { desired: 54, toCreate: 79, itemPricesToCreate: 54, correct: 0, excluded: 8 } });
    expect(dryRun.planHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("validates the JSON body and refuses a stale hash and a concurrent apply with 409, writing nothing", async () => {
    const { app, fake } = appWith();
    const plan = catalogSyncDryRunSchema.parse((await request(app).get("/api/admin/billing/catalog-sync")).body);
    for (const body of [{ planHash: plan.planHash }, { planHash: plan.planHash, confirmSite: "skipwait", extra: 1 }, { planHash: "nothex", confirmSite: "skipwait" }]) {
      const response = await request(app).post("/api/admin/billing/catalog-sync/apply").send(body);
      expect(response.status).toBe(400);
      expect(response.body.code).toBe("invalid_request");
    }
    const form = await request(app).post("/api/admin/billing/catalog-sync/apply").type("form").send(`planHash=${plan.planHash}&confirmSite=skipwait`);
    expect(form.status).toBe(415);
    const wrongSite = await request(app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: plan.planHash, confirmSite: "skipwait-test" });
    expect(wrongSite.status).toBe(400);
    expect(wrongSite.body.code).toBe("site_mismatch");
    const stale = await request(app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: "c".repeat(64), confirmSite: "skipwait" });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ error: expect.stringMatching(/changed/), code: "stale_plan", currentHash: plan.planHash });
    expect(fake.creates()).toEqual([]);

    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const slow = appWith({ fake: { beforeCreate: () => gate } });
    const slowPlan = catalogSyncDryRunSchema.parse((await request(slow.app).get("/api/admin/billing/catalog-sync")).body);
    const first = request(slow.app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: slowPlan.planHash, confirmSite: "skipwait" }).then(response => response);
    await vi.waitFor(() => expect(slow.fake.calls.some(call => call.method.startsWith("create"))).toBe(true));
    const second = await request(slow.app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: slowPlan.planHash, confirmSite: "skipwait" });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("apply_in_progress");
    release();
    expect((await first).status).toBe(200);
  });

  it("applies, returns the schema-valid report and clears the availability cache so the catalog re-probes", async () => {
    const pack = packPrice("pack_25", "INR");
    if (!pack) throw new Error("pack_25 INR missing from the catalog");
    const credentials = { site: SITE.site, apiKey: SITE.apiKey };
    let live = false;
    const lookup = vi.fn(async () => (live ? { id: pack.itemPriceId, status: "active", currency_code: "INR", price: pack.amount, item_type: "charge" } : null));
    await expect(itemPriceAvailability(pack, { credentials, lookup })).resolves.toBe("missing");

    const { app, recordActivity } = appWith();
    const plan = catalogSyncDryRunSchema.parse((await request(app).get("/api/admin/billing/catalog-sync")).body);
    const response = await request(app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: plan.planHash, confirmSite: "skipwait" });
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const report = catalogSyncApplyResponseSchema.parse(response.body);
    expect(report).toMatchObject({ outcome: "applied", stoppedReason: null });
    expect(report.created).toHaveLength(79);
    expect(recordActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.catalog_sync.apply_started", actorUserId: 1 }));

    live = true;
    await expect(itemPriceAvailability(pack, { credentials, lookup })).resolves.toBe("available");
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("never touches subscriptions, customers, invoices, hosted pages or payments across a dry run and an apply", async () => {
    const store = new Map<string, Record<string, string | number>>();
    const urls: Array<{ method: string; url: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      urls.push({ method, url });
      const path = new URL(url).pathname.replace("/api/v2/", "");
      if (method === "GET") return Response.json({ list: [] });
      const form = init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : {};
      const object: Record<string, string | number> = { ...form, status: "active" };
      if (path === "items") object.type = form.type ?? "";
      if (path === "item_prices") {
        const item = store.get(`items:${form.item_id}`);
        Object.assign(object, { item_type: item?.type ?? "", price: Number(form.price), ...(form.period ? { period: Number(form.period) } : {}), ...(form.billing_cycles ? { billing_cycles: Number(form.billing_cycles) } : {}) });
      }
      store.set(`${path}:${form.id}`, object);
      const key = path === "item_families" ? "item_family" : path === "items" ? "item" : "item_price";
      return Response.json({ [key]: object });
    }));
    const recordActivity = vi.fn(async () => undefined);
    const app = express();
    app.use(express.json());
    registerAdminCatalogSyncRoutes(app, { resolveIdentity: async () => admin, recordActivity, site: () => SITE, reportError: vi.fn() });
    const plan = catalogSyncDryRunSchema.parse((await request(app).get("/api/admin/billing/catalog-sync")).body);
    const response = await request(app).post("/api/admin/billing/catalog-sync/apply").send({ planHash: plan.planHash, confirmSite: "skipwait" });
    expect(catalogSyncApplyResponseSchema.parse(response.body).outcome).toBe("applied");
    expect(urls.length).toBeGreaterThan(79);
    for (const { method, url } of urls) {
      expect(url).toMatch(/^https:\/\/skipwait\.chargebee\.com\/api\/v2\/(item_families|items|item_prices)(\?|$)/);
      if (method === "POST") expect(url).toMatch(/\/api\/v2\/(item_families|items|item_prices)$/);
    }
  });
});
