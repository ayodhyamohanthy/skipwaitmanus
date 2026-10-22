// GET /api/referrer/impact-card: aggregate-only stats for the signed-in
// referrer's shareable impact card. Behind SHARE_IMPACT_CARD_ENABLED, off.
import type { Express, Request, Response } from "express";
import { impactCardEnabled, loadImpactCard, type ImpactCardPayload } from "./impactCard";

type ResolveIdentity = (req: Request) => Promise<{ account: { id: number } } | null | undefined>;

export function registerImpactCardRoutes(app: Express, deps: { resolveIdentity: ResolveIdentity; loadImpactCard?: (referrerId: number) => Promise<ImpactCardPayload> }) {
  const load = deps.loadImpactCard ?? loadImpactCard;
  app.get("/api/referrer/impact-card", async (req, res: Response) => {
    // This payload is one referrer's published data: never let a shared cache
    // store it for another user (F4; same header as every per-user endpoint).
    res.set("Cache-Control", "private, no-store");
    if (!impactCardEnabled()) return res.status(404).json({ error: "Not found" });
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your impact card" });
      const card = await load(identity.account.id);
      return res.json(card);
    } catch (error) {
      console.error("[ImpactCard] load failed", error);
      return res.status(503).json({ error: "Impact card unavailable" });
    }
  });
}
