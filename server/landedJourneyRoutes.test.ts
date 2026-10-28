import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { THANK_YOU_MAX_LENGTH } from "@shared/landedJourney";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";

const sentryMocks = vi.hoisted(() => ({ captureServerError: vi.fn() }));
vi.mock("./sentry", async importOriginal => ({
  ...(await importOriginal<typeof import("./sentry")>()),
  captureServerError: sentryMocks.captureServerError,
}));

/*
 * Kit landed journey routes (queue row 20 slices C+D). The HTTP contract is what the
 * /landed page and the referrer home page render from, so it is pinned here: a note
 * that did not reach the referrer answers 200 with delivered false (the page offers a
 * retry instead of claiming "thanks sent"), and a private note never appears for an
 * unverified or blocked account.
 */

type Recorded = { action: string; outcome?: string; resourceType?: string; resourceId?: number; metadata?: Record<string, unknown> };

function setup(overrides: Record<string, unknown> = {}, blocked = new Set<number>()) {
  const activity: Recorded[] = [];
  const recordLandedJourney = vi.fn(async (_userId: number, input: { message?: string; shareOnWall?: boolean; payForward?: string; referralRequestId: number }) => ({
    referralRequestId: input.referralRequestId,
    thankYouMessage: input.message ?? null,
    shareOnWall: input.shareOnWall ?? false,
    payForward: input.payForward ?? null,
    delivered: input.message !== undefined,
  }));
  const listReferrerThankYous = vi.fn(async () => ({ thankYous: [{ id: 9, message: "You opened the door.", seekerName: "Kavya Menon", roleTitle: "Data Analyst", createdAt: "2026-10-17T09:00:00.000Z" }], total: 2 }));
  const app = express();
  app.use(express.json());
  registerPrivateReferralRoutes(app, {
    resolveIdentity: async req => req.header("x-test-user") ? { account: { id: 7, openId: "workos-test" } } : undefined,
    getVerifiedWorkEmailAccess: async () => ({ workEmailDomain: "acme.com" }),
    resolveCompanyIdentities: async () => new Map(),
    getBlockedReferralRequestIds: async (_userId: number, ids: number[]) => new Set(ids.filter(id => blocked.has(id))),
    recordActivity: async (entry: Recorded) => { activity.push(entry); },
    recordLandedJourney,
    listReferrerThankYous,
    ...overrides,
  } as unknown as PrivateReferralRouteDeps);
  return { app, activity, recordLandedJourney, listReferrerThankYous };
}

const post = (app: express.Express, body: unknown) => request(app).post("/api/landed/journey").set("x-test-user", "seeker").send(body);
const wall = (app: express.Express) => request(app).get("/api/referrer/thank-yous").set("x-test-user", "employee");

