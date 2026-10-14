import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { registerDmRoutes, type DmRouteDeps } from "./dmRoutes";
import { decideReferrerDmGate } from "./dmReferrerGate";

type TestUser = { id: number };

function buildApp(overrides: Partial<DmRouteDeps> & { users?: TestUser[]; premiumUsers?: number[]; existingThreads?: Array<[number, number]>; recentSendCount?: number; mutualFollows?: Array<[number, number]>; verifiedReferrers?: number[]; acceptedPairs?: Array<[number, number]> } = {}) {
  const app = express();
  app.use(express.json());
  const users = overrides.users ?? [{ id: 11 }, { id: 22 }, { id: 33 }];
  const premium = new Set(overrides.premiumUsers ?? []);
  const threads = new Set((overrides.existingThreads ?? []).map(([a, b]) => [a, b].sort((x, y) => x - y).join(":")));
  const referrers = new Set(overrides.verifiedReferrers ?? []);
  const accepted = new Set((overrides.acceptedPairs ?? []).map(([a, b]) => [a, b].sort((x, y) => x - y).join(":")));
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
    referrerDmGate: async (sender, recipient) => decideReferrerDmGate({ senderIsReferrer: referrers.has(sender), recipientIsReferrer: referrers.has(recipient), accepted: accepted.has([sender, recipient].sort((x, y) => x - y).join(":")) }),
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

describe("referrer messages open only after acceptance (D-012 item 3)", () => {
  const SEEKER = 11, REFERRER = 22, MEMBER = 33;
  const key = (n: number) => `dm-referrer-key-${String(n).padStart(8, "0")}`;
  type Activity = Parameters<NonNullable<DmRouteDeps["recordActivity"]>>[0];
  const send = (app: ReturnType<typeof buildApp>, from: number, to: number, n = 1) => request(app).post(`/api/dms/threads/${to}`).set("Idempotency-Key", key(n)).set("x-test-user", String(from)).send({ body: "Hello" });

  it("rejects a seeker writing to a referrer before acceptance with 403, even with a paid plan and a mutual follow", async () => {
    const activity: Activity[] = [];
    let sends = 0;
    const app = buildApp({ verifiedReferrers: [REFERRER], premiumUsers: [SEEKER], mutualFollows: [[SEEKER, REFERRER]], recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    const response = await send(app, SEEKER, REFERRER);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request." });
    expect(response.body.upgrade).toBeUndefined();
    expect(sends).toBe(0);
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: SEEKER, action: "dm.sent", outcome: "denied", metadata: { reason: "referrer_acceptance_required" } }));
  });

  it("rejects a referrer writing to a seeker before acceptance", async () => {
    const response = await send(buildApp({ verifiedReferrers: [REFERRER], premiumUsers: [REFERRER] }), REFERRER, SEEKER);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ reason: "referrer_acceptance_required", error: "You can message this member after you accept their referral request." });
  });

  it("blocks both sides of a thread that started before acceptance", async () => {
    const app = buildApp({ verifiedReferrers: [REFERRER], existingThreads: [[SEEKER, REFERRER]], listDmThread: async (userId, counterpartUserId) => ({ counterpartUserId, counterpartLabel: "Referrer · acme.com", messages: [{ id: 1, body: "Hi", createdAt: new Date("2026-09-08T03:00:00Z"), isMine: userId === SEEKER }] }) });
    expect((await send(app, SEEKER, REFERRER)).status).toBe(403);
    expect((await send(app, REFERRER, SEEKER, 2)).status).toBe(403);
    const opened = await request(app).get(`/api/dms/threads/${REFERRER}`).set("x-test-user", String(SEEKER));
    expect(opened.status).toBe(200);
    expect(opened.body.thread.messages).toHaveLength(1);
    expect(opened.body.sendBlock).toEqual({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request." });
  });

  it("opens both directions once the referrer accepted, with no plan, follow or thread", async () => {
    const app = buildApp({ verifiedReferrers: [REFERRER], acceptedPairs: [[SEEKER, REFERRER]] });
    expect((await send(app, SEEKER, REFERRER)).status).toBe(201);
    expect((await send(app, REFERRER, SEEKER, 2)).status).toBe(201);
    expect((await request(app).get(`/api/dms/compose/${REFERRER}`).set("x-test-user", String(SEEKER))).body).toMatchObject({ allowed: true, upgradeRequired: false, sendBlock: null });
  });

  it("explains the rule, not an upgrade, through the compose endpoint", async () => {
    const app = buildApp({ verifiedReferrers: [REFERRER] });
    const compose = await request(app).get(`/api/dms/compose/${REFERRER}`).set("x-test-user", String(SEEKER));
    expect(compose.body).toMatchObject({ allowed: false, upgradeRequired: false, sendBlock: { reason: "referrer_acceptance_required" } });
  });

  it("invariant: a seeker's plan, follows or thread never change a referrer pair's outcome", async () => {
    for (const accepted of [false, true]) for (const seekerPaid of [false, true]) for (const referrerPaid of [false, true]) for (const mutual of [false, true]) for (const thread of [false, true]) {
      const app = buildApp({ verifiedReferrers: [REFERRER], acceptedPairs: accepted ? [[SEEKER, REFERRER]] : [], premiumUsers: [...(seekerPaid ? [SEEKER] : []), ...(referrerPaid ? [REFERRER] : [])], mutualFollows: mutual ? [[SEEKER, REFERRER]] : [], existingThreads: thread ? [[SEEKER, REFERRER]] : [] });
      const expected = accepted ? 201 : 403;
      expect((await send(app, SEEKER, REFERRER)).status, JSON.stringify({ accepted, seekerPaid, referrerPaid, mutual, thread })).toBe(expected);
      expect((await send(app, REFERRER, SEEKER, 2)).status).toBe(expected);
      expect((await request(app).get(`/api/dms/compose/${REFERRER}`).set("x-test-user", String(SEEKER))).body.allowed).toBe(accepted);
    }
  });

  it("keeps the member rules for two members who are not verified referrers", async () => {
    const paid = buildApp({ verifiedReferrers: [REFERRER], premiumUsers: [SEEKER] });
    expect((await send(paid, SEEKER, MEMBER)).status).toBe(201);
    const following = buildApp({ verifiedReferrers: [REFERRER], mutualFollows: [[SEEKER, MEMBER]] });
    expect((await send(following, SEEKER, MEMBER)).status).toBe(201);
    const neither = await send(buildApp({ verifiedReferrers: [REFERRER] }), SEEKER, MEMBER);
    expect(neither.status).toBe(402);
    expect(neither.body).toMatchObject({ upgrade: true });
    expect(neither.body.error).not.toMatch(/referrer/i);
  });

  it("maps a gate refusal raised inside the send transaction to the same 403 and denied row", async () => {
    const activity: Activity[] = [];
    const { DirectMessageReferrerGateError } = await import("./dmReferrerGate");
    const app = buildApp({ verifiedReferrers: [REFERRER], acceptedPairs: [[SEEKER, REFERRER]], recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { throw new DirectMessageReferrerGateError({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request." }); } });
    const response = await send(app, SEEKER, REFERRER);
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("referrer_acceptance_required");
    expect(activity).toContainEqual(expect.objectContaining({ outcome: "denied", metadata: { reason: "referrer_acceptance_required" } }));
  });
});
