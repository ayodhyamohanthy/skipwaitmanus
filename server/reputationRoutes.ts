import type { Express, Request } from "express";
import type { JobSeekerReliability, ReferrerReputation } from "../shared/reputation";
import { getJobSeekerReliability, getReferrerReputation } from "./reputation";

type Identity = { account: { id: number; openId: string; role?: "user" | "admin" } };

export type ReputationRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  getReferrerReputation?: (userId: number) => Promise<ReferrerReputation>;
  getJobSeekerReliability?: (userId: number) => Promise<JobSeekerReliability>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string }) => Promise<void>;
};

/**
 * Self-view reputation surfaces. Track records are private to their owner in
 * this phase: no cross-side exposure, no ranking, no public endpoint.
 */
export function registerReputationRoutes(app: Express, deps: ReputationRouteDeps) {
  const record = (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string }) => {
    void deps.recordActivity?.(input).catch(() => undefined);
  };

  app.get("/api/reputation/referrer/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in with your company email to view your referral track record" });
      const reputation = await (deps.getReferrerReputation ?? getReferrerReputation)(identity.account.id);
      record({ actorUserId: identity.account.id, action: "reputation.referrer_viewed", outcome: "success", resourceType: "reputation" });
      res.set("Cache-Control", "private, no-store");
      res.json({ reputation });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not load your referral track record";
      res.status(/verify your company email/i.test(message) ? 403 : 500).json({ error: message });
    }
  });

  app.get("/api/reputation/seeker/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your referral track record" });
      const reliability = await (deps.getJobSeekerReliability ?? getJobSeekerReliability)(identity.account.id);
      record({ actorUserId: identity.account.id, action: "reputation.seeker_viewed", outcome: "success", resourceType: "reputation" });
      res.set("Cache-Control", "private, no-store");
      res.json({ reliability });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "We could not load your referral track record" });
    }
  });
}
