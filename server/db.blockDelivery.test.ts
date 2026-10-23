import express from "express";
import request from "supertest";
import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jobs, notifications, operationalActivityLogs, profiles, referralAvailabilitySlots, referralRequestPasses, referralRequests, referralReviewDeliveries, referrerReviewEmailLinks, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import { openCompanyReferralAvailability, prepareReferrerReviewEmailNotifications, releaseFirstLookForRequest, saveVerifiedWorkEmail } from "./db";
import { registerPrivateReferralRoutes, type PrivateReferralRouteDeps } from "./privateReferralRoutes";
import { BlockedPersonalLinkError, PERSONAL_LINK_UNAVAILABLE } from "./blockedPairs";
import { coverageReferrerNotice } from "./coverageDelivery";

/*
 * P0-block-delivery: a block (userBlocks, either direction) keeps a seeker's
 * ask away from that referrer on every path that delivers or assigns it, not
 * only on the routes that read it. Each case puts the blocked referrer next to
 * an unblocked colleague (the colleague still gets the ask), covers both block
 * directions, keeps an unblocked control, and proves the fail-open policy: a
 * failed block lookup changes nothing and is reported. Real server/db.ts calls
 * over the in-memory database.
 */

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn(), capture: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));
vi.mock("./sentry", async importOriginal => ({ ...(await importOriginal<typeof import("./sentry")>()), captureServerError: mocks.capture }));

const SEEKER = 7;
const OTHER_SEEKER = 8;
/** The acme.com employee blocked with SEEKER in each blocked case. */
const REFERRER = 2;
/** An unblocked acme.com employee. */
const COLLEAGUE = 4;
/** A person who verifies an acme.com work email during the test. */
const NEW_EMPLOYEE = 5;
/** The acme.com employee whose post gave the first look. */
const POSTER = 9;
const REQUEST_ID = 501;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const employee = (id: number, userId: number): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00Z"), paused: false, notifyNewAsk: true });
const person = (id: number, name: string, email: string): Row => full(users, { id, name, email, suspended: false });
const ask = (over: Row = {}): Row => full(referralRequests, { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: false, coverageVisibleAt: null, createdAt: new Date(Date.now() - HOUR_MS), updatedAt: new Date(Date.now() - HOUR_MS), ...over });
const reviewGrant = (id: number, referrerId: number): Row => full(referrerReviewEmailLinks, { id, referralRequestId: REQUEST_ID, referrerId, linkToken: `${String(referrerId).repeat(40)}`.slice(0, 48), expiresAt: new Date(Date.now() + DAY_MS), consumedAt: null, grantVersion: 1 });
/** A seeker wallet with credits: delivery spends its 1 credit at first visibility (D-034). */
const seekerWallet = (id: number, userId: number): Row => full(tokenBalances, { id, userId, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(), plan: "free" });
const walletOf = (userId: number) => store.rows(tokenBalances).find(row => row.userId === userId);

function seed(options: { asks?: readonly Row[]; grants?: readonly Row[] } = {}) {
  store.reset([
    [users, [person(SEEKER, "Avery Example", "avery@example.com"), person(OTHER_SEEKER, "Blake Example", "blake@example.com"), person(REFERRER, "Riya Referrer", "riya@acme.com"), person(COLLEAGUE, "Colin Colleague", "colin@acme.com"), person(NEW_EMPLOYEE, "Nina New", "nina@acme.com"), person(POSTER, "Pat Poster", "pat@acme.com")]],
    [profiles, [employee(31, REFERRER), employee(33, COLLEAGUE), employee(39, POSTER)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Role from shared job link", targetRoleUrl: "https://careers.acme.com/jobs/design" })]],
    [referralRequests, [...(options.asks ?? [ask()])]],
    [tokenBalances, [seekerWallet(81, SEEKER), seekerWallet(82, OTHER_SEEKER)]],
    [tokenTransactions, []],
    [referrerReviewEmailLinks, [...(options.grants ?? [])]],
    [referralReviewDeliveries, []],
    [referralRequestPasses, []],
    [referralAvailabilitySlots, []],
    [notifications, []],
    [operationalActivityLogs, []],
    [userBlocks, []],
  ]);
}
/** `blocker` blocks `blocked`; every delivery path must read it in both directions. */
const blockPair = async (blocker: number, blocked: number) => { await store.db.insert(userBlocks).values({ blockerUserId: blocker, blockedUserId: blocked, reason: null, createdAt: new Date() }); };
const noticesFor = (userId: number) => store.rows(notifications).filter(row => row.userId === userId);

const DIRECTIONS = [
  ["the referrer blocked the seeker", REFERRER, SEEKER],
  ["the seeker blocked the referrer", SEEKER, REFERRER],
] as const;

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  mocks.capture.mockClear();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const sendAsk = (app: express.Express, body: Record<string, unknown> = {}) => request(app).post("/api/company-referrals").set("x-test-user", String(SEEKER)).set("Idempotency-Key", "block-delivery-key-0001").send({ expectedCost: 1, targetRoleUrl: "https://careers.acme.com/jobs/design", attachmentIds: [77], candidateMessage: "A specific note about the role.", ...body });

/** A failed lookup is fail-open, never silent: logged and sent to Sentry with the path that skipped it. */
const expectReportedLookupFailure = (area: string) => {
  expect(mocks.capture).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringMatching(/userBlocks/) }), expect.objectContaining({ area }));
};

