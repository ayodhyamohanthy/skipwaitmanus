import express from "express";
import request, { type Response } from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ASK_NOTE_CONFLICT_ERROR, ASK_NOTE_MAX_LENGTH, ASK_NOTE_NOT_TEXT_ERROR, NO_PERSONAL_NOTE_TEXT } from "../shared/askNote";
import { ReferralIdempotencyConflictError } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * D-019 seeker basics: the note a seeker sends with an ask comes back to them
 * on GET /api/company-referrals/mine. The store below keeps what the route
 * hands to createCompanyReferralRequest and lists it the way
 * db.listJobSeekerCompanyReferrals does (note as `pitch`, own rows only);
 * askNoteProjection.test.ts pins that real projection and the write.
 */

type StoredAsk = { id: number; userId: number; idempotencyKey: string; personalPitch: string; targetRoleUrl: string };
type RouteDeps = Pick<PrivateReferralRouteDeps, "resolveIdentity" | "createCompanyReferralRequest" | "listJobSeekerCompanyReferrals" | "getBlockedReferralRequestIds" | "resolveCompanyIdentities">;
type RequiredDepName = { [K in keyof PrivateReferralRouteDeps]-?: undefined extends PrivateReferralRouteDeps[K] ? never : K }[keyof PrivateReferralRouteDeps];

// Response bodies are parsed, not trusted: the shapes these tests read.
const mineResponseSchema = z.object({ requests: z.array(z.object({ id: z.number(), pitch: z.string() })) });
const createdResponseSchema = z.object({ requestId: z.number() });
const errorResponseSchema = z.object({ error: z.string() });
const requestIdOf = (response: Response) => createdResponseSchema.parse(response.body).requestId;
const errorOf = (response: Response) => errorResponseSchema.parse(response.body).error;

const SEEKER = 7;
const OTHER_SEEKER = 8;
const ROLE_URL = "https://careers.acme.com/jobs/design-1";
const NOTE = "I led the redesign of an approvals product used by 3,000 people and would value an honest fit check.";

// The route catches errors as a generic 500, so a reached stub is also recorded and checked after each test.
let unusedDepsReached: RequiredDepName[] = [];
beforeEach(() => { unusedDepsReached = []; });
afterEach(() => { expect(unusedDepsReached).toEqual([]); });

const unusedDep = (name: RequiredDepName) => (): never => {
  unusedDepsReached.push(name);
  throw new Error(`askNoteRoundTrip: the route reached ${name}, which this test does not provide`);
};

/** Full route deps: the ones under test, every other required dep a stub that fails loudly. Optional deps stay absent. */
function routeDeps(used: RouteDeps): PrivateReferralRouteDeps {
  return {
    dataUrlToBuffer: unusedDep("dataUrlToBuffer"), sanitizeDocumentName: unusedDep("sanitizeDocumentName"), storagePut: unusedDep("storagePut"),
    storageGetSignedUrl: unusedDep("storageGetSignedUrl"), createReferralAttachment: unusedDep("createReferralAttachment"),
    getAccessibleReferralAttachment: unusedDep("getAccessibleReferralAttachment"), saveVerifiedWorkEmail: unusedDep("saveVerifiedWorkEmail"),
    listCompanyReferralInbox: unusedDep("listCompanyReferralInbox"), claimCompanyReferralRequest: unusedDep("claimCompanyReferralRequest"),
    getClaimedCompanyReferralDetail: unusedDep("getClaimedCompanyReferralDetail"), listPublicCompanyOpportunities: unusedDep("listPublicCompanyOpportunities"),
    publishCompanyOpportunity: unusedDep("publishCompanyOpportunity"),
    ...used,
  };
}

function setup() {
  const asks: StoredAsk[] = [];
  const createCompanyReferralRequest = vi.fn<PrivateReferralRouteDeps["createCompanyReferralRequest"]>(async (userId, input) => {
    const prior = asks.find(ask => ask.userId === userId && ask.idempotencyKey === input.idempotencyKey);
    if (prior) {
      if (prior.personalPitch !== input.personalPitch) throw new ReferralIdempotencyConflictError();
      return { requestId: prior.id, companyDomain: "acme.com", notifiedEmployees: 0, replayed: true };
    }
    const ask = { id: 500 + asks.length + 1, userId, idempotencyKey: input.idempotencyKey, personalPitch: input.personalPitch, targetRoleUrl: input.targetRoleUrl };
    asks.push(ask);
    return { requestId: ask.id, companyDomain: "acme.com", notifiedEmployees: 1, replayed: false };
  });
  const listJobSeekerCompanyReferrals = async (userId: number) => asks.filter(ask => ask.userId === userId).map(ask => ({
    id: ask.id, title: "Role from shared job link", pitch: ask.personalPitch, targetRoleUrl: ask.targetRoleUrl, companyDomain: "acme.com", jobFunction: null, compensation: null,
    status: "pending", referrerId: null, waitingForCoverage: false, referrerMessage: null, createdAt: new Date(), updatedAt: new Date(), attachmentCount: 1, queueStatus: null, unreadMessageCount: 0,
  }));
  const deps: RouteDeps = {
    resolveIdentity: async req => { const user = Number(req.header("x-test-user")); return user ? { account: { id: user, openId: `workos-${user}` } } : undefined; },
    createCompanyReferralRequest, listJobSeekerCompanyReferrals,
    getBlockedReferralRequestIds: async () => new Set<number>(),
    resolveCompanyIdentities: async () => new Map(),
  };
  const app = express(); app.use(express.json());
  registerPrivateReferralRoutes(app, routeDeps(deps));
  let keyCounter = 0;
  const send = (body: object, options: { user?: number; key?: string } = {}) => request(app).post("/api/company-referrals")
    .set("x-test-user", String(options.user ?? SEEKER))
    .set("Idempotency-Key", options.key ?? `ask-note-key-${String(++keyCounter).padStart(8, "0")}`)
    .send({ expectedCost: 1, targetRoleUrl: ROLE_URL, attachmentIds: [77], ...body });
  const mine = async (user = SEEKER) => {
    const response = await request(app).get("/api/company-referrals/mine").set("x-test-user", String(user));
    expect(response.status).toBe(200);
    return mineResponseSchema.parse(response.body).requests;
  };
  return { send, mine, createCompanyReferralRequest, asks };
}

