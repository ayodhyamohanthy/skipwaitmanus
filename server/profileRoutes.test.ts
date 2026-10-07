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
      const current = profiles.get(userId) ?? { userId, headline: null, handle: null, profileVisibility: "private" };
      profiles.set(userId, { ...current, headline: typeof input.headline === "string" ? input.headline : current.headline, handle: input.handle === undefined ? current.handle : (typeof input.handle === "string" ? normalize(input.handle) as string : null), profileVisibility: typeof input.profileVisibility === "string" ? input.profileVisibility : current.profileVisibility });
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
});
