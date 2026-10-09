import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerProfileRoutes, type ProfileRouteDeps } from "./profileRoutes";

type Profile = { userId: number; headline: string | null; handle: string | null; profileVisibility: string };
type Item = { id: number; userId: number; title: string; kind: string; source: string | null; url: string | null; pinned: boolean; visibleOnProfile: boolean };

function buildApp() {
  const app = express();
  app.use(express.json());
  const profiles = new Map<number, Profile>([
    [11, { userId: 11, headline: "Designer", handle: "asha-r", profileVisibility: "link" }],
    [22, { userId: 22, headline: null, handle: null, profileVisibility: "private" }],
  ]);
  let items: Item[] = [{ id: 7, userId: 11, title: "Redesign", kind: "case_study", source: "Behance", url: "https://behance.net/x", pinned: true, visibleOnProfile: true }];
  let nextId = 8;
  const deps: ProfileRouteDeps = {
    resolveIdentity: async req => {
      const id = req.header("x-test-user");
      return id ? { account: { id: Number(id), openId: `workos-${id}` } } : undefined;
    },
    getReferrerPreferences: async () => ({ referralCapacity: 3, preferAreas: ["Design"], referrerVisibility: "anon", notifyNewAsk: true, notifyDigest: false, paused: false }),
    updateReferrerPreferences: async (_userId, input) => {
      if (input.referralCapacity !== undefined && (Number(input.referralCapacity) < 1 || Number(input.referralCapacity) > 15)) throw new Error("Capacity is 1 to 15 asks");
      if (input.preferAreas !== undefined && !Array.isArray(input.preferAreas)) throw new Error("Choose job areas from the list");
      if (input.preferLevels !== undefined && !Array.isArray(input.preferLevels)) throw new Error("Choose levels from the list");
      if (input.referrerVisibility !== undefined && input.referrerVisibility !== "anon" && input.referrerVisibility !== "named") throw new Error("Choose anonymous or named visibility");
      return { referralCapacity: Number(input.referralCapacity ?? 3), preferAreas: Array.isArray(input.preferAreas) ? input.preferAreas as string[] : ["Design"], preferLevels: Array.isArray(input.preferLevels) ? input.preferLevels as string[] : [], referrerVisibility: (input.referrerVisibility as string) ?? "anon", notifyNewAsk: Boolean(input.notifyNewAsk ?? true), notifyDigest: Boolean(input.notifyDigest ?? false), paused: Boolean(input.paused ?? false) };
    },
    getMyProfile: async userId => ({ displayName: `User ${userId}`, profile: profiles.get(userId) ?? null, workItems: items.filter(item => item.userId === userId) }),
    updateMyProfile: async (userId, input) => {
      const normalize = (raw: string) => {
        const handle = raw.trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(handle) || ["admin", "explore"].includes(handle)) return undefined;
        return handle;
      };
      if (typeof input.handle === "string" && normalize(input.handle) === undefined) throw new Error("Handles use 3-40 lowercase letters, numbers, or dashes, and cannot be a reserved word");
      if (typeof input.handle === "string" && [...profiles.values()].some(p => p.handle === normalize(input.handle as string) && p.userId !== userId)) throw new Error("That handle is already taken");
      if (input.profileVisibility !== undefined && !["public", "link", "private"].includes(String(input.profileVisibility))) throw new Error("Choose public, link-only, or private visibility");
      if (input.openTo !== undefined && !Array.isArray(input.openTo)) throw new Error("List the roles you are open to as an array");
      const current = profiles.get(userId) ?? { userId, headline: null, handle: null, profileVisibility: "private" };
      profiles.set(userId, { ...current, headline: typeof input.headline === "string" ? input.headline : current.headline, handle: input.handle === undefined ? current.handle : (typeof input.handle === "string" ? normalize(input.handle) as string : null), profileVisibility: typeof input.profileVisibility === "string" ? input.profileVisibility : current.profileVisibility, openTo: input.openTo === undefined ? (current as { openTo?: unknown }).openTo ?? null : JSON.stringify((input.openTo as unknown[]).filter((role): role is string => typeof role === "string").map(role => role.trim()).filter(role => role.length > 0 && role.length <= 60).slice(0, 5)) });
      return { displayName: `User ${userId}`, profile: profiles.get(userId) ?? null, workItems: [] };
    },
    listMyWorkItems: async userId => items.filter(item => item.userId === userId),
    createWorkItem: async (userId, input) => {
      if (typeof input.title !== "string" || !input.title.trim()) throw new Error("Give each work item a title up to 160 characters");
      if (items.filter(item => item.userId === userId).length >= 20) throw new Error("Work showcases hold up to 20 items");
      if (input.url !== undefined && input.url !== null && input.url !== "" && (typeof input.url !== "string" || !/^https?:\/\//i.test(input.url))) throw new Error("Work links must start with http:// or https://");
      const item: Item = { id: nextId++, userId, title: String(input.title), kind: "other", source: null, url: (input.url as string) ?? null, pinned: false, visibleOnProfile: false };
      items.push(item);
      return item;
    },
    updateWorkItem: async (userId, id, input) => {
      const current = items.find(item => item.id === id);
      if (!current || current.userId !== userId) throw new Error("This work item is not in your account");
      Object.assign(current, { title: input.title ?? current.title, pinned: input.pinned ?? current.pinned, visibleOnProfile: input.visibleOnProfile ?? current.visibleOnProfile });
      return current;
    },
    deleteWorkItem: async (userId, id) => {
      const current = items.find(item => item.id === id);
      if (!current || current.userId !== userId) throw new Error("This work item is not in your account");
      items = items.filter(item => item.id !== id);
      return { deleted: true as const, id };
    },
    getPublicProfileByHandle: async (handle, viewerUserId) => {
      const owner = [...profiles.values()].find(p => p.handle === handle);
      if (!owner) return undefined;
      if (owner.profileVisibility === "private" && viewerUserId !== owner.userId) return { visible: false as const, visibility: owner.profileVisibility };
      return { visible: true as const, visibility: owner.profileVisibility, isOwner: viewerUserId === owner.userId, displayName: `User ${owner.userId}`, headline: owner.headline, currentTitle: null, location: null, bio: null, skills: null, company: null, verifiedWork: null, handle: owner.handle, workItems: items.filter(item => item.userId === owner.userId && (viewerUserId === owner.userId || item.visibleOnProfile)) };
    },
  };
  registerProfileRoutes(app, deps);
  return app;
}

describe("profile and work showcase routes", () => {
  it("reads and updates the signed-in profile", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/profile/me").set("x-test-user", "11")).body).toMatchObject({ displayName: "User 11" });
    expect((await request(app).get("/api/profile/me")).status).toBe(401);
    const saved = await request(app).put("/api/profile/me").set("x-test-user", "22").send({ headline: "Engineer", handle: " Ravi-K ", profileVisibility: "public", admin: true });
    expect(saved.status).toBe(200);
    expect(saved.body.profile).toMatchObject({ headline: "Engineer", handle: "ravi-k", profileVisibility: "public" });
    expect(saved.body.profile).not.toHaveProperty("admin");
  });

  it("rejects bad handles, reserved words, taken handles, and bad visibility", async () => {
    const app = buildApp();
    expect((await request(app).put("/api/profile/me").set("x-test-user", "22").send({ handle: "AB" })).status).toBe(400);
    expect((await request(app).put("/api/profile/me").set("x-test-user", "22").send({ handle: "admin" })).status).toBe(400);
    expect((await request(app).put("/api/profile/me").set("x-test-user", "22").send({ handle: "asha-r" })).status).toBe(400);
    expect((await request(app).put("/api/profile/me").set("x-test-user", "22").send({ handle: "ASH A" })).status).toBe(400);
    expect((await request(app).put("/api/profile/me").set("x-test-user", "22").send({ profileVisibility: "everyone" })).status).toBe(400);
    expect((await request(app).put("/api/profile/me").set("x-test-user", "22").send({ openTo: "Designer" })).status).toBe(400);
    const roles = await request(app).put("/api/profile/me").set("x-test-user", "22").send({ openTo: ["Product Designer", "UX Lead"] });
    expect(roles.status).toBe(200);
    expect(JSON.parse(roles.body.profile.openTo)).toEqual(["Product Designer", "UX Lead"]);
  });

  it("creates, edits, and deletes own work with ownership enforcement", async () => {
    const app = buildApp();
    expect((await request(app).post("/api/work-items").set("x-test-user", "22").send({})).status).toBe(400);
    expect((await request(app).post("/api/work-items").set("x-test-user", "22").send({ title: "X", url: "notaurl" })).status).toBe(400);
    const created = await request(app).post("/api/work-items").set("x-test-user", "22").send({ title: "Launch", url: "https://example.com/launch", pinned: true });
    expect(created.status).toBe(201);
    expect((await request(app).patch("/api/work-items/7").set("x-test-user", "22").send({ pinned: true })).status).toBe(404);
    const edited = await request(app).patch(`/api/work-items/${created.body.item.id}`).set("x-test-user", "22").send({ visibleOnProfile: true });
    expect(edited.body.item).toMatchObject({ visibleOnProfile: true });
    expect((await request(app).delete(`/api/work-items/${created.body.item.id}`).set("x-test-user", "22")).status).toBe(200);
    expect((await request(app).delete("/api/work-items/7").set("x-test-user", "22")).status).toBe(404);
  });

  it("gates public profiles by visibility without sign-in", async () => {
    const app = buildApp();
    const link = await request(app).get("/api/p/asha-r");
    expect(link.status).toBe(200);
    expect(link.headers["x-robots-tag"]).toBe("noindex");
    expect((await request(app).get("/api/p/missing-handle")).status).toBe(404);
    expect((await request(app).get("/api/p/ASH A")).status).toBe(404);
  });

  it("reads and validates referrer preferences", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/referrer-preferences")).status).toBe(401);
    const current = await request(app).get("/api/referrer-preferences").set("x-test-user", "11");
    expect(current.body.preferences).toMatchObject({ referralCapacity: 3, paused: false });
    expect((await request(app).put("/api/referrer-preferences").set("x-test-user", "11").send({ referralCapacity: 99 })).status).toBe(400);
    expect((await request(app).put("/api/referrer-preferences").set("x-test-user", "11").send({ preferAreas: "Design" })).status).toBe(400);
    expect((await request(app).put("/api/referrer-preferences").set("x-test-user", "11").send({ preferLevels: "Senior" })).status).toBe(400);
    expect((await request(app).put("/api/referrer-preferences").set("x-test-user", "11").send({ referrerVisibility: "everyone" })).status).toBe(400);
    const saved = await request(app).put("/api/referrer-preferences").set("x-test-user", "11").send({ referralCapacity: 5, preferAreas: ["Design", "Product"], referrerVisibility: "named", paused: true });
    expect(saved.status).toBe(200);
    expect(saved.body.preferences).toMatchObject({ referralCapacity: 5, paused: true, referrerVisibility: "named" });
  });
});
