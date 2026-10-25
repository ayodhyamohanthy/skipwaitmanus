// Admin-only Chargebee catalog sync (D-069): GET a read-only dry run, POST one
// apply of the reviewed plan. Signed-out and non-admin callers get nothing and
// no provider call is made; the apply body must be JSON and confirm the site.
import type { Express, Request, Response } from "express";
import { isReviewerOpenId } from "./_core/reviewerLogin";
import { catalogSyncApplyRequestSchema } from "../shared/catalogSync";
import { clearPriceAvailabilityCache } from "./billingAvailability";
import { currentChargebeeSite, isChargebeeNotConfiguredError, type ChargebeeSite } from "./chargebeeApi";
import { applyCatalogSync, buildCatalogSyncDryRun, type CatalogSyncActivity } from "./catalogSyncApply";
import { createChargebeeCatalogApi, type CatalogApi } from "./chargebeeCatalogApi";

export type AdminCatalogSyncDeps = {
  resolveIdentity(req: Request): Promise<{ account: { id: number; role?: string } } | undefined>;
  recordActivity(entry: CatalogSyncActivity): Promise<void>;
  site?: () => ChargebeeSite;
  api?: (site: ChargebeeSite) => CatalogApi;
  reportError(error: unknown, context?: Record<string, unknown>): void;
};

const DRY_RUN_PATH = "/api/admin/billing/catalog-sync";
const APPLY_PATH = "/api/admin/billing/catalog-sync/apply";
const NOT_CONFIGURED = { error: "Chargebee is not configured", code: "not_configured" } as const;
const UNREADABLE = { error: "Chargebee could not be read. Nothing was changed.", code: "provider_unreadable" } as const;

export function registerAdminCatalogSyncRoutes(app: Express, deps: AdminCatalogSyncDeps): void {
  /** One apply at a time in this process; the run is short and audited. */
  let applying = false;

  const adminIdentity = async (req: Request) => {
    const identity = await deps.resolveIdentity(req);
    if (identity && isReviewerOpenId((identity.account as { openId?: string }).openId)) return undefined;
    return identity && identity.account.role === "admin" ? identity : undefined;
  };

  const resolveSite = (): ChargebeeSite => (deps.site ? deps.site() : currentChargebeeSite());
  const apiFor = (site: ChargebeeSite): CatalogApi => (deps.api ? deps.api(site) : createChargebeeCatalogApi({ site: site.site, apiKey: site.apiKey }));

  /** The configured site, or a response body the caller sends back unchanged. */
  const configuredSite = (res: Response): ChargebeeSite | undefined => {
    try {
      return resolveSite();
    } catch (error) {
      if (isChargebeeNotConfiguredError(error)) {
        res.status(503).json(NOT_CONFIGURED);
        return undefined;
      }
      deps.reportError(error, { step: "catalog_sync_site" });
      res.status(502).json(UNREADABLE);
      return undefined;
    }
  };

  app.get(DRY_RUN_PATH, async (req, res) => {
    const identity = await adminIdentity(req);
    if (!identity) return res.status(403).json({ error: "Administrator access is required" });
    const site = configuredSite(res);
    if (!site) return;
    try {
      const dryRun = await buildCatalogSyncDryRun({ api: apiFor(site), site });
      res.set("Cache-Control", "no-store").json(dryRun);
    } catch (error) {
      deps.reportError(error, { step: "catalog_sync_dry_run" });
      res.status(502).json(UNREADABLE);
    }
  });

  app.post(APPLY_PATH, async (req, res) => {
    const identity = await adminIdentity(req);
    if (!identity) return res.status(403).json({ error: "Administrator access is required" });
    const site = configuredSite(res);
    if (!site) return;
    if (!req.is("application/json")) return res.status(415).json({ error: "Send the apply request as JSON.", code: "invalid_request" });
    const parsed = catalogSyncApplyRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "The apply request is not valid.", code: "invalid_request" });
    if (applying) return res.status(409).json({ error: "Another catalog sync is running. Wait for it to finish.", code: "apply_in_progress" });

    applying = true;
    try {
      const result = await applyCatalogSync(parsed.data, {
        api: apiFor(site),
        site,
        actorUserId: identity.account.id,
        record: deps.recordActivity,
        reportError: deps.reportError,
      });
      if (result.status === "refused") {
        if (result.code === "site_mismatch") return res.status(400).json({ error: result.message, code: result.code });
        if (result.code === "stale_plan") return res.status(409).json({ error: result.message, code: result.code, currentHash: result.currentHash });
        return res.status(503).json({ error: result.message, code: result.code });
      }
      // The public catalog caches availability for minutes; a fresh apply invalidates it.
      clearPriceAvailabilityCache();
      res.set("Cache-Control", "no-store").json(result.report);
    } finally {
      applying = false;
    }
  });
}
