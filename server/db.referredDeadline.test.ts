import request from "supertest";
import type express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { referralDocumentAccessGrants, referralRequestPasses, referralTransitionEvents } from "../drizzle/schema";
import { REFERRAL_TIMERS_SINCE } from "../shared/referral";
import { ReferralTransitionConflict, extendReferredDeadlineTx, lapseReferredTx } from "./db";
import { DAY_MS, REFERRER, REQUEST_ID, RESUME_ID, documentAccessApp, resetStore, store, type RecordedActivity } from "./documentAccess.testkit";

/*
 * D-038-B review: the two rules the packet states but the code did not hold.
 *
 * 1. "Need 3 more days" is available "while the ask is `approved` and **before
 *    the deadline**" (§4.3). The code checked only the status, so a referrer
 *    could press it after the deadline and keep the seeker's name and resume
 *    for three more days — a privacy and money leak, not a UX nicety.
 * 2. A missed deadline must close that referrer's access (§4.5, D-019(e)).
 *    The transaction revokes the grant; this pins the route-level effect.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const HOUR = 60 * 60 * 1000;
/** An acceptance an hour after the cut-off: its 5-day deadline is SINCE + 5 days + 1 h. */
const ACCEPTED_AT = REFERRAL_TIMERS_SINCE + HOUR;
const DUE_AT = ACCEPTED_AT + 5 * DAY_MS;

const acceptedAsk = (over: { referrerId?: number | null; status?: string } = {}) => ({
  ask: { status: over.status ?? "approved", referrerId: over.referrerId ?? REFERRER },
  acceptance: { by: REFERRER, at: new Date(ACCEPTED_AT) },
  grants: [{ id: 9, referralRequestId: REQUEST_ID, referrerId: REFERRER, requestRevision: 3, grantVersion: 1, grantedAt: new Date(ACCEPTED_AT), expiresAt: new Date(ACCEPTED_AT + 7 * DAY_MS), revokedAt: null, revokeReason: null }],
});

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  resetStore(acceptedAsk());
});
afterEach(() => { vi.unstubAllEnvs(); });

const getDocument = (server: express.Express, user: number) => request(server).get(`/api/documents/${RESUME_ID}`).set("x-test-user", String(user));
const getDetail = (server: express.Express, user: number) => request(server).get(`/api/company-referrals/${REQUEST_ID}`).set("x-test-user", String(user));
const events = () => store.rows(referralTransitionEvents);

describe("D-038-B: the extension is only available before the deadline", () => {
  it("refuses a 3-day extension once the deadline has passed", async () => {
    await expect(extendReferredDeadlineTx(store.db as never, REQUEST_ID, DUE_AT + 1)).rejects.toThrow(ReferralTransitionConflict);
    expect(events().some(event => event.action === "referred_extension")).toBe(false);
  });

  it("control: the same press one day earlier extends the deadline to day 8", async () => {
    await expect(extendReferredDeadlineTx(store.db as never, REQUEST_ID, DUE_AT - DAY_MS)).resolves.toEqual({ extended: true });
    expect(events().filter(event => event.action === "referred_extension")).toHaveLength(1);
  });

  it("a second press is a replay, never an error, even after the first deadline", async () => {
    await extendReferredDeadlineTx(store.db as never, REQUEST_ID, DUE_AT - DAY_MS);
    await expect(extendReferredDeadlineTx(store.db as never, REQUEST_ID, DUE_AT + 1)).resolves.toEqual({ extended: false, replayed: true });
  });
});

describe("D-038-B: a missed deadline closes that referrer's access", () => {
  it("revokes the grant and takes the seeker's name and resume away at the routes", async () => {
    const activity: RecordedActivity[] = [];
    const server = documentAccessApp(activity);

    // While accepted, the referrer sees the resume and the name.
    expect((await getDocument(server, REFERRER)).status).not.toBe(404);
    expect((await getDetail(server, REFERRER)).body.request).toMatchObject({ status: "approved", candidateName: "Avery Example" });

    await expect(lapseReferredTx(store.db as never, REQUEST_ID, DUE_AT + 1)).resolves.toEqual({ lapsed: true, reason: "lapsed_referred" });

    expect(store.rows(referralDocumentAccessGrants).map(grant => [grant.revokedAt !== null, grant.revokeReason])).toEqual([[true, "referred_lapse"]]);
    expect(store.rows(referralRequestPasses).map(row => row.reasonCode)).toEqual(["lapsed_referred"]);

    // Both routes now answer as if the ask were never theirs: no file, no thread, no name.
    expect((await getDocument(server, REFERRER)).status).toBe(404);
    expect((await getDetail(server, REFERRER)).status).toBe(404);
  });

  it("stepping back closes the same access, with its own reason", async () => {
    const { stepBackFromReferral } = await import("./db");
    const server = documentAccessApp([]);
    await expect(stepBackFromReferral(store.db as never, REQUEST_ID, ACCEPTED_AT + DAY_MS)).resolves.toEqual({ lapsed: true, reason: "stepped_back" });
    expect(store.rows(referralDocumentAccessGrants).map(grant => grant.revokeReason)).toEqual(["step_back"]);
    expect((await getDocument(server, REFERRER)).status).toBe(404);
  });
});
