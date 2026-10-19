import request from "supertest";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralRequests } from "../drizzle/schema";
import { COLLEAGUE, OUTSIDER, REFERRER, REQUEST_ID, SEEKER, resetStore, store } from "./documentAccess.testkit";
import { confirmReferredBySeekerForUser, extendReferredDeadlineForUser, stepBackFromReferralForUser } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

/*
 * D-038-B referral actions through the real routes and the real store. The
 * shipped wiring passed the signed-in user's id where the timer-facing Tx
 * functions take the ledger transaction, so every call 409'd with
 * "tx.select is not a function" (QA, Oct 20). These tests drive the production
 * wrappers (stepBackFromReferralForUser & co.), which open the transaction and
 * prove ownership before delegating; a wiring regression fails here, and so
 * does a stranger acting on someone else's ask.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

type RequiredDepName = { [K in keyof PrivateReferralRouteDeps]-?: undefined extends PrivateReferralRouteDeps[K] ? never : K }[keyof PrivateReferralRouteDeps];
const unusedDep = (name: RequiredDepName) => (): never => { throw new Error(`referral action routes test: the route reached ${name}, which this test does not provide`); };

const actionApp = () => {
  const server = express();
  server.use(express.json());
  const people = new Set([SEEKER, REFERRER, COLLEAGUE, OUTSIDER]);
  registerPrivateReferralRoutes(server, {
    dataUrlToBuffer: unusedDep("dataUrlToBuffer"), sanitizeDocumentName: unusedDep("sanitizeDocumentName"), storagePut: unusedDep("storagePut"),
    createReferralAttachment: unusedDep("createReferralAttachment"), saveVerifiedWorkEmail: unusedDep("saveVerifiedWorkEmail"),
    createCompanyReferralRequest: unusedDep("createCompanyReferralRequest"), listCompanyReferralInbox: unusedDep("listCompanyReferralInbox"),
    listPublicCompanyOpportunities: unusedDep("listPublicCompanyOpportunities"), publishCompanyOpportunity: unusedDep("publishCompanyOpportunity"),
    resolveIdentity: async req => { const id = Number(req.header("x-test-user")); return people.has(id) ? { account: { id, openId: `user-${id}` } } : undefined; },
    getBlockedReferralRequestIds: async () => new Set<number>(),
    resolveCompanyIdentities: async () => new Map(),
    recordActivity: async () => undefined,
    storageGetSignedUrl: async key => `https://signed.example/${key}`,
    getAccessibleReferralAttachment: unusedDep("getAccessibleReferralAttachment"), claimCompanyReferralRequest: unusedDep("claimCompanyReferralRequest"),
    getClaimedCompanyReferralDetail: unusedDep("getClaimedCompanyReferralDetail"), oneClickReviewReferralRequest: unusedDep("oneClickReviewReferralRequest"),
    reviewReferralRequest: unusedDep("reviewReferralRequest"), lapseReferredTx: unusedDep("lapseReferredTx"),
    // The production wiring (server/_core/index.ts): the user-facing wrappers, never the raw Tx functions.
    extendReferredDeadlineTx: extendReferredDeadlineForUser, stepBackFromReferral: stepBackFromReferralForUser, confirmReferredBySeeker: confirmReferredBySeekerForUser,
  });
  return server;
};

const post = (server: express.Express, action: string, user?: number) => {
  const call = request(server).post(`/api/company-referrals/${REQUEST_ID}/${action}`);
  return user === undefined ? call : call.set("x-test-user", String(user));
};
const acceptedSeed = () => resetStore({ ask: { status: "approved", referrerId: REFERRER, revision: 1 }, acceptance: { by: REFERRER, at: new Date() } });
const ask = () => store.rows(referralRequests).find(row => row.id === REQUEST_ID);

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("referral action routes (D-038-B)", () => {
  it("a signed-out caller gets 401 on all three actions", async () => {
    acceptedSeed();
    const server = actionApp();
    for (const action of ["step-back", "extend-referred-deadline", "confirm-referred"]) {
      const res = await post(server, action);
      expect(res.status).toBe(401);
    }
  });

  it("a stranger cannot step back someone else's accepted ask (404, state untouched)", async () => {
    acceptedSeed();
    const res = await post(actionApp(), "step-back", COLLEAGUE);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not in your account/);
    expect(ask()?.status).toBe("approved");
    expect(ask()?.referrerId).toBe(REFERRER);
  });

  it("the accepting referrer steps back: the ask reopens with no fault", async () => {
    acceptedSeed();
    const res = await post(actionApp(), "step-back", REFERRER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ steppedBack: true, reason: "stepped_back" });
    expect(ask()?.status).toBe("pending");
    expect(ask()?.referrerId).toBeNull();
  });

  it("the accepting referrer uses the one extension; a second is a replay", async () => {
    acceptedSeed();
    const server = actionApp();
    const first = await post(server, "extend-referred-deadline", REFERRER);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ extended: true, replayed: false });
    const second = await post(server, "extend-referred-deadline", REFERRER);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ extended: false, replayed: true });
  });

  it("a non-owner cannot extend the deadline", async () => {
    acceptedSeed();
    const res = await post(actionApp(), "extend-referred-deadline", OUTSIDER);
    expect(res.status).toBe(404);
  });

  it("the seeker confirms the referral; the ask stops the clock as intro_made", async () => {
    acceptedSeed();
    const res = await post(actionApp(), "confirm-referred", SEEKER);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ confirmed: true, replayed: false });
    expect(ask()?.status).toBe("intro_made");
  });

  it("the referrer cannot confirm on the seeker's behalf", async () => {
    acceptedSeed();
    const res = await post(actionApp(), "confirm-referred", REFERRER);
    expect(res.status).toBe(404);
    expect(ask()?.status).toBe("approved");
  });
});