describe("review email links for a new ask", () => {
  beforeEach(() => seed({ grants: [reviewGrant(51, REFERRER), reviewGrant(52, COLLEAGUE)] }));

  it.each(DIRECTIONS)("skip the blocked referrer when %s: no link, no delivery row, the colleague still gets one", async (_label, blocker, blocked) => {
    await blockPair(blocker, blocked);
    const links = await prepareReferrerReviewEmailNotifications(REQUEST_ID);
    expect(links.map(link => link.referrerId)).toEqual([COLLEAGUE]);
    expect(store.rows(referralReviewDeliveries).map(row => row.referrerId)).toEqual([COLLEAGUE]);
  });

  it("leave an unblocked pair untouched, with or without someone else's block", async () => {
    await blockPair(REFERRER, OTHER_SEEKER);
    const links = await prepareReferrerReviewEmailNotifications(REQUEST_ID);
    expect(links.map(link => link.referrerId).sort()).toEqual([REFERRER, COLLEAGUE].sort());
  });

  it("fail open when the block lookup fails, and report it", async () => {
    await blockPair(REFERRER, SEEKER);
    store.failReads(userBlocks);
    const links = await prepareReferrerReviewEmailNotifications(REQUEST_ID);
    expect(links.map(link => link.referrerId).sort()).toEqual([REFERRER, COLLEAGUE].sort());
    expectReportedLookupFailure("review_email_delivery");
  });
});

describe("email and Slack dispatch after an ask is created", () => {
  type Sent = { email: string[]; slackAskedFor: number[][]; slack: string[] };
  const appFor = (sent: Sent, activity: string[]) => {
    const app = express();
    app.use(express.json());
    const deps = {
      resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "seeker" } } : undefined),
      createCompanyReferralRequest: async () => ({ requestId: REQUEST_ID, companyDomain: "acme.com", notifiedEmployees: 1, coverageStatus: "covered" as const, replayed: false }),
      prepareReferrerReviewEmailNotifications,
      sendReferrerReviewEmail: async (input: { to: string }) => { sent.email.push(input.to); return { sent: true, reason: "sent" }; },
      getActiveReferrerSlackWebhooks: async (referrerIds: number[]) => { sent.slackAskedFor.push(referrerIds); return referrerIds.map(referrerId => ({ referrerId, webhookUrl: `https://hooks.slack.com/services/T0/B0/${referrerId}` })); },
      sendReferrerSlackDelivery: async (input: { to: string }) => { sent.slack.push(input.to); return { sent: true, reason: "sent" }; },
      recordActivity: async (entry: { action: string }) => { activity.push(entry.action); },
    };
    registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
    return app;
  };

  it.each(DIRECTIONS)("never emails or Slacks the blocked referrer when %s; the colleague gets both", async (_label, blocker, blocked) => {
    seed({ grants: [reviewGrant(51, REFERRER), reviewGrant(52, COLLEAGUE)] });
    await blockPair(blocker, blocked);
    const sent: Sent = { email: [], slackAskedFor: [], slack: [] };
    const activity: string[] = [];
    expect((await sendAsk(appFor(sent, activity))).status).toBe(201);
    await vi.waitFor(() => expect(activity).toContain("company_referral.review_slack_dispatched"));
    expect(sent.email).toEqual(["colin@acme.com"]);
    expect(sent.slackAskedFor).toEqual([[COLLEAGUE]]);
    expect(sent.slack).toEqual([`https://hooks.slack.com/services/T0/B0/${COLLEAGUE}`]);
  });
});