describe("seeker note round trip (POST /api/company-referrals -> GET /mine)", () => {
  it("shows the seeker the note the app sends as candidateMessage", async () => {
    const { send, mine } = setup();
    const created = await send({ candidateMessage: `  ${NOTE}  ` });
    expect(created.status).toBe(201);
    expect(await mine()).toEqual([{ id: requestIdOf(created), pitch: NOTE }]);
  });

  it("keeps a note sent as personalPitch instead of storing the placeholder", async () => {
    const { send, mine } = setup();
    const created = await send({ personalPitch: NOTE });
    expect(created.status).toBe(201);
    const [row] = await mine();
    expect(row.pitch).toBe(NOTE);
    expect(row.pitch).not.toBe(NO_PERSONAL_NOTE_TEXT);
  });

  it.each([["no note", {}], ["an empty note", { candidateMessage: "" }], ["a blank note", { candidateMessage: "   \n " }], ["a null note", { candidateMessage: null, personalPitch: null }]])("shows the placeholder when the ask has %s", async (_label, body) => {
    const { send, mine } = setup();
    expect((await send(body)).status).toBe(201);
    expect((await mine())[0].pitch).toBe(NO_PERSONAL_NOTE_TEXT);
  });

  it("accepts the same note in both fields", async () => {
    const { send, mine } = setup();
    expect((await send({ candidateMessage: NOTE, personalPitch: ` ${NOTE}` })).status).toBe(201);
    expect((await mine())[0].pitch).toBe(NOTE);
  });

  it("refuses two different notes before any request or credit is created", async () => {
    const { send, mine, createCompanyReferralRequest } = setup();
    const response = await send({ candidateMessage: NOTE, personalPitch: "A different note." });
    expect(response.status).toBe(400);
    expect(errorOf(response)).toBe(ASK_NOTE_CONFLICT_ERROR);
    expect(createCompanyReferralRequest).not.toHaveBeenCalled();
    expect(await mine()).toEqual([]);
  });

  it.each([["a number", { candidateMessage: 42 }], ["an object", { personalPitch: { text: NOTE } }], ["a list", { candidateMessage: [NOTE] }]])("refuses a note that is %s instead of silently dropping it", async (_label, body) => {
    const { send, createCompanyReferralRequest } = setup();
    const response = await send(body);
    expect(response.status).toBe(400);
    expect(errorOf(response)).toBe(ASK_NOTE_NOT_TEXT_ERROR);
    expect(createCompanyReferralRequest).not.toHaveBeenCalled();
  });

  it("stores at most the note limit", async () => {
    const { send, mine } = setup();
    expect((await send({ candidateMessage: "a".repeat(ASK_NOTE_MAX_LENGTH + 50) })).status).toBe(201);
    expect((await mine())[0].pitch).toHaveLength(ASK_NOTE_MAX_LENGTH);
  });

  it("replays a retried send with the same note without a second request", async () => {
    const { send, mine, asks } = setup();
    const first = await send({ personalPitch: NOTE }, { key: "ask-note-retry-key-0001" });
    const retry = await send({ personalPitch: NOTE }, { key: "ask-note-retry-key-0001" });
    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(requestIdOf(retry)).toBe(requestIdOf(first));
    expect(asks).toHaveLength(1);
    expect((await mine())[0].pitch).toBe(NOTE);
  });

  it("shows the note only on the sender's own list and requires sign-in", async () => {
    const { send, mine } = setup();
    expect((await send({ candidateMessage: NOTE })).status).toBe(201);
    expect(await mine(OTHER_SEEKER)).toEqual([]);
    const { send: sendSignedOut } = setup();
    const signedOut = await sendSignedOut({ candidateMessage: NOTE }, { user: 0 });
    expect(signedOut.status).toBe(401);
  });
});
