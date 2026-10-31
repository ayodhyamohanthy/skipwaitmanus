import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { DM_FOLLOW_REQUIRED_ERROR } from "../shared/directMessages";
import { DirectMessageFollowRequiredError } from "./db";
import { registerDmRoutes, type DmRouteDeps } from "./dmRoutes";
import { decideReferrerDmGate } from "./dmReferrerGate";

type TestUser = { id: number };
type Activity = Parameters<NonNullable<DmRouteDeps["recordActivity"]>>[0];

/**
 * D-067: the member-message "premium" perk is removed. `paidPlanUsers` hands the
 * routes the old plan dependency anyway (a paid plan for these users), so each
 * test proves no plan opens a send: the routes no longer read it.
 */
function buildApp(overrides: Partial<DmRouteDeps> & { users?: TestUser[]; paidPlanUsers?: number[]; existingThreads?: Array<[number, number]>; recentSendCount?: number; recentRefusalCount?: number; mutualFollows?: Array<[number, number]>; verifiedReferrers?: number[]; acceptedPairs?: Array<[number, number]> } = {}) {
  const app = express();
  app.use(express.json());
  const users = overrides.users ?? [{ id: 11 }, { id: 22 }, { id: 33 }];
  const paid = new Set(overrides.paidPlanUsers ?? []);
  const threads = new Set((overrides.existingThreads ?? []).map(([a, b]) => [a, b].sort((x, y) => x - y).join(":")));
  const referrers = new Set(overrides.verifiedReferrers ?? []);
  const accepted = new Set((overrides.acceptedPairs ?? []).map(([a, b]) => [a, b].sort((x, y) => x - y).join(":")));
  const identities = new Map(users.map(user => [String(user.id), { account: { id: user.id, openId: `workos-${user.id}` } }]));
  const retiredPlanDep = { hasActivePremiumSubscription: async (userId: number) => paid.has(userId) };
  registerDmRoutes(app, {
    resolveIdentity: async req => identities.get(String(req.header("x-test-user"))),
    countRecentMessagesBySender: async () => overrides.recentSendCount ?? 0,
    recordActivity: async () => undefined,
    listDmThreads: async userId => (overrides.listDmThreads ? overrides.listDmThreads(userId) : []),
    listDmThread: async (userId, counterpartUserId) => (overrides.listDmThread ? overrides.listDmThread(userId, counterpartUserId) : undefined),
    sendDirectMessage: async (userId, recipientId) => ({ id: 900 + userId + recipientId, replayed:false as const }),
    dmThreadExists: async (userId, counterpartUserId) => threads.has([userId, counterpartUserId].sort((x, y) => x - y).join(":")),
    dmRecipientExists: async userId => users.some(user => user.id === userId),
    ...retiredPlanDep,
    isMutualFollow: async (userA, userB) => (overrides.mutualFollows ?? []).some(([a, b]) => (a === userA && b === userB) || (a === userB && b === userA)),
    countRecentDmRefusals: async () => overrides.recentRefusalCount ?? 0,
    referrerDmGate: async (sender, recipient) => decideReferrerDmGate({ senderIsReferrer: referrers.has(sender), recipientIsReferrer: referrers.has(recipient), accepted: accepted.has([sender, recipient].sort((x, y) => x - y).join(":")) }),
    ...overrides,
  });
  return app;
}

const FOLLOW_REQUIRED = { reason: "mutual_follow_required", error: DM_FOLLOW_REQUIRED_ERROR };
/** The member refusal never pitches a plan or an upgrade (D-067). */
function expectFollowRule(response: request.Response) {
  expect(response.status).toBe(403);
  expect(response.body).toEqual(FOLLOW_REQUIRED);
  expect(response.body.upgrade).toBeUndefined();
  expect(response.body.error).not.toMatch(/premium|\bpro\b|\bmax\b|upgrade|plan|referrer/i);
}

