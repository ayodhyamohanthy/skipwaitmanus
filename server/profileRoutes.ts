import express, { type Express, type Request } from "express";
import { createWorkItem, deleteWorkItem, getMyProfile, getPublicProfileByHandle, getReferrerPreferences, listMyWorkItems, normalizeProfileHandle, updateMyProfile, updateReferrerPreferences, updateWorkItem } from "./db";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type Identity = { account: Account };

export type ProfileRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number }) => void;
  getMyProfile?: typeof getMyProfile;
  updateMyProfile?: typeof updateMyProfile;
  listMyWorkItems?: typeof listMyWorkItems;
  createWorkItem?: typeof createWorkItem;
  updateWorkItem?: typeof updateWorkItem;
  deleteWorkItem?: typeof deleteWorkItem;
  getPublicProfileByHandle?: typeof getPublicProfileByHandle;
  getReferrerPreferences?: typeof getReferrerPreferences;
  updateReferrerPreferences?: typeof updateReferrerPreferences;
};

const itemId = (raw: string) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

export function registerProfileRoutes(app: Express, deps: ProfileRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input); };
  const myProfile = deps.getMyProfile ?? getMyProfile;
  const saveProfile = deps.updateMyProfile ?? updateMyProfile;
  const myItems = deps.listMyWorkItems ?? listMyWorkItems;
  const addItem = deps.createWorkItem ?? createWorkItem;
  const editItem = deps.updateWorkItem ?? updateWorkItem;
  const removeItem = deps.deleteWorkItem ?? deleteWorkItem;
  const publicProfile = deps.getPublicProfileByHandle ?? getPublicProfileByHandle;

  app.get("/api/profile/me", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your profile" });
      res.set("Cache-Control", "private, no-store");
      res.json(await myProfile(identity.account.id));
    } catch { res.status(500).json({ error: "We could not load your profile" }); }
  });

  app.put("/api/profile/me", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to update your profile" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const result = await saveProfile(identity.account.id, {
        headline: body.headline as string | undefined,
        currentTitle: body.currentTitle as string | undefined,
        location: body.location as string | undefined,
        bio: body.bio as string | undefined,
        skills: body.skills as string | undefined,
        handle: (body.handle as string | null | undefined) ?? undefined,
        profileVisibility: body.profileVisibility as string | undefined,
      });
      record({ actorUserId: identity.account.id, action: "profile.updated", outcome: "success", resourceType: "profile" });
      res.set("Cache-Control", "private, no-store");
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not update your profile";
      res.status(/taken|reserved|visibility|must be|string/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.get("/api/work-items", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your work" });
      res.set("Cache-Control", "private, no-store");
      res.json({ items: await myItems(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your work" }); }
  });

  app.get("/api/referrer-preferences", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your referrer settings" });
      const prefs = deps.getReferrerPreferences ?? getReferrerPreferences;
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences: await prefs(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your referrer settings" }); }
  });

  app.put("/api/referrer-preferences", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to change your referrer settings" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const save = deps.updateReferrerPreferences ?? updateReferrerPreferences;
      const preferences = await save(identity.account.id, {
        referralCapacity: body.referralCapacity,
        preferAreas: body.preferAreas,
        referrerVisibility: body.referrerVisibility,
        notifyNewAsk: body.notifyNewAsk,
        notifyDigest: body.notifyDigest,
        paused: body.paused,
      });
      record({ actorUserId: identity.account.id, action: "referrer_preferences.updated", outcome: "success", resourceType: "referrer_preferences" });
      res.set("Cache-Control", "private, no-store");
      res.json({ preferences });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save your referrer settings";
      res.status(/capacity|areas|visibility/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.post("/api/work-items", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to add work" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const item = await addItem(identity.account.id, { title: body.title, kind: body.kind, source: body.source, url: body.url, pinned: body.pinned, visibleOnProfile: body.visibleOnProfile });
      record({ actorUserId: identity.account.id, action: "work_item.created", outcome: "success", resourceType: "work_item", resourceId: item.id });
      res.status(201).json({ item });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not add this work";
      res.status(/title|kind|link|up to 20|string/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.patch("/api/work-items/:itemId", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to edit work" });
      const id = itemId(req.params.itemId);
      if (!id) return res.status(400).json({ error: "Invalid work item" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const item = await editItem(identity.account.id, id, { title: body.title, kind: body.kind, source: body.source, url: body.url, pinned: body.pinned, visibleOnProfile: body.visibleOnProfile });
      res.set("Cache-Control", "private, no-store");
      res.json({ item });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not update this work";
      res.status(/not in your account/i.test(message) ? 404 : /title|kind|link|string/i.test(message) ? 400 : 500).json({ error: message });
    }
  });

  app.delete("/api/work-items/:itemId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to remove work" });
      const id = itemId(req.params.itemId);
      if (!id) return res.status(400).json({ error: "Invalid work item" });
      res.json(await removeItem(identity.account.id, id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not remove this work";
      res.status(/not in your account/i.test(message) ? 404 : 500).json({ error: message });
    }
  });

  app.get("/api/p/:handle", async (req, res) => {
    try {
      if (!normalizeProfileHandle(req.params.handle)) return res.status(404).json({ error: "This profile isn't available" });
      const identity = await deps.resolveIdentity(req).catch(() => undefined);
      const profile = await publicProfile(req.params.handle, identity?.account.id);
      if (!profile) return res.status(404).json({ error: "This profile isn't available" });
      if (profile.visible && profile.visibility === "link") res.set("X-Robots-Tag", "noindex");
      res.set("Cache-Control", "private, no-store");
      res.json({ profile });
    } catch { res.status(500).json({ error: "We could not load this profile" }); }
  });
}
