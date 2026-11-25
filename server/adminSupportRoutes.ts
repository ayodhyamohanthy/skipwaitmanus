// ADMIN-support-view (D-393): the admin support routes. Admin role only, `private, no-store`, and every view
// is itself logged as `admin.support_viewed` (the trouble-signal read as `admin.support_signals_viewed`).
// Read-only: no route here edits a person's data, signs in as them or opens a new money path.
import type { Express, Request, Response } from "express";
import { buildSupportSignals, buildSupportView, databaseReaders, type SupportReaders } from "./adminSupport";

type Outcome = "success" | "failure" | "denied";
type Identity = { account: { id: number; role?: string } } | null | undefined;

export type AdminSupportDeps = {
  resolveIdentity: (req: Request) => Promise<Identity>;
  /** Injected in tests; the database readers otherwise. */
  readers?: SupportReaders;
  record: (input: { actorUserId: number; action: string; outcome: Outcome; resourceType: string; resourceId?: string | number; metadata: Record<string, string | number | boolean | null> }) => void;
};

async function requireAdmin(deps: AdminSupportDeps, req: Request, res: Response) {
  res.set("Cache-Control", "private, no-store");
  const identity = await deps.resolveIdentity(req);
  if (!identity || identity.account.role !== "admin") { res.status(403).json({ error: "Administrator access is required" }); return undefined; }
  return identity;
}

export function registerAdminSupportRoutes(app: Express, deps: AdminSupportDeps): void {
  const readers = deps.readers ?? databaseReaders;

  app.get("/api/admin/users/:userId/support", async (req, res) => {
    try {
      const identity = await requireAdmin(deps, req, res);
      if (!identity) return;
      const userId = Number(req.params.userId);
      if (!Number.isInteger(userId) || userId <= 0) return res.status(400).json({ error: "Invalid user reference" });
      const view = await buildSupportView(readers, userId);
      if (!view) return res.status(404).json({ error: "That account could not be found" });
      deps.record({
        actorUserId: identity.account.id, action: "admin.support_viewed", outcome: "success", resourceType: "user", resourceId: userId,
        metadata: { requests: view.requests.length, ledgerRows: view.wallet?.ledger.length ?? 0, activityRows: view.activity.length, failures: view.newestFailures.length },
      });
      res.json(view);
    } catch {
      res.status(500).json({ error: "We could not load this person's support view" });
    }
  });

  app.get("/api/admin/support/signals", async (req, res) => {
    try {
      const identity = await requireAdmin(deps, req, res);
      if (!identity) return;
      const signals = await buildSupportSignals(readers);
      deps.record({ actorUserId: identity.account.id, action: "admin.support_signals_viewed", outcome: "success", resourceType: "support_signals", metadata: { windows: Object.keys(signals.windows).length } });
      res.json(signals);
    } catch {
      res.status(500).json({ error: "We could not load the trouble signals" });
    }
  });
}
