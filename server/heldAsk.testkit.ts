/*
 * Test-only fixtures for D-050 personal-link asks. A D-017 ask is created
 * already assigned to the employee whose personal link the seeker used; until
 * that employee claims, accepts or passes, the ask is "held" for them and
 * counts as unclaimed. One ask at acme.com, the seeker's wallet and the ask's
 * credit spend, over the in-memory drizzle client. Tests install the client
 * with vi.mock("drizzle-orm/mysql2", ...) and reseed with `seedHeldAsks`.
 *
 * Every seeded row carries every column of its table (null unless set), the
 * way a real insert would, so a read never sees a missing column.
 */
import { getTableColumns } from "drizzle-orm";
import type { MySqlTable } from "drizzle-orm/mysql-core";
import { jobs, notifications, operationalActivityLogs, profiles, referralAvailabilitySlots, referralDocumentAccessGrants, referralRequestPasses, referralRequests, referralTransitionEvents, tokenBalances, tokenTransactions, users } from "../drizzle/schema";
import { createInMemoryDrizzle, type Row } from "./inMemoryDrizzle.testkit";

export const SEEKER = 7;
export const OTHER_SEEKER = 8;
/** The verified acme.com employee whose personal link the seeker used. */
export const LINK_OWNER = 2;
/** Another verified acme.com employee, never assigned the ask. */
export const COLLEAGUE = 4;
export const REQUEST_ID = 501;
export const SPEND_ID = 61;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** The fixed clock every expiry and sweep call in these tests runs on. */
export const NOW = Date.parse("2026-10-18T12:00:00.000Z");
/** Before claims were recorded as transition events (migration 0058, Sept 18 2026). */
export const BEFORE_CLAIM_HISTORY = new Date("2026-09-15T00:00:00.000Z");
export const daysAgo = (days: number) => new Date(NOW - days * DAY_MS);

export const PERSONAL_LINK_LEAD = "The employee whose link you used didn't respond within 7 days.";
export const CLAIMED_REFUSAL = "This request was already claimed by a verified employee and can no longer be withdrawn";

const full = (table: MySqlTable, values: Row): Row => ({ ...Object.fromEntries(Object.keys(getTableColumns(table)).map(key => [key, null])), ...values });

/** A pending ask held for the link owner: assigned at creation, nothing recorded since. */
export const askRow = (over: Row = {}): Row => full(referralRequests, { id: REQUEST_ID, jobId: 11, jobSeekerId: SEEKER, referrerId: LINK_OWNER, personalPitch: "I led two launches.", status: "pending", revision: 0, waitingForCoverage: false, debitTransactionId: SPEND_ID, createdAt: daysAgo(2), updatedAt: daysAgo(2), ...over });
/** The ask's 1-credit spend through the credit ledger (row #1 of the create's idempotency key). */
export const spendRow = (over: Row = {}): Row => full(tokenTransactions, { id: SPEND_ID, userId: SEEKER, role: "job_seeker", tokenCount: -1, kind: "credit_spend", source: "monthly_allowance", sourceCycleKey: "2026-10", referenceType: "referral_request", referenceId: `${REQUEST_ID}#1`, idempotencyKey: `k${REQUEST_ID}#1`, balanceAfter: 0, monthlyCreditsAfter: 2, ...over });
/** A pre-ledger reserved credit (kind direct_request, referenced by the bare ask id). */
export const legacyDebitRow = (over: Row = {}): Row => spendRow({ kind: "direct_request", referenceId: String(REQUEST_ID), idempotencyKey: null, ...over });
export const walletRow = (over: Row = {}): Row => full(tokenBalances, { id: 81, userId: SEEKER, role: "job_seeker", balance: 0, monthlyCreditsRemaining: 2, monthlyAllowance: 3, monthlyCycleKey: "2026-10", plan: "free", ...over });
/** The event every claim has written since migration 0058. */
export const claimEvent = (requestId = REQUEST_ID, id = 39): Row => full(referralTransitionEvents, { id, referralRequestId: requestId, operationKey: `claim:${LINK_OWNER}`, actorUserId: LINK_OWNER, action: "claim", fromStatus: "pending", resultingStatus: "pending", resultingRevision: 1, createdAt: daysAgo(1) });
/** A queue allocation (openCompanyReferralAvailability): referrerId set with no event, plus this slot. */
export const allocatedSlot = (requestId = REQUEST_ID, id = 91): Row => full(referralAvailabilitySlots, { id, referrerId: LINK_OWNER, companyDomain: "acme.com", referralRequestId: requestId, status: "allocated", activeRequestKey: `request:${requestId}`, openedAt: daysAgo(3) });

export type HeldSeed = { asks?: readonly Row[]; spends?: readonly Row[]; wallets?: readonly Row[]; events?: readonly Row[]; slots?: readonly Row[] };

export const store = createInMemoryDrizzle();

/** One held ask (unless `asks` overrides it) with its spend, the seeker's wallet and two verified acme.com employees. */
export function seedHeldAsks(seed: HeldSeed = {}) {
  const verifiedAt = new Date("2026-09-01T00:00:00Z");
  const employee = (id: number, userId: number): Row => full(profiles, { id, userId, accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: verifiedAt });
  const person = (id: number, name: string): Row => full(users, { id, name });
  store.reset([
    [users, [person(SEEKER, "Avery Example"), person(OTHER_SEEKER, "Blake Example"), person(LINK_OWNER, "Riya Referrer"), person(COLLEAGUE, "Colin Colleague")]],
    [profiles, [employee(31, LINK_OWNER), employee(33, COLLEAGUE)]],
    [jobs, [full(jobs, { id: 11, company: "acme.com", title: "Product Designer", targetRoleUrl: "https://careers.acme.com/jobs/design" })]],
    [referralRequests, [...(seed.asks ?? [askRow()])]],
    [tokenTransactions, [...(seed.spends ?? [spendRow()])]],
    [tokenBalances, [...(seed.wallets ?? [walletRow()])]],
    [referralTransitionEvents, [...(seed.events ?? [])]],
    [referralAvailabilitySlots, [...(seed.slots ?? [])]],
    [referralRequestPasses, []],
    [referralDocumentAccessGrants, []],
    [notifications, []],
    [operationalActivityLogs, []],
  ]);
}

export const askById = (id: number = REQUEST_ID) => store.rows(referralRequests).find(row => row.id === id);
export const reversalsOf = (spendId: number = SPEND_ID) => store.rows(tokenTransactions).filter(row => row.reversesTransactionId === spendId);
export const walletOf = (userId: number = SEEKER) => store.rows(tokenBalances).find(row => row.userId === userId);
export const eventActions = (requestId: number = REQUEST_ID) => store.rows(referralTransitionEvents).filter(row => row.referralRequestId === requestId).map(row => row.action);
export const noticesFor = (userId: number = SEEKER) => store.rows(notifications).filter(row => row.userId === userId);
export const releaseLogs = () => store.rows(operationalActivityLogs).filter(row => row.action === "personal_link_ask.released");
