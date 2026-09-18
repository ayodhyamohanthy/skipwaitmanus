import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerDmRoutes, type DmRouteDeps } from "./dmRoutes";

type TestUser = { id: number };

function buildApp(overrides: Partial<DmRouteDeps> & { users?: TestUser[]; premiumUsers?: number[]; existingThreads?: Array<[number, number]>; recentSendCount?: number; mutualFollows?: Array<[number, number]> } = {}) {
  const app = express();
  app.use(express.json());
  const users = overrides.users ?? [{ id: 11 }, { id: 22 }, { id: 33 }];
  const premium = new Set(overrides.premiumUsers ?? []);
  const threads = new Set((overrides.existingThreads ?? []).map(([a, b]) => [a, b].sort((x, y) => x - y).join(":")));
  const identities = new Map(users.map(user => [String(user.id), { account: { id: user.id, openId: `workos-${user.id}` } }]));
  registerDmRoutes(app, {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    countRecentMessagesBySender: async () => overrides.recentSendCount ?? 0,
    recordActivity: async () => undefined,
    listDmThreads: async userId => (overrides.listDmThreads ? overrides.listDmThreads(userId) : []),
    listDmThread: async (userId, counterpartUserId) => (overrides.listDmThread ? overrides.listDmThread(userId, counterpartUserId) : undefined),
    sendDirectMessage: async (userId, recipientId) => ({ id: 900 + userId + recipientId, replayed:false as const }),
    dmThreadExists: async (userId, counterpartUserId) => threads.has([userId, counterpartUserId].sort((x, y) => x - y).join(":")),
    dmRecipientExists: async userId => users.some(user => user.id === userId),
    hasActivePremiumSubscription: async userId => premium.has(userId),
    isMutualFollow: async (userA, userB) => (overrides.mutualFollows ?? []).some(([a, b]) => (a === userA && b === userB) || (a === userB && b === userA)),
    ...overrides,
  });
  return app;
}

describe("direct message paywall (X-style)", () => {
  it("rejects a free user starting a new thread with 402 and an upgrade hint", async () => {
    const response = await request(buildApp()).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi, could you refer me?" });
    expect(response.status).toBe(402);
    expect(response.body.upgrade).toBe(true);
    expect(response.body.error).toMatch(/premium feature/i);
  });

  it("allows a premium member to start a thread", async () => {
    const response = await request(buildApp({ premiumUsers: [11] })).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi!" });
    expect(response.status).toBe(201);
    expect(response.body.message.id).toBeTypeOf("number");
  });

  it("allows anyone to reply inside an existing thread", async () => {
    const response = await request(buildApp({ existingThreads: [[11, 22]] })).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Following up" });
    expect(response.status).toBe(201);
  });

  it("reflects the gate through the compose endpoint", async () => {
    const app = buildApp({ premiumUsers: [11], existingThreads: [[22, 33]] });
    expect((await request(app).get("/api/dms/compose/22").set("x-test-user", "11")).body).toMatchObject({ allowed: true, upgradeRequired: false, threadExists: false });
    expect((await request(app).get("/api/dms/compose/11").set("x-test-user", "33")).body).toMatchObject({ allowed: false, upgradeRequired: true, threadExists: false });
    expect((await request(app).get("/api/dms/compose/22").set("x-test-user", "33")).body).toMatchObject({ allowed: true, threadExists: true });
  });

  it("returns 404 for an unknown recipient and 400 for self-messaging", async () => {
    const app = buildApp({ premiumUsers: [11] });
    expect((await request(app).post("/api/dms/threads/99").set("Idempotency-Key","dm-test-key-00000002").set("x-test-user", "11").send({ body: "Hi" })).status).toBe(404);
    expect((await request(app).post("/api/dms/threads/11").set("Idempotency-Key","dm-test-key-00000003").set("x-test-user", "11").send({ body: "Hi" })).status).toBe(400);
    expect((await request(app).get("/api/dms/compose/99").set("x-test-user", "11")).status).toBe(404);
    expect((await request(app).get("/api/dms/compose/11").set("x-test-user", "11")).status).toBe(400);
  });

  it("validates the message body before anything else", async () => {
    const app = buildApp({ premiumUsers: [11] });
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "   " })).status).toBe(400);
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "x".repeat(3001) })).status).toBe(400);
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({})).status).toBe(400);
  });

  it("rate limits at 30 messages per hour even for premium senders", async () => {
    const response = await request(buildApp({ premiumUsers: [11], recentSendCount: 30 })).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi" });
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/too quickly/i);
  });

  it("lets mutually-following non-premium members message for free (X-style)", async () => {
    const app = buildApp({ mutualFollows: [[11, 22]] });
    const sent = await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hey, we follow each other!" });
    expect(sent.status).toBe(201);
    const compose = await request(app).get("/api/dms/compose/22").set("x-test-user", "11");
    expect(compose.body).toMatchObject({ allowed: true, upgradeRequired: false, mutualFollow: true });
  });

  it("still paywalls non-premium senders without a mutual follow", async () => {
    const app = buildApp({ mutualFollows: [[33, 22]] });
    const sent = await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi" });
    expect(sent.status).toBe(402);
    expect(sent.body.upgrade).toBe(true);
  });

  it("requires sign-in for the inbox, thread, compose, and send surfaces", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/dms/threads")).status).toBe(401);
    expect((await request(app).get("/api/dms/threads/22")).status).toBe(401);
    expect((await request(app).get("/api/dms/compose/22")).status).toBe(401);
    expect((await request(app).post("/api/dms/threads/22").send({ body: "Hi" })).status).toBe(401);
  });

  it("groups threads by counterpart with labels, previews, and unread counts", async () => {
    const app = buildApp({ listDmThreads: async () => [
      { counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", lastMessageBody: "Happy to help", lastMessageIsMine: false, lastMessageAt: new Date("2026-09-08T03:00:00Z"), unreadCount: 2 },
      { counterpartUserId: 33, counterpartLabel: "Member", lastMessageBody: "you prefix test", lastMessageIsMine: true, lastMessageAt: new Date("2026-09-07T03:00:00Z"), unreadCount: 0 },
    ] });
    const response = await request(app).get("/api/dms/threads").set("x-test-user", "11");
    expect(response.status).toBe(200);
    expect(response.body.threads).toHaveLength(2);
    expect(response.body.threads[0]).toMatchObject({ counterpartLabel: "Referrer · acme.com", unreadCount: 2 });
    expect(response.body.threads[1].lastMessageIsMine).toBe(true);
  });

  it("serves an open thread and 404s when no DMs exist yet", async () => {
    const app = buildApp({ listDmThread: async (userId, counterpartUserId) => userId === 11 && counterpartUserId === 22 ? { counterpartUserId: 22, counterpartLabel: "Referrer · acme.com", messages: [{ id: 1, body: "Hello", createdAt: new Date("2026-09-08T03:00:00Z"), isMine: false }] } : undefined });
    expect((await request(app).get("/api/dms/threads/22").set("x-test-user", "11")).body.thread).toMatchObject({ counterpartLabel: "Referrer · acme.com" });
    expect((await request(app).get("/api/dms/threads/33").set("x-test-user", "11")).status).toBe(404);
  });
});
