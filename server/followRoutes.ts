import express, { type Express, type Request } from "express";
import { followState, followUser, listFollowers, listFollowing, unfollowUser, type FollowSummary } from "./db";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type EmailAddress = { emailAddress: string; verification?: { status?: string } | null };
type Identity = { account: Account; primaryEmail?: EmailAddress | null; emailAddresses?: EmailAddress[] };

export type FollowRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  userExists?: (userId: number) => Promise<boolean>;
  followUser?: typeof followUser;
  unfollowUser?: typeof unfollowUser;
  followState?: typeof followState;
  listFollowers?: typeof listFollowers;
  listFollowing?: typeof listFollowing;
};

const parseUserId = (raw: string) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

export function registerFollowRoutes(app: Express, deps: FollowRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const doFollow = deps.followUser ?? followUser;
  const doUnfollow = deps.unfollowUser ?? unfollowUser;
  const stateFor = deps.followState ?? followState;
  const followersOf = deps.listFollowers ?? listFollowers;
  const followingOf = deps.listFollowing ?? listFollowing;
  const exists = deps.userExists ?? (async () => true);

  app.post("/api/users/:userId/follow", async (req, res) => {
    const targetUserId = parseUserId(req.params.userId);
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to follow members" });
      if (!targetUserId) return res.status(400).json({ error: "Invalid member" });
      if (targetUserId === identity.account.id) return res.status(400).json({ error: "You cannot follow yourself" });
      if (!(await exists(targetUserId))) return res.status(404).json({ error: "This member is not available" });
      await doFollow(identity.account.id, targetUserId);
      const state = await stateFor(identity.account.id, targetUserId);
      record({ actorUserId: identity.account.id, action: "follow.created", outcome: "success", resourceType: "user_follow", resourceId: targetUserId, metadata: { isMutual: state.isMutual } });
      res.status(201).json({ following: true, ...state });
    } catch { res.status(500).json({ error: "We could not save this follow" }); }
  });

  app.delete("/api/users/:userId/follow", async (req, res) => {
    const targetUserId = parseUserId(req.params.userId);
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage follows" });
      if (!targetUserId) return res.status(400).json({ error: "Invalid member" });
      await doUnfollow(identity.account.id, targetUserId);
      const state = await stateFor(identity.account.id, targetUserId);
      record({ actorUserId: identity.account.id, action: "follow.removed", outcome: "success", resourceType: "user_follow", resourceId: targetUserId });
      res.json({ following: false, ...state });
    } catch { res.status(500).json({ error: "We could not update this follow" }); }
  });

  app.get("/api/users/:userId/follow-state", async (req, res) => {
    const targetUserId = parseUserId(req.params.userId);
    try {
      const identity = await deps.resolveIdentity(req).catch(() => undefined);
      if (!identity) return res.status(401).json({ error: "Sign in to view follow info" });
      if (!targetUserId || !(await exists(targetUserId))) return res.status(404).json({ error: "This member is not available" });
      const state = await stateFor(identity.account.id, targetUserId);
      res.set("Cache-Control", "private, no-store");
      res.json({ ...state, viewerSignedIn: true });
    } catch { res.status(500).json({ error: "We could not load follow info" }); }
  });

  app.get("/api/users/:userId/followers", async (req, res) => {
    const targetUserId = parseUserId(req.params.userId);
    try {
      const identity = await deps.resolveIdentity(req).catch(() => undefined);
      if (!identity) return res.status(401).json({ error: "Sign in to view followers" });
      if (!targetUserId || !(await exists(targetUserId))) return res.status(404).json({ error: "This member is not available" });
      const followers = await followersOf(targetUserId);
      res.set("Cache-Control", "private, no-store");
      res.json({ followers: followers.map(() => ({ label: "Member" })) });
    } catch { res.status(500).json({ error: "We could not load followers" }); }
  });

  app.get("/api/users/:userId/following", async (req, res) => {
    const targetUserId = parseUserId(req.params.userId);
    try {
      const identity = await deps.resolveIdentity(req).catch(() => undefined);
      if (!identity) return res.status(401).json({ error: "Sign in to view following" });
      if (!targetUserId || !(await exists(targetUserId))) return res.status(404).json({ error: "This member is not available" });
      const following = await followingOf(targetUserId);
      res.set("Cache-Control", "private, no-store");
      res.json({ following: following.map(() => ({ label: "Member" })) });
    } catch { res.status(500).json({ error: "We could not load following" }); }
  });
}