describe("POST /api/landed/journey", () => {
  it("signs the seeker in before anything is recorded", async () => {
    const { app, recordLandedJourney } = setup();
    const res = await request(app).post("/api/landed/journey").send({ referralRequestId: 501, message: "Thank you." });
    expect(res.status).toBe(401);
    expect(recordLandedJourney).not.toHaveBeenCalled();
  });

  it("refuses a submit that records nothing", async () => {
    const { app } = setup();
    const res = await post(app, { referralRequestId: 501 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/thank-you or a pay-it-forward/i);
  });

  it("refuses a message the kit textarea cannot hold", async () => {
    const { app, recordLandedJourney } = setup();
    const res = await post(app, { referralRequestId: 501, message: "a".repeat(THANK_YOU_MAX_LENGTH + 1) });
    expect(res.status).toBe(400);
    expect(recordLandedJourney).not.toHaveBeenCalled();
  });

  it("refuses a request id that is not a real ask", async () => {
    const { app } = setup();
    expect((await post(app, { referralRequestId: 0, message: "Thank you." })).status).toBe(400);
    expect((await post(app, { referralRequestId: "501", message: "Thank you." })).status).toBe(400);
  });

  it("returns the saved state and records the thank-you", async () => {
    const { app, activity, recordLandedJourney } = setup();
    const res = await post(app, { referralRequestId: 501, message: "I start on the 3rd, thanks to you.", shareOnWall: true, payForward: "yes" });
    expect(res.status).toBe(200);
    expect(res.body.state).toEqual({ referralRequestId: 501, thankYouMessage: "I start on the 3rd, thanks to you.", shareOnWall: true, payForward: "yes", delivered: true });
    expect(recordLandedJourney).toHaveBeenCalledWith(7, { referralRequestId: 501, message: "I start on the 3rd, thanks to you.", shareOnWall: true, payForward: "yes" });
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.thanks_recorded", outcome: "success", resourceType: "landed_journey", resourceId: 501, metadata: { delivered: true, shareOnWall: true, messageLength: 34 } }));
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.pay_forward_chosen", metadata: { choice: "yes" } }));
  });

  it("answers 200 with delivered false when the note did not reach the conversation", async () => {
    const { app, activity } = setup({ recordLandedJourney: async () => ({ referralRequestId: 501, thankYouMessage: "Saved, not sent.", shareOnWall: false, payForward: null, delivered: false }) });
    const res = await post(app, { referralRequestId: 501, message: "Saved, not sent." });
    expect(res.status).toBe(200);
    expect(res.body.state.delivered).toBe(false);
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.thanks_recorded", outcome: "success", metadata: expect.objectContaining({ delivered: false }) }));
  });

  it("keeps a blocked thread out of the journey without recording anything", async () => {
    const { app, activity, recordLandedJourney } = setup({}, new Set([501]));
    const res = await post(app, { referralRequestId: 501, message: "Thank you." });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("This private request is not available");
    expect(recordLandedJourney).not.toHaveBeenCalled();
    expect(activity.filter(entry => entry.action.startsWith("landed."))).toEqual([]);
  });

  it.each([
    ["This thank-you is not available to you", 404],
    ["A thank-you opens once your referrer marks the ask as hired", 409],
    ["Database unavailable", 503],
  ])("maps %s to HTTP %s", async (message, status) => {
    const { app, activity } = setup({ recordLandedJourney: async () => { throw new Error(message); } });
    const res = await post(app, { referralRequestId: 501, message: "Thank you." });
    expect(res.status).toBe(status);
    expect(res.body.error).toBe(message);
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.thanks_recorded", outcome: "denied" }));
  });

  it("captures unexpected internal errors in sentry and returns generic 500 without leaking details", async () => {
    const { app, activity } = setup({
      recordLandedJourney: async () => { throw new Error("ER_DUP_ENTRY: internal database error"); },
    });
    const res = await post(app, { referralRequestId: 501, message: "Thank you." });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("We could not send your thank-you");
    expect(res.body.error).not.toMatch(/ER_DUP_ENTRY/);
    expect(sentryMocks.captureServerError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining("ER_DUP_ENTRY") }),
      expect.objectContaining({ route: "POST /api/landed/journey" })
    );
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.thanks_recorded", outcome: "failure" }));
  });

  it("says the thank-you is unavailable rather than inventing a state", async () => {
    const { app } = setup({ recordLandedJourney: undefined });
    const res = await post(app, { referralRequestId: 501, message: "Thank you." });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not available yet/i);
  });
});

describe("GET /api/referrer/thank-yous", () => {
  it("signs the referrer in before reading anyone's notes", async () => {
    const { app, listReferrerThankYous } = setup();
    expect((await request(app).get("/api/referrer/thank-yous")).status).toBe(401);
    expect(listReferrerThankYous).not.toHaveBeenCalled();
  });

  it("gives an unverified account nothing to read", async () => {
    const { app, activity, listReferrerThankYous } = setup({ getVerifiedWorkEmailAccess: async () => null });
    const res = await wall(app);
    expect(res.status).toBe(403);
    expect(res.body.thankYous).toBeUndefined();
    expect(listReferrerThankYous).not.toHaveBeenCalled();
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.wall_viewed", outcome: "denied", resourceType: "thank_you_wall" }));
  });

  it("returns the private wall as a no-store response", async () => {
    const { app, activity } = setup();
    const res = await wall(app);
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body).toEqual({ thankYous: [{ id: 9, message: "You opened the door.", seekerName: "Kavya Menon", roleTitle: "Data Analyst", createdAt: "2026-10-17T09:00:00.000Z" }], total: 2 });
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.wall_viewed", outcome: "success", metadata: { noteCount: 1, total: 2 } }));
  });

  it("fails visibly instead of answering with an empty wall, captures in sentry, and records failed activity", async () => {
    const { app, activity } = setup({ listReferrerThankYous: async () => { throw new Error("boom"); } });
    const res = await wall(app);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/could not load your thank-yous/i);
    expect(sentryMocks.captureServerError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "boom" }),
      expect.objectContaining({ route: "GET /api/referrer/thank-yous" })
    );
    expect(activity).toContainEqual(expect.objectContaining({ action: "landed.wall_viewed", outcome: "failure", resourceType: "thank_you_wall" }));
  });
});
