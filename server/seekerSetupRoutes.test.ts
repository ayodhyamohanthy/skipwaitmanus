import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerProfileRoutes } from "./profileRoutes";
import { SeekerSetupResumeError, shapeSeekerSetup } from "./seekerSetup";
import { DEFAULT_SEEKER_SETUP, seekerSetupPatchSchema, type SeekerSetup } from "../shared/seekerSetup";

// Two users, one in-memory store keyed by the SESSION user id. Resume 900 belongs to user 22.
function buildApp() {
  const store = new Map<number, SeekerSetup>();
  const resumeOwners = new Map<number, number>([[500, 11], [900, 22]]);
  const calls: Array<{ userId: number; patch: unknown }> = [];
  const app = express();
  registerProfileRoutes(app, {
    resolveIdentity: async req => { const id = Number(req.header("x-test-user")); return id ? { account: { id, openId: `o${id}` } } : undefined; },
    getSeekerSetup: async userId => store.get(userId) ?? { ...DEFAULT_SEEKER_SETUP },
    updateSeekerSetup: async (userId, patch) => {
      calls.push({ userId, patch });
      if (patch.resumeAttachmentId && resumeOwners.get(patch.resumeAttachmentId) !== userId) throw new SeekerSetupResumeError();
      const current = store.get(userId) ?? { ...DEFAULT_SEEKER_SETUP };
      const { resumeAttachmentId, ...rest } = patch;
      const next = { ...current, ...rest, resume: resumeAttachmentId === undefined ? current.resume : resumeAttachmentId === null ? null : { id: resumeAttachmentId, fileName: "me.pdf" } } as SeekerSetup;
      store.set(userId, next);
      return next;
    },
  });
  return { app, calls };
}

describe("/api/profile/setup", () => {
  it("requires sign-in for read and write", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/profile/setup")).status).toBe(401);
    expect((await request(app).patch("/api/profile/setup").send({ goal: "Just graduated" })).status).toBe(401);
  });

  it("saves and returns the caller's own answers, never another user's", async () => {
    const { app, calls } = buildApp();
    const saved = await request(app).patch("/api/profile/setup").set("x-test-user", "11").send({ goal: "Just graduated", roles: ["Sales", "Sales", "Marketing"], city: "  Pune  ", resumeAttachmentId: 500 });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ goal: "Just graduated", roles: ["Sales", "Marketing"], city: "Pune", resume: { id: 500 } });
    expect(saved.headers["cache-control"]).toBe("private, no-store");
    expect((await request(app).get("/api/profile/setup").set("x-test-user", "11")).body.city).toBe("Pune");
    const other = await request(app).get("/api/profile/setup").set("x-test-user", "22");
    expect(other.body).toMatchObject({ city: "", roles: [], resume: null });
    // The session decides whose row is written, even if the body names a user.
    await request(app).patch("/api/profile/setup").set("x-test-user", "22").send({ city: "Delhi" });
    expect(calls.every(call => !("userId" in (call.patch as object)))).toBe(true);
    expect((await request(app).get("/api/profile/setup").set("x-test-user", "11")).body.city).toBe("Pune");
  });

  it("rejects another user's resume and unknown or malformed fields", async () => {
    const { app } = buildApp();
    const stolen = await request(app).patch("/api/profile/setup").set("x-test-user", "11").send({ resumeAttachmentId: 900 });
    expect(stolen.status).toBe(400);
    expect((await request(app).get("/api/profile/setup").set("x-test-user", "11")).body.resume).toBeNull();
    for (const body of [{ userId: 22 }, { roles: ["Astronaut"] }, { roles: ["Sales", "Marketing", "Operations", "Consulting"] }, { goal: "Hacker" }, { city: "x".repeat(121) }, { remote: "yes" }, { resumeAttachmentId: -1 }]) {
      expect((await request(app).patch("/api/profile/setup").set("x-test-user", "11").send(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("clears the resume with an explicit null and leaves it alone when omitted", async () => {
    const { app } = buildApp();
    await request(app).patch("/api/profile/setup").set("x-test-user", "11").send({ resumeAttachmentId: 500 });
    expect((await request(app).patch("/api/profile/setup").set("x-test-user", "11").send({ city: "Pune" })).body.resume).toMatchObject({ id: 500 });
    expect((await request(app).patch("/api/profile/setup").set("x-test-user", "11").send({ resumeAttachmentId: null })).body.resume).toBeNull();
  });
});

describe("seeker setup shaping", () => {
  it("falls back to honest defaults for malformed stored values", () => {
    const shaped = shapeSeekerSetup({ openTo: "{not json", seekerGoal: "Hacker", experienceLevel: "Wizard", workLinkKinds: JSON.stringify(["GitHub", "Myspace", "GitHub"]), workAuthorization: "?", searchRemote: null }, null);
    expect(shaped).toMatchObject({ goal: "Actively looking", roles: [], level: "", links: ["GitHub"], remote: true, city: "", resume: null });
  });
  it("keeps only known roles and caps them at three", () => {
    expect(shapeSeekerSetup({ openTo: JSON.stringify(["Sales", "Astronaut", "Marketing", "Operations", "Consulting"]) }, null).roles).toEqual(["Sales", "Marketing", "Operations"]);
  });
  it("patch schema dedupes roles before the limit", () => {
    expect(seekerSetupPatchSchema.parse({ roles: ["Sales", "Sales", "Marketing", "Operations"] }).roles).toEqual(["Sales", "Marketing", "Operations"]);
  });
});