describe("the ask route's answer to a blocked personal link", () => {
  type Activity = { actorUserId?: number; action: string; outcome: string };
  const appRefusing = (error: Error, activity: Activity[]) => {
    const app = express();
    app.use(express.json());
    const deps = {
      resolveIdentity: async (req: express.Request) => (req.header("x-test-user") ? { account: { id: Number(req.header("x-test-user")), openId: "seeker" } } : undefined),
      createCompanyReferralRequest: async () => { throw error; },
      recordActivity: async (entry: Activity) => { activity.push(entry); },
    };
    registerPrivateReferralRoutes(app, deps as unknown as PrivateReferralRouteDeps);
    return app;
  };
  const viaLink = { fastTrackCode: "personal-link-code-0001" };

  it("is byte-for-byte the inactive link's answer, and the denial is recorded for the repair loop", async () => {
    const blockedActivity: Activity[] = [];
    const inactiveActivity: Activity[] = [];
    const blocked = await sendAsk(appRefusing(new BlockedPersonalLinkError(), blockedActivity), viaLink);
    const inactive = await sendAsk(appRefusing(new Error(PERSONAL_LINK_UNAVAILABLE), inactiveActivity), viaLink);
    expect(blocked.status).toBe(400);
    expect(blocked.body).toEqual({ error: PERSONAL_LINK_UNAVAILABLE });
    expect([blocked.status, blocked.text]).toEqual([inactive.status, inactive.text]);
    expect(blockedActivity).toContainEqual(expect.objectContaining({ actorUserId: SEEKER, action: "company_referral.blocked_denied", outcome: "denied" }));
    expect(blockedActivity.map(entry => entry.action)).not.toContain("company_referral.created");
    expect(inactiveActivity.map(entry => entry.action)).not.toContain("company_referral.blocked_denied");
  });
});

describe("a newly verified employee's delivery of waiting asks", () => {
  const queued = (id: number, jobSeekerId: number): Row => ask({ id, jobSeekerId, waitingForCoverage: true, coverageQueuedAt: new Date(Date.now() - HOUR_MS) });
  const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);
  beforeEach(() => seed({ asks: [queued(REQUEST_ID, SEEKER), queued(502, OTHER_SEEKER)] }));

  it.each([
    ["the new employee blocked the seeker", NEW_EMPLOYEE, SEEKER],
    ["the seeker blocked the new employee", SEEKER, NEW_EMPLOYEE],
  ])("leaves out the blocked seeker's ask when %s, delivering the other", async (_label, blocker, blocked) => {
    await blockPair(blocker, blocked);
    await saveVerifiedWorkEmail(NEW_EMPLOYEE, "nina@acme.com");
    expect(noticesFor(NEW_EMPLOYEE)).toHaveLength(1);
    expect(noticesFor(NEW_EMPLOYEE)[0]).toMatchObject(coverageReferrerNotice("acme.com"));
    expect(askById(REQUEST_ID)).toMatchObject({ waitingForCoverage: true, referrerId: null });
    expect(askById(502)).toMatchObject({ waitingForCoverage: false, referrerId: NEW_EMPLOYEE });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(walletOf(OTHER_SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
  });

  it("delivers every waiting ask and spends each seeker's credit once (D-034)", async () => {
    await saveVerifiedWorkEmail(NEW_EMPLOYEE, "nina@acme.com");
    expect(noticesFor(NEW_EMPLOYEE)).toHaveLength(2);
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: NEW_EMPLOYEE, waitingForCoverage: false });
    expect(askById(502)).toMatchObject({ referrerId: NEW_EMPLOYEE, waitingForCoverage: false });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
    expect(walletOf(OTHER_SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
    expect(store.rows(tokenTransactions).filter(row => row.kind === "credit_spend").map(row => String(row.referenceId)).sort()).toEqual([`${REQUEST_ID}#1`, "502#1"].sort());
  });

  it("fails open when the block lookup fails, and reports it", async () => {
    await blockPair(NEW_EMPLOYEE, SEEKER);
    store.failReads(userBlocks);
    await saveVerifiedWorkEmail(NEW_EMPLOYEE, "nina@acme.com");
    expect(noticesFor(NEW_EMPLOYEE)).toHaveLength(2);
    expectReportedLookupFailure("coverage_delivery");
  });
});

describe("opening referral capacity (queue allocation)", () => {
  const waiting = (id: number, jobSeekerId: number, queuedDaysAgo: number) => ask({ id, jobSeekerId, waitingForCoverage: true, coverageQueuedAt: new Date(Date.now() - queuedDaysAgo * DAY_MS) });
  const slotRequestIds = () => store.rows(referralAvailabilitySlots).map(row => row.referralRequestId);
  const askById = (id: number) => store.rows(referralRequests).find(row => row.id === id);

  it.each(DIRECTIONS)("skips the blocked seeker's ask when %s, keeps it waiting, and gives the slot to the next ask", async (_label, blocker, blocked) => {
    seed({ asks: [waiting(REQUEST_ID, SEEKER, 3), waiting(502, OTHER_SEEKER, 2)] });
    await blockPair(blocker, blocked);
    const result = await openCompanyReferralAvailability(REFERRER, { slotCount: 1 });
    expect(result).toMatchObject({ allocatedRequestIds: [502], allocatedCount: 1 });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: null, waitingForCoverage: true, status: "pending" });
    expect(slotRequestIds()).toEqual([502]);
    expect(noticesFor(SEEKER)).toEqual([]);
    expect(noticesFor(OTHER_SEEKER)).toHaveLength(1);
    // Only the delivered ask spends its seeker's credit (D-034); the blocked one costs nothing.
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(walletOf(OTHER_SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
  });

  it("does not spend the referrer's slots or attempts on blocked asks ahead in the queue", async () => {
    seed({ asks: [1, 2, 3, 4, 5].map(n => waiting(600 + n, SEEKER, 10 - n)).concat(waiting(502, OTHER_SEEKER, 1)) });
    await blockPair(REFERRER, SEEKER);
    const result = await openCompanyReferralAvailability(REFERRER, { slotCount: 2 });
    expect(result).toMatchObject({ allocatedRequestIds: [502], allocatedCount: 1 });
    expect(store.rows(referralRequests).filter(row => row.jobSeekerId === SEEKER).every(row => row.referrerId === null && row.waitingForCoverage === true)).toBe(true);
    expect(store.rows(referralAvailabilitySlots)).toHaveLength(1);
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(walletOf(OTHER_SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
  });

  it("leaves the blocked seeker's ask for an unblocked colleague", async () => {
    seed({ asks: [waiting(REQUEST_ID, SEEKER, 3)] });
    await blockPair(REFERRER, SEEKER);
    expect(await openCompanyReferralAvailability(REFERRER, { slotCount: 1 })).toMatchObject({ allocatedRequestIds: [] });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(await openCompanyReferralAvailability(COLLEAGUE, { slotCount: 1 })).toMatchObject({ allocatedRequestIds: [REQUEST_ID] });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: COLLEAGUE, waitingForCoverage: false });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
  });

  it("allocates the oldest ask as before when nothing is blocked, spending one credit at first visibility", async () => {
    seed({ asks: [waiting(REQUEST_ID, SEEKER, 3), waiting(502, OTHER_SEEKER, 2)] });
    expect(await openCompanyReferralAvailability(REFERRER, { slotCount: 1 })).toMatchObject({ allocatedRequestIds: [REQUEST_ID] });
    expect(askById(REQUEST_ID)).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false });
    expect(walletOf(SEEKER)).toMatchObject({ monthlyCreditsRemaining: 1 });
    expect(walletOf(OTHER_SEEKER)).toMatchObject({ monthlyCreditsRemaining: 2 });
    expect(store.rows(tokenTransactions).filter(row => row.kind === "credit_spend")).toEqual([
      expect.objectContaining({ userId: SEEKER, tokenCount: -1, referenceId: `${REQUEST_ID}#1`, idempotencyKey: `ask-delivery:${REQUEST_ID}#1` }),
    ]);
  });

  it("fails open when the block lookup fails, and reports it", async () => {
    seed({ asks: [waiting(REQUEST_ID, SEEKER, 3), waiting(502, OTHER_SEEKER, 2)] });
    await blockPair(REFERRER, SEEKER);
    store.failReads(userBlocks);
    expect(await openCompanyReferralAvailability(REFERRER, { slotCount: 1 })).toMatchObject({ allocatedRequestIds: [REQUEST_ID] });
    expectReportedLookupFailure("coverage_delivery");
  });
});

