import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askCosts, askInviteLinks, canonicalPeople, companies, companyDomains, jobs, notifications, operationalActivityLogs, planCreditGrants, profiles, promoCreditGrants, referralAttachments, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, userBlocks, users } from "../drizzle/schema";
import { currentMonthlyCycleKey } from "../shared/subscriptionPlans";
import { ASK_INVITE_RESERVATION_MS, ASK_INVITE_TTL_MS } from "../shared/askInvites";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";
import * as askInviteService from "./askInvites";

const mocks = vi.hoisted(() => ({ drizzle: vi.fn(), createPool: vi.fn() }));
vi.mock("drizzle-orm/mysql2", () => ({ drizzle: mocks.drizzle }));
vi.mock("mysql2/promise", () => ({ createPool: mocks.createPool }));

const SEEKER = 7;
const REFERRER = 2;
const OTHER_REFERRER = 4;
const REQUEST_ID = 501;
const LINK_ID = 21;
const TOKEN = "a".repeat(43);
const NOW = new Date("2026-10-23T12:00:00.000Z");

const store = createInMemoryDrizzle();
const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });
const person = (id: number, name: string, email: string, over: Row = {}): Row => full(users, { id, openId: `person-${id}`, name, email, suspended: false, ...over });
const employee = (id: number, userId: number, over: Row = {}): Row => full(profiles, { id: id + 100, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date("2026-09-01T00:00:00.000Z"), paused: false, referralCapacity: 3, ...over });
const wallet = (over: Row = {}): Row => full(tokenBalances, { id: 81, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: currentMonthlyCycleKey(NOW), plan: "free", ...over });
const ask = (over: Row = {}): Row => full(referralRequests, { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: null, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: true, coverageQueuedAt: NOW, coverageVisibleAt: null, coverageHeldAt: null, debitTransactionId: null, createdAt: NOW, updatedAt: NOW, ...over });
const invite = (over: Row = {}): Row => full(askInviteLinks, { id: LINK_ID, referralRequestId: REQUEST_ID, createdByUserId: SEEKER, linkTokenHash: askInviteService.hashAskInviteToken(TOKEN), status: "active", claimedByUserId: null, claimedAt: null, reservationExpiresAt: null, activeRequestKey: `link:${REQUEST_ID}`, expiresAt: new Date(NOW.getTime() + ASK_INVITE_TTL_MS), closedAt: null, createdAt: NOW, ...over });

