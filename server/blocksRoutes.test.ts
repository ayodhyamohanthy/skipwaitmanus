import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerBlocksRoutes, type BlocksRouteDeps } from "./blocksRoutes";

function buildApp() {
  const app = express();
  app.use(express.json());
  let nextId = 1;
  const blocks: Array<{ id: number; blockerUserId: number; blockedUserId: number; reason: string | null; createdAt: Date }> = [];
  const existingUsers = new Set([11, 22, 33]);
  const referrals = new Map<number, { jobSeekerId: number; referrerId: number | null }>([
    [601, { jobSeekerId: 11, referrerId: 22 }],
    [602, { jobSeekerId: 11, referrerId: null }],
  ]);
  const activity: Array<{ actorUserId?: number; action: string }> = [];
  const deps: BlocksRouteDeps = {
    resolveIdentity: async req => {
      const id = req.header("x-test-user");
      if (!id) return undefined;
      return { account: { id: Number(id), openId: `workos-${id}` } };
    },
    recordActivity: input => { activity.push({ actorUserId: input.actorUserId, action: input.action }); },
    blockUser: async (blockerUserId, blockedUserId, reason) => {
      if (blockedUserId === blockerUserId) throw new Error("You cannot block yourself");
      if (!existingUsers.has(blockedUserId)) throw new Error("This member is not available");
      const prior = blocks.find(block => block.blockerUserId === blockerUserId && block.blockedUserId === blockedUserId);
      if (prior) return { id: prior.id, blockedUserId, created: false };
      const row = { id: nextId++, blockerUserId, blockedUserId, reason, createdAt: new Date() };
      blocks.push(row);
      return { id: row.id, blockedUserId, created: true };
    },
    unblockUser: async (blockerUserId, blockId) => {
      const index = blocks.findIndex(block => block.id === blockId && block.blockerUserId === blockerUserId);
      if (index < 0) throw new Error("This block could not be found");
      blocks.splice(index, 1);
      return { unblocked: true as const };
    },
    listBlocks: async blockerUserId => blocks.filter(block => block.blockerUserId === blockerUserId).map(block => ({ ...block })),
    findCounterpart: async (userId, referralRequestId) => {
      const referral = referrals.get(referralRequestId);
      if (!referral || (referral.jobSeekerId !== userId && referral.referrerId !== userId)) throw new Error("This conversation is not available");
      const counterpart = userId === referral.jobSeekerId ? referral.referrerId : referral.jobSeekerId;
      if (!counterpart) throw new Error("This conversation does not have another participant yet");
      return { counterpartUserId: counterpart };
    },
  };
  registerBlocksRoutes(app, deps);
  return { app, activity };
}

describe("user blocks", () => {
  it("requires sign-in on every endpoint", async () => {
    const { app } = buildApp();
    expect((await request(app).post("/api/blocks").send({ blockedUserId: 22 })).status).toBe(401);
    expect((await request(app).get("/api/blocks/mine")).status).toBe(401);
    expect((await request(app).delete("/api/blocks/1")).status).toBe(401);
  });

  it("rejects self-blocks and malformed targets", async () => {
    const { app } = buildApp();
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({})).status).toBe(400);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 11 })).status).toBe(400);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: "nope" })).status).toBe(400);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 11, referralRequestId: 601 })).status).toBe(400);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 22, reason: "x".repeat(256) })).status).toBe(400);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 99 })).status).toBe(404);
    expect((await request(app).delete("/api/blocks/nope").set("x-test-user", "11")).status).toBe(400);
  });

  it("creates a block and reports idempotent re-blocks", async () => {
    const { app, activity } = buildApp();
    const first = await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 22, reason: "Spam" });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ blocked: true, created: true, blockedUserId: 22 });
    const again = await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 22 });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ blocked: true, created: false, id: first.body.id });
    expect(activity.filter(entry => entry.action === "block.created")).toHaveLength(2);
  });

  it("isolates block lists between users", async () => {
    const { app } = buildApp();
    await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 22 });
    await request(app).post("/api/blocks").set("x-test-user", "22").send({ blockedUserId: 11 });
    const mine = await request(app).get("/api/blocks/mine").set("x-test-user", "11");
    expect(mine.body.blocks).toHaveLength(1);
    expect(mine.body.blocks[0]).toMatchObject({ blockedUserId: 22 });
    expect((await request(app).get("/api/blocks/mine").set("x-test-user", "33")).body.blocks).toHaveLength(0);
  });

  it("unblocks owned rows and 404s otherwise", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/blocks").set("x-test-user", "11").send({ blockedUserId: 22 });
    const removed = await request(app).delete(`/api/blocks/${created.body.id}`).set("x-test-user", "11");
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ unblocked: true });
    expect((await request(app).delete(`/api/blocks/${created.body.id}`).set("x-test-user", "11")).status).toBe(404);
    const other = await request(app).post("/api/blocks").set("x-test-user", "22").send({ blockedUserId: 33 });
    expect((await request(app).delete(`/api/blocks/${other.body.id}`).set("x-test-user", "11")).status).toBe(404);
  });

  it("blocks the other participant via referralRequestId", async () => {
    const { app } = buildApp();
    const seekerBlock = await request(app).post("/api/blocks").set("x-test-user", "11").send({ referralRequestId: 601 });
    expect(seekerBlock.status).toBe(201);
    expect(seekerBlock.body).toMatchObject({ blocked: true, created: true, blockedUserId: 22 });
    const referrerBlock = await request(app).post("/api/blocks").set("x-test-user", "22").send({ referralRequestId: 601 });
    expect(referrerBlock.body).toMatchObject({ blocked: true, created: true, blockedUserId: 11 });
    expect((await request(app).post("/api/blocks").set("x-test-user", "33").send({ referralRequestId: 601 })).status).toBe(404);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ referralRequestId: 999 })).status).toBe(404);
    expect((await request(app).post("/api/blocks").set("x-test-user", "11").send({ referralRequestId: 602 })).status).toBe(400);
  });
});