describe("member direct messages: an existing thread or a mutual follow (D-067)", () => {
  it("refuses a member starting a new thread without a mutual follow: 403 with the follow rule, nothing sent", async () => {
    const activity: Activity[] = [];
    let sends = 0;
    const app = buildApp({ recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    const response = await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi, could you refer me?" });
    expectFollowRule(response);
    expect(sends).toBe(0);
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 11, action: "dm.sent", outcome: "denied", metadata: { reason: "mutual_follow_required" } }));
  });

  it("no plan opens a new member thread: a paid plan alone is refused like Free", async () => {
    let sends = 0;
    const app = buildApp({ paidPlanUsers: [11, 22], sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    expectFollowRule(await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi!" }));
    expect(sends).toBe(0);
  });

  it("allows anyone to reply inside an existing thread", async () => {
    const response = await request(buildApp({ existingThreads: [[11, 22]] })).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Following up" });
    expect(response.status).toBe(201);
  });

  it("applies the gate on send for each pair the retired compose endpoint used to report", async () => {
    const app = buildApp({ paidPlanUsers: [33], mutualFollows: [[11, 22]], existingThreads: [[22, 33]] });
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000011").set("x-test-user", "11").send({ body: "Hi" })).status).toBe(201);
    expectFollowRule(await request(app).post("/api/dms/threads/11").set("Idempotency-Key","dm-test-key-00000012").set("x-test-user", "33").send({ body: "Hi" }));
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000013").set("x-test-user", "33").send({ body: "Hi" })).status).toBe(201);
  });

  it("no longer serves the compose endpoint (it disclosed verified referrers without a send)", async () => {
    const app = buildApp({ paidPlanUsers: [11], verifiedReferrers: [22] });
    for (const target of [22, 33, 99, 11]) expect((await request(app).get(`/api/dms/compose/${target}`).set("x-test-user", "11")).status).toBe(404);
    expect((await request(app).get("/api/dms/compose/22")).status).toBe(404);
  });

  it("returns 404 for an unknown recipient and 400 for self-messaging", async () => {
    const app = buildApp({ mutualFollows: [[11, 22]] });
    expect((await request(app).post("/api/dms/threads/99").set("Idempotency-Key","dm-test-key-00000002").set("x-test-user", "11").send({ body: "Hi" })).status).toBe(404);
    expect((await request(app).post("/api/dms/threads/11").set("Idempotency-Key","dm-test-key-00000003").set("x-test-user", "11").send({ body: "Hi" })).status).toBe(400);
  });

  it("validates the message body before anything else", async () => {
    const app = buildApp({ mutualFollows: [[11, 22]] });
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "   " })).status).toBe(400);
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "x".repeat(3001) })).status).toBe(400);
    expect((await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({})).status).toBe(400);
  });

  it("rate limits at 30 messages per hour even inside an open thread", async () => {
    const response = await request(buildApp({ existingThreads: [[11, 22]], recentSendCount: 30 })).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi" });
    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/too quickly/i);
  });

  it("lets mutually-following members message for free (X-style)", async () => {
    const app = buildApp({ mutualFollows: [[11, 22]] });
    const sent = await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hey, we follow each other!" });
    expect(sent.status).toBe(201);
  });

  it("refuses a sender with no mutual follow with the recipient, whoever else follows them", async () => {
    const app = buildApp({ mutualFollows: [[33, 22]] });
    expectFollowRule(await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi" }));
  });

  it("maps a follow refusal raised inside the send transaction to the same 403 and denied row, never a 402", async () => {
    const activity: Activity[] = [];
    const app = buildApp({ mutualFollows: [[11, 22]], recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { throw new DirectMessageFollowRequiredError(); } });
    expectFollowRule(await request(app).post("/api/dms/threads/22").set("Idempotency-Key","dm-test-key-00000001").set("x-test-user", "11").send({ body: "Hi" }));
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: 11, action: "dm.sent", outcome: "denied", metadata: { reason: "mutual_follow_required" } }));
  });

  it("requires sign-in for the inbox, thread, and send surfaces", async () => {
    const app = buildApp();
    expect((await request(app).get("/api/dms/threads")).status).toBe(401);
    expect((await request(app).get("/api/dms/threads/22")).status).toBe(401);
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
  // Bound to 127.0.0.1 rather than supertest's dual-stack wildcard, so other
  // loopback listeners on a busy machine can never answer these requests.
  const servers: Server[] = [];
  afterEach(async () => { await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))); });
  const served = (overrides: Parameters<typeof buildApp>[0] = {}) => new Promise<Server>(resolve => { const server = buildApp(overrides).listen(0, "127.0.0.1", () => resolve(server)); servers.push(server); });
  const send = (app: Server, from: number, to: number, n = 1) => request(app).post(`/api/dms/threads/${to}`).set("Idempotency-Key", key(n)).set("x-test-user", String(from)).send({ body: "Hello" });

  it("rejects a seeker writing to a referrer before acceptance with 403, even with a paid plan and a mutual follow", async () => {
    const activity: Activity[] = [];
    let sends = 0;
    const app = await served({ verifiedReferrers: [REFERRER], paidPlanUsers: [SEEKER], mutualFollows: [[SEEKER, REFERRER]], recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    const response = await send(app, SEEKER, REFERRER);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request.", senderRole: "member" });
    expect(response.body.upgrade).toBeUndefined();
    expect(sends).toBe(0);
    expect(activity).toContainEqual(expect.objectContaining({ actorUserId: SEEKER, action: "dm.sent", outcome: "denied", metadata: { reason: "referrer_acceptance_required" } }));
  });

  it("rejects a referrer writing to a seeker before acceptance", async () => {
    const response = await send(await served({ verifiedReferrers: [REFERRER], paidPlanUsers: [REFERRER] }), REFERRER, SEEKER);
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ reason: "referrer_acceptance_required", error: "You can message this member after you accept their referral request.", senderRole: "referrer" });
  });

  it("blocks both sides of a thread that started before acceptance", async () => {
    const app = await served({ verifiedReferrers: [REFERRER], existingThreads: [[SEEKER, REFERRER]], listDmThread: async (userId, counterpartUserId) => ({ counterpartUserId, counterpartLabel: "Referrer · acme.com", messages: [{ id: 1, body: "Hi", createdAt: new Date("2026-09-08T03:00:00Z"), isMine: userId === SEEKER }] }) });
    expect((await send(app, SEEKER, REFERRER)).status).toBe(403);
    expect((await send(app, REFERRER, SEEKER, 2)).status).toBe(403);
    const opened = await request(app).get(`/api/dms/threads/${REFERRER}`).set("x-test-user", String(SEEKER));
    expect(opened.status).toBe(200);
    expect(opened.body.thread.messages).toHaveLength(1);
    expect(opened.body.sendBlock).toEqual({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request.", senderRole: "member" });
  });

  it("opens both directions once the referrer accepted, with no plan, follow or thread", async () => {
    const app = await served({ verifiedReferrers: [REFERRER], acceptedPairs: [[SEEKER, REFERRER]] });
    expect((await send(app, SEEKER, REFERRER)).status).toBe(201);
    expect((await send(app, REFERRER, SEEKER, 2)).status).toBe(201);
  });

  it("explains the rule, not an upgrade, in an open thread's sendBlock, and clears it once accepted", async () => {
    const listDmThread: DmRouteDeps["listDmThread"] = async (_userId, counterpartUserId) => ({ counterpartUserId, counterpartLabel: "Referrer · acme.com", messages: [] });
    const before = await request(await served({ verifiedReferrers: [REFERRER], listDmThread })).get(`/api/dms/threads/${REFERRER}`).set("x-test-user", String(SEEKER));
    expect(before.body.sendBlock).toEqual({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request.", senderRole: "member" });
    expect(before.body.upgrade).toBeUndefined();
    const after = await request(await served({ verifiedReferrers: [REFERRER], acceptedPairs: [[SEEKER, REFERRER]], listDmThread })).get(`/api/dms/threads/${REFERRER}`).set("x-test-user", String(SEEKER));
    expect(after.body.sendBlock).toBeNull();
  });

  it("invariant: a seeker's plan, follows or thread never change a referrer pair's outcome", async () => {
    for (const accepted of [false, true]) for (const seekerPaid of [false, true]) for (const referrerPaid of [false, true]) for (const mutual of [false, true]) for (const thread of [false, true]) {
      const app = await served({ verifiedReferrers: [REFERRER], acceptedPairs: accepted ? [[SEEKER, REFERRER]] : [], paidPlanUsers: [...(seekerPaid ? [SEEKER] : []), ...(referrerPaid ? [REFERRER] : [])], mutualFollows: mutual ? [[SEEKER, REFERRER]] : [], existingThreads: thread ? [[SEEKER, REFERRER]] : [], listDmThread: async (_userId, counterpartUserId) => (thread ? { counterpartUserId, counterpartLabel: "Referrer · acme.com", messages: [] } : undefined) });
      const expected = accepted ? 201 : 403;
      expect((await send(app, SEEKER, REFERRER)).status, JSON.stringify({ accepted, seekerPaid, referrerPaid, mutual, thread })).toBe(expected);
      expect((await send(app, REFERRER, SEEKER, 2)).status).toBe(expected);
      if (thread) expect((await request(app).get(`/api/dms/threads/${REFERRER}`).set("x-test-user", String(SEEKER))).body.sendBlock === null).toBe(accepted);
    }
  });

  it("keeps the member rules for two members who are not verified referrers: a thread or a mutual follow, never a plan", async () => {
    expectFollowRule(await send(await served({ verifiedReferrers: [REFERRER], paidPlanUsers: [SEEKER] }), SEEKER, MEMBER));
    const following = await served({ verifiedReferrers: [REFERRER], mutualFollows: [[SEEKER, MEMBER]] });
    expect((await send(following, SEEKER, MEMBER)).status).toBe(201);
    const thread = await served({ verifiedReferrers: [REFERRER], existingThreads: [[SEEKER, MEMBER]] });
    expect((await send(thread, MEMBER, SEEKER)).status).toBe(201);
    expectFollowRule(await send(await served({ verifiedReferrers: [REFERRER] }), SEEKER, MEMBER));
  });

  it("fails closed when the gate cannot be read, and a missing thread stays a 404 without reading it", async () => {
    let reads = 0, sends = 0;
    const app = await served({ referrerDmGate: async () => { reads += 1; throw new Error("Database unavailable"); }, paidPlanUsers: [SEEKER], sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    expect((await request(app).get(`/api/dms/threads/${REFERRER}`).set("x-test-user", String(SEEKER))).status).toBe(404);
    expect(reads).toBe(0);
    expect((await send(app, SEEKER, REFERRER)).status).toBe(500);
    expect(sends).toBe(0);
  });

  it("maps a gate refusal raised inside the send transaction to the same 403 and denied row", async () => {
    const activity: Activity[] = [];
    const { DirectMessageReferrerGateError } = await import("./dmReferrerGate");
    const app = await served({ verifiedReferrers: [REFERRER], acceptedPairs: [[SEEKER, REFERRER]], recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { throw new DirectMessageReferrerGateError({ reason: "referrer_acceptance_required", error: "Messages with a referrer open after they accept your request.", senderRole: "member" }); } });
    const response = await send(app, SEEKER, REFERRER);
    expect(response.status).toBe(403);
    expect(response.body.reason).toBe("referrer_acceptance_required");
    expect(activity).toContainEqual(expect.objectContaining({ outcome: "denied", metadata: { reason: "referrer_acceptance_required" } }));
  });
});

describe("hourly limit on refused sends (D-012 item 3 review: no referrer oracle)", () => {
  const SEEKER = 11, REFERRER = 22, MEMBER = 33;
  const send = (app: ReturnType<typeof buildApp>, from: number, to: number, n: number) => request(app).post(`/api/dms/threads/${to}`).set("Idempotency-Key", `dm-refusal-key-${String(n).padStart(8, "0")}`).set("x-test-user", String(from)).send({ body: "Hello" });

  it("tells referrer and member refusals apart below the limit", async () => {
    const app = buildApp({ verifiedReferrers: [REFERRER], recentRefusalCount: 9 });
    const toReferrer = await send(app, SEEKER, REFERRER, 1);
    const toMember = await send(app, SEEKER, MEMBER, 2);
    expect(toReferrer.status).toBe(403);
    expect(toReferrer.body.reason).toBe("referrer_acceptance_required");
    expectFollowRule(toMember);
  });

  it("answers every refusal with the same 429 once the sender reached the limit, whoever the recipient is", async () => {
    const activity: Activity[] = [];
    let sends = 0;
    const app = buildApp({ verifiedReferrers: [REFERRER], recentRefusalCount: 10, recordActivity: async input => { activity.push(input); }, sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    const toReferrer = await send(app, SEEKER, REFERRER, 1);
    const toMember = await send(app, SEEKER, MEMBER, 2);
    for (const response of [toReferrer, toMember]) {
      expect(response.status).toBe(429);
      expect(Object.keys(response.body).sort()).toEqual(["error", "retryAt"]);
      expect(response.body.error).toBe("Too many of your messages could not be sent in the last hour.");
      expect(Number(response.headers["retry-after"])).toBe(3600);
    }
    expect(sends).toBe(0);
    expect(activity.filter(entry => entry.outcome === "denied").map(entry => entry.metadata)).toEqual([{ reason: "refusal_limited" }, { reason: "refusal_limited" }]);
  });

  it("never limits a send that goes through, and reads the refusal count only to refuse", async () => {
    let countReads = 0;
    const app = buildApp({ verifiedReferrers: [REFERRER], mutualFollows: [[SEEKER, MEMBER]], acceptedPairs: [[SEEKER, REFERRER]], countRecentDmRefusals: async () => { countReads += 1; return 50; } });
    expect((await send(app, SEEKER, MEMBER, 1)).status).toBe(201);
    expect((await send(app, SEEKER, REFERRER, 2)).status).toBe(201);
    expect(countReads).toBe(0);
  });

  it("fails closed when the refusal count cannot be read: no distinct refusal and nothing sent", async () => {
    let sends = 0;
    const app = buildApp({ verifiedReferrers: [REFERRER], countRecentDmRefusals: async () => { throw new Error("Database unavailable"); }, sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; } });
    expect((await send(app, SEEKER, REFERRER, 1)).status).toBe(500);
    expect((await send(app, SEEKER, MEMBER, 2)).status).toBe(500);
    expect(sends).toBe(0);
  });
});

describe("reviewer isolation (REVIEWER-ISOLATION-1)", () => {
  it("refuses a demo review account starting a thread: 403, nothing sent", async () => {
    let sends = 0;
    const app = buildApp({
      resolveIdentity: async () => ({ account: { id: 99, openId: "reviewer_seeker" } }),
      sendDirectMessage: async () => { sends += 1; return { id: 1, replayed: false as const }; },
    });
    const response = await request(app).post("/api/dms/threads/22").set("Idempotency-Key", "dm-test-key-00000002").send({ body: "Hello" });
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/demo review accounts/i);
    expect(sends).toBe(0);
  });
});
