import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askInviteLinks, jobs, notifications, operationalActivityLogs, referralRequests } from "../drizzle/schema";
import { SCHEDULED_JOB_NAMES } from "../shared/scheduledJobs";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { ASK_INVITE_SWEEP_BATCH, createAskInviteSweep, type AskInviteSweepCandidate } from "./askInviteSweep";
import { SCHEDULED_JOBS } from "./scheduledJobRegistry";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const context = { nowMs: NOW, windowKey: "2026-10-23T12:00Z" };
const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const job = full(jobs, { id: 11, company: "acme.com", title: "Product Designer" });
const ask = (id: number, jobSeekerId: number, over: Row = {}): Row => full(referralRequests, { id, jobId: 11, jobSeekerId, status: "pending", referrerId: null, waitingForCoverage: true, coverageHeldAt: null, createdAt: new Date(NOW - 2 * DAY), updatedAt: new Date(NOW - 2 * DAY), ...over });
const invite = (id: number, requestId: number, seekerId: number, over: Row = {}): Row => full(askInviteLinks, { id, referralRequestId: requestId, createdByUserId: seekerId, linkTokenHash: `${id}`.padStart(64, "0"), status: "active", claimedByUserId: null, claimedAt: null, reservationExpiresAt: null, activeRequestKey: `link:${requestId}`, expiresAt: new Date(NOW + DAY), closedAt: null, createdAt: new Date(NOW - 7 * DAY), ...over });

function seed() {
  store.reset([
    [jobs, [job]],
    [referralRequests, [
      ask(501, 7),
      ask(502, 8),
      ask(503, 9, { status: "withdrawn", waitingForCoverage: false }),
      ask(504, 10, { waitingForCoverage: false, referrerId: 4 }),
      ask(505, 11, { waitingForCoverage: false, referrerId: 3 }),
    ]],
    [askInviteLinks, [
      invite(1, 501, 7, { expiresAt: new Date(NOW - 1) }),
      invite(2, 502, 8, { status: "claimed", claimedByUserId: 3, claimedAt: new Date(NOW - DAY), reservationExpiresAt: new Date(NOW - 1), activeRequestKey: null, expiresAt: new Date(NOW + DAY), createdAt: new Date(NOW - 6 * DAY) }),
      invite(3, 503, 9, { createdAt: new Date(NOW - 5 * DAY) }),
      invite(4, 504, 10, { status: "claimed", claimedByUserId: 3, claimedAt: new Date(NOW - DAY), reservationExpiresAt: new Date(NOW + DAY), activeRequestKey: null, createdAt: new Date(NOW - 4 * DAY) }),
      invite(5, 505, 11, { status: "claimed", claimedByUserId: 3, claimedAt: new Date(NOW - DAY), reservationExpiresAt: new Date(NOW + DAY), activeRequestKey: null, createdAt: new Date(NOW - 3 * DAY) }),
    ]],
    [notifications, []],
    [operationalActivityLogs, []],
  ]);
}

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-090 ask-invite expiry sweep", () => {
  it("uses one bounded batch, processes oldest-first, counts only real transitions, and continues after a failure", async () => {
    const candidates: AskInviteSweepCandidate[] = [
      { id: 3, referralRequestId: 103, createdAt: new Date(NOW - DAY) },
      { id: 1, referralRequestId: 101, createdAt: new Date(NOW - 3 * DAY) },
      { id: 2, referralRequestId: 102, createdAt: new Date(NOW - 2 * DAY) },
    ];
    const listDue = vi.fn(async () => candidates);
    const cause = new Error("one invite row failed");
    const expireOne = vi.fn(async (candidate: AskInviteSweepCandidate) => {
      if (candidate.id === 2) throw cause;
      return { changed: candidate.id === 1 };
    });

    const output = await createAskInviteSweep({ listDue, expireOne })(context);

    expect(ASK_INVITE_SWEEP_BATCH).toBe(200);
    expect(listDue).toHaveBeenCalledWith(NOW, 200);
    expect(expireOne.mock.calls.map(([candidate]) => candidate.id)).toEqual([1, 2, 3]);
    expect(output).toEqual({ processed: 1, failed: 1, firstError: cause });
  });

  it("expires TTLs and reservations, closes links for closed asks, notifies once, and leaves delivered links untouched", async () => {
    seed();
    const sweep = createAskInviteSweep();

    expect(await sweep(context)).toEqual({ processed: 4, failed: 0 });
    expect(store.rows(askInviteLinks)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, status: "expired", activeRequestKey: null, closedAt: new Date(NOW) }),
      expect.objectContaining({ id: 2, status: "expired", activeRequestKey: null, reservationExpiresAt: null, closedAt: new Date(NOW) }),
      expect.objectContaining({ id: 3, status: "expired", activeRequestKey: null, closedAt: new Date(NOW) }),
      expect.objectContaining({ id: 4, status: "expired", activeRequestKey: null, reservationExpiresAt: null, closedAt: new Date(NOW) }),
      expect.objectContaining({ id: 5, status: "claimed", claimedByUserId: 3, reservationExpiresAt: new Date(NOW + DAY), activeRequestKey: null }),
    ]));
    expect(store.rows(referralRequests).find(row => row.id === 502)).toMatchObject({ status: "pending", waitingForCoverage: true, referrerId: null });
    expect(store.rows(notifications).map(row => [row.userId, row.eventKey]).sort()).toEqual([
      [3, "ask-invite:2:reservation-expired:claimer"],
      [3, "ask-invite:4:ask-closed:claimer"],
      [7, "ask-invite:1:link-expired"],
      [8, "ask-invite:2:reservation-expired:seeker"],
    ].sort());
    const activity = store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired");
    expect(activity).toHaveLength(4);
    expect(JSON.stringify(activity)).not.toMatch(/@|Avery|Riya|[0-9a-f]{64}/i);

    expect(await sweep(context)).toEqual({ processed: 0, failed: 0 });
    expect(store.rows(notifications)).toHaveLength(4);
    expect(store.rows(operationalActivityLogs).filter(row => row.action === "ask_invite.expired")).toHaveLength(4);
    expect(store.rows(askInviteLinks).find(row => row.id === 5)).toMatchObject({ status: "claimed", reservationExpiresAt: new Date(NOW + DAY), activeRequestKey: null });
  });

  it("registers exactly one hourly ask-invite-expiry job under the existing runner", () => {
    expect(SCHEDULED_JOB_NAMES).toContain("ask-invite-expiry");
    const matches = SCHEDULED_JOBS.filter(job => job.name === "ask-invite-expiry");
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ windowMs: 60 * 60_000, leaseMs: 5 * 60_000 });
  });
});