function seed(options: { ask?: Row; invite?: Row; wallet?: Row; referrer?: Row; otherReferrer?: Row; seeker?: Row; seekerProfile?: Row; personSuspended?: boolean; blocked?: boolean; attachments?: Row[] } = {}) {
  store.reset([
    [askCosts, []],
    [askInviteLinks, [options.invite ?? invite()]],
    [canonicalPeople, [full(canonicalPeople, { id: 100, suspended: options.personSuspended ?? false })]],
    [companies, [full(companies, { id: 1, slug: "acme", name: "Acme Corporation", initials: "AC", industry: "Technology", location: "Remote", functions: "[\"design\"]", blurb: "Acme", status: "listed", sortOrder: 1 })]],
    [companyDomains, [full(companyDomains, { id: 1, companyId: 1, domain: "acme.com", isPrimary: true })]],
    [users, [options.seeker ?? person(SEEKER, "Seeker Name", "seeker@example.com"), person(REFERRER, "Referrer Name", "insider@acme.com", { canonicalPersonId: 100 }), person(OTHER_REFERRER, "Other Name", "other@other.com")]],
    [profiles, [employee(31, REFERRER, options.referrer ?? {}), employee(33, OTHER_REFERRER, { workEmailDomain: "other.com", ...options.otherReferrer }), ...(options.seekerProfile ? [employee(35, SEEKER, options.seekerProfile)] : [])]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", location: "Remote", workMode: "remote", jobFunction: "design", seniority: "mid", employmentType: "full-time", description: "Design systems" })]],
    [referralRequests, [options.ask ?? ask()]],
    [tokenBalances, [options.wallet ?? wallet()]],
    [tokenTransactions, []],
    [planCreditGrants, []],
    [promoCreditGrants, []],
    [referralAvailabilitySlots, []],
    [referralAttachments, options.attachments ?? [full(referralAttachments, { id: 51, referralRequestId: REQUEST_ID, ownerId: SEEKER, fileName: "resume.pdf", fileKey: "private-key", mimeType: "application/pdf", fileSize: 10 })]],
    [referralDocumentAccessGrants, []],
    [referralRequestPasses, []],
    [referralTransitionEvents, []],
    [notifications, []],
    [operationalActivityLogs, []],
    [userBlocks, options.blocked ? [full(userBlocks, { id: 1, blockerUserId: REFERRER, blockedUserId: SEEKER, createdAt: NOW })] : []],
  ]);
}

const askById = () => store.rows(referralRequests).find(row => row.id === REQUEST_ID);
const inviteById = () => store.rows(askInviteLinks).find(row => row.id === LINK_ID);
const spends = () => store.rows(tokenTransactions).filter(row => row.kind === "credit_spend");
const callLanding = (token: string, viewerUserId?: number, nowMs = NOW.getTime()) => {
  const fn = (askInviteService as unknown as { getAskInviteLanding?: (token: string, viewerUserId?: number, nowMs?: number) => Promise<unknown> }).getAskInviteLanding;
  if (!fn) throw new Error("getAskInviteLanding is not implemented");
  return fn(token, viewerUserId, nowMs);
};
const callClaim = (token: string, userId: number, nowMs = NOW.getTime()) => {
  const fn = (askInviteService as unknown as { claimAskInvite?: (token: string, userId: number, nowMs?: number) => Promise<any> }).claimAskInvite;
  if (!fn) throw new Error("claimAskInvite is not implemented");
  return fn(token, userId, nowMs);
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fixture:fixture@localhost/fixture");
  vi.stubEnv("BYOR_LINK_ENABLED", "true");
  mocks.createPool.mockResolvedValue({});
  mocks.drizzle.mockReturnValue(store.db);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("D-090 C3 landing data", () => {
  it("shows only public company and role facts to a signed-out visitor", async () => {
    seed();
    expect(await callLanding(TOKEN)).toEqual({
      invite: { state: "open", companyName: "Acme Corporation", roleTitle: "Product Designer", jobFunction: "design", workMode: "remote", location: "Remote", note: null, lockedFileCount: null },
      requestId: REQUEST_ID,
      linkId: LINK_ID,
    });
  });

  it("shows the note and file count only to a verified same-domain employee, never the seeker or another domain", async () => {
    seed();
    await expect(callLanding(TOKEN, REFERRER)).resolves.toMatchObject({ invite: { note: "I led two launches.", lockedFileCount: 1 } });
    await expect(callLanding(TOKEN, SEEKER)).resolves.toMatchObject({ invite: { note: null, lockedFileCount: null } });
    await expect(callLanding(TOKEN, OTHER_REFERRER)).resolves.toMatchObject({ invite: { note: null, lockedFileCount: null } });
  });

  it("uses the same unavailable result for an unknown token and a blocked viewer", async () => {
    seed({ blocked: true });
    await expect(callLanding("b".repeat(43), REFERRER)).resolves.toBeUndefined();
    await expect(callLanding(TOKEN, REFERRER)).resolves.toBeUndefined();
  });

  it("shows claimed_by_you only to the claimer while the reservation is live and used to another viewer", async () => {
    seed({ invite: invite({ status: "claimed", claimedByUserId: REFERRER, claimedAt: NOW, reservationExpiresAt: new Date(NOW.getTime() + ASK_INVITE_RESERVATION_MS), activeRequestKey: null }) });
    await expect(callLanding(TOKEN, REFERRER)).resolves.toMatchObject({ invite: { state: "claimed_by_you", note: "I led two launches." } });
    await expect(callLanding(TOKEN, OTHER_REFERRER)).resolves.toMatchObject({ invite: { state: "used", note: null, lockedFileCount: null } });
  });
});

describe("D-090 C3 claim and delivery", () => {
  it("claims and delivers to a verified same-domain employee exactly once", async () => {
    seed();
    const result = await callClaim(TOKEN, REFERRER, NOW.getTime());
    expect(result).toMatchObject({ outcome: "delivered", requestId: REQUEST_ID, linkId: LINK_ID });
    expect(askById()).toMatchObject({ referrerId: REFERRER, waitingForCoverage: false, coverageVisibleAt: NOW });
    expect(inviteById()).toMatchObject({ status: "delivered", claimedByUserId: REFERRER, reservationExpiresAt: null, activeRequestKey: null });
    expect(spends()).toHaveLength(1);
    expect(spends()[0]).toMatchObject({ idempotencyKey: `ask-delivery:${REQUEST_ID}#1` });
    expect(store.rows(referralAvailabilitySlots)).toEqual([expect.objectContaining({ referrerId: REFERRER, referralRequestId: REQUEST_ID, status: "allocated" })]);
    expect(store.rows(notifications).map(row => row.kind).sort()).toEqual(["ask_new", "coverage_delivered"]);
    expect(store.rows(operationalActivityLogs).map(row => row.action)).toContain("ask_invite.claimed");
    expect(store.rows(operationalActivityLogs).map(row => row.action)).toContain("ask_invite.delivered");
    expect(JSON.stringify(store.rows(operationalActivityLogs))).not.toMatch(/token|email|name/);
  });

  it.each([
    ["other domain", { referrer: { workEmailDomain: "other.com" } }, "company_email_required", REFERRER],
    ["the seeker", { seekerProfile: {} }, "company_email_required", SEEKER],
    ["a paused employee", { referrer: { paused: true } }, "referrer_unavailable", REFERRER],
    ["a suspended employee", { personSuspended: true }, "referrer_unavailable", REFERRER],
  ])("refuses %s without changing the ask, link, or ledger", async (_label, options, code, userId) => {
    seed(options as Parameters<typeof seed>[0]);
    await expect(callClaim(TOKEN, Number(userId))).rejects.toMatchObject({ code });
    expect(askById()).toMatchObject({ referrerId: null, waitingForCoverage: true });
    expect(inviteById()).toMatchObject({ status: "active", claimedByUserId: null });
    expect(spends()).toEqual([]);
  });

  it("returns a neutral 404 for a blocked pair without changing the link or ledger", async () => {
    seed({ blocked: true });
    await expect(callClaim(TOKEN, REFERRER)).rejects.toMatchObject({ code: "not_available" });
    expect(inviteById()).toMatchObject({ status: "active" });
    expect(spends()).toEqual([]);
  });

  it("makes a retry by the claimer idempotent and refuses a second claimer", async () => {
    seed();
    const first = await callClaim(TOKEN, REFERRER, NOW.getTime());
    const retry = await callClaim(TOKEN, REFERRER, NOW.getTime() + 1);
    expect(first).toMatchObject({ outcome: "delivered" });
    expect(retry).toMatchObject({ outcome: "delivered", claimedNow: false });
    await expect(callClaim(TOKEN, OTHER_REFERRER, NOW.getTime() + 2)).rejects.toMatchObject({ code: "link_used" });
    expect(inviteById()).toMatchObject({ status: "delivered", claimedByUserId: REFERRER });
    expect(spends()).toHaveLength(1);
  });

  it("serializes concurrent claims so exactly one insider wins and only one debit is recorded", async () => {
    seed();
    const db = store.db as unknown as { transaction: (run: (tx: unknown) => Promise<unknown>) => Promise<unknown> };
    const originalTransaction = db.transaction.bind(db);
    let tail: Promise<unknown> = Promise.resolve();
    db.transaction = run => {
      const next = tail.then(() => originalTransaction(run as never));
      tail = next.then(() => undefined, () => undefined);
      return next;
    };
    try {
      const outcomes = await Promise.allSettled([
        callClaim(TOKEN, REFERRER, NOW.getTime()),
        callClaim(TOKEN, OTHER_REFERRER, NOW.getTime()),
      ]);
      expect(outcomes.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const rejected = outcomes.find(result => result.status === "rejected") as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: "link_used" });
      expect(inviteById()).toMatchObject({ status: "delivered", claimedByUserId: REFERRER });
      expect(spends()).toHaveLength(1);
    } finally {
      db.transaction = originalTransaction;
    }
  });

  it("reports an ask unavailable if a previously delivered ask is later withdrawn", async () => {
    seed({ ask: ask({ status: "withdrawn", referrerId: null, waitingForCoverage: false }), invite: invite({ status: "delivered", claimedByUserId: REFERRER, claimedAt: NOW, reservationExpiresAt: null, activeRequestKey: null }) });
    await expect(callClaim(TOKEN, REFERRER, NOW.getTime())).rejects.toMatchObject({ code: "ask_unavailable" });
    expect(spends()).toEqual([]);
  });

  it("keeps a no-credit claim reserved and reports held without spending", async () => {
    seed({ wallet: wallet({ monthlyCreditsRemaining: 0 }) });
    const result = await callClaim(TOKEN, REFERRER, NOW.getTime());
    expect(result).toMatchObject({ outcome: "held", claimedNow: true });
    expect(askById()).toMatchObject({ referrerId: null, waitingForCoverage: true, coverageHeldAt: NOW });
    expect(inviteById()).toMatchObject({ status: "claimed", claimedByUserId: REFERRER, reservationExpiresAt: new Date(NOW.getTime() + ASK_INVITE_RESERVATION_MS) });
    expect(spends()).toEqual([]);
    expect(store.rows(notifications).filter(row => row.kind === "coverage_held")).toHaveLength(1);
    expect(store.rows(operationalActivityLogs).map(row => row.action)).toContain("ask_invite.held");
  });

  it("refuses an expired link before the expiry sweep and does not claim it", async () => {
    seed({ invite: invite({ expiresAt: new Date(NOW.getTime() - 1) }) });
    await expect(callClaim(TOKEN, REFERRER, NOW.getTime())).rejects.toMatchObject({ code: "link_expired" });
    expect(inviteById()).toMatchObject({ status: "active", claimedByUserId: null });
    expect(spends()).toEqual([]);
  });
});