describe("releasing a lapsed first look", () => {
  const lapsed = () => ask({ createdAt: new Date(Date.now() - 3 * DAY_MS), firstLookReferrerId: POSTER, firstLookUntil: new Date(Date.now() - HOUR_MS) });

  it.each(DIRECTIONS)("tells the colleagues but not the blocked referrer when %s", async (_label, blocker, blocked) => {
    seed({ asks: [lapsed()] });
    await blockPair(blocker, blocked);
    expect(await releaseFirstLookForRequest(REQUEST_ID)).toEqual({ released: true, notified: 1 });
    expect(noticesFor(REFERRER)).toEqual([]);
    expect(noticesFor(COLLEAGUE)).toHaveLength(1);
    expect(store.rows(referralRequests)[0]).toMatchObject({ firstLookReferrerId: null, firstLookUntil: null });
  });

  it("tells every colleague when nothing is blocked", async () => {
    seed({ asks: [lapsed()] });
    expect(await releaseFirstLookForRequest(REQUEST_ID)).toEqual({ released: true, notified: 2 });
  });

  it("fails open when the block lookup fails, and reports it", async () => {
    seed({ asks: [lapsed()] });
    await blockPair(REFERRER, SEEKER);
    store.failReads(userBlocks);
    expect(await releaseFirstLookForRequest(REQUEST_ID)).toEqual({ released: true, notified: 2 });
    expectReportedLookupFailure("first_look_release");
  });
});
