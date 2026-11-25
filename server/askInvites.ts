/**
 * D-090 BYOR server core: the one-time link a seeker sends to an insider they
 * already know. Only the token's SHA-256 is ever stored, and the raw token leaves
 * the server exactly once, in the 201 that creates it.
 *
 * Behind `BYOR_LINK_ENABLED` (off, D-097): with the flag off every route answers
 * 404 before any database read.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, gte, inArray } from "drizzle-orm";
import {
  ASK_INVITE_RESERVATION_MS,
  ASK_INVITE_TOKEN_BYTES,
  ASK_INVITE_TOKEN_PATTERN,
  ASK_INVITE_TTL_MS,
  ASK_INVITE_WEEKLY_CAP,
  ASK_INVITE_WEEKLY_WINDOW_MS,
  askInviteActiveRequestKey,
  askInviteLandingSchema,
  askInviteMineSchema,
  type AskInviteClaimOutcome,
  type AskInviteLanding,
  type AskInviteMine,
  type AskInviteStatus,
} from "../shared/askInvites";
import { askInviteLinks, canonicalPeople, companyDomains, companies, jobs, operationalActivityLogs, profiles, referralAttachments, referralRequests, users } from "../drizzle/schema";
import { blockedCounterpartsFailOpen } from "./blockedPairs";
import { getDb, tryDeliverWaitingAsk } from "./db";
import { isVerifiedEmployeeOfCompany } from "./referrerAvailability";
import { captureServerError } from "./sentry";

export const BYOR_LINK_FLAG = "BYOR_LINK_ENABLED";
export const byorLinkEnabled = (): boolean => process.env[BYOR_LINK_FLAG] === "true";

/** 32 random bytes as unpadded base64url — 43 characters, URL-safe without escaping. */
export const newAskInviteToken = (): string => randomBytes(ASK_INVITE_TOKEN_BYTES).toString("base64url");

/** What the database keeps. The raw token is never written, logged or returned again. */
export const hashAskInviteToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** The ask is not the caller's own. Answered as 404 so an id can never be probed. */
export class AskInviteNotFoundError extends Error {
  constructor() { super("We could not find that ask."); this.name = "AskInviteNotFoundError"; }
}

/** Only a waiting ask (no referrer yet) can hold a link; a visible ask is already in someone's hands. */
export class AskInviteNotWaitingError extends Error {
  constructor() { super("This ask is already with an employee, so it cannot hold an invite link."); this.name = "AskInviteNotWaitingError"; }
}

/** One live link per ask, enforced by the unique activeRequestKey as well as this check. */
export class AskInviteLinkActiveError extends Error {
  constructor() { super("This ask already has a live link. Revoke it first."); this.name = "AskInviteLinkActiveError"; }
}

export type AskInviteClaimErrorCode = "not_available" | "company_email_required" | "referrer_unavailable" | "link_used" | "link_expired" | "link_revoked" | "ask_unavailable";

/** A safe, token-free claim failure the route maps to a neutral status and code. */
export class AskInviteClaimError extends Error {
  constructor(readonly code: AskInviteClaimErrorCode) { super(code); this.name = "AskInviteClaimError"; }
}

/** Five links per seeker per rolling seven days (D-090's changeable knob). */
export class AskInviteCapReachedError extends Error {
  constructor(readonly nextSlotAt: Date) { super("You have created five invite links this week. Try again later."); this.name = "AskInviteCapReachedError"; }
}

export type AskInviteRequestRecord = {
  id: number;
  jobSeekerId: number;
  status: string;
  waitingForCoverage: boolean;
  referrerId: number | null;
};

export type AskInviteLinkRecord = {
  id: number;
  referralRequestId: number;
  createdByUserId: number;
  linkTokenHash: string;
  status: AskInviteStatus;
  activeRequestKey: string | null;
  claimedByUserId?: number | null;
  claimedAt?: Date | null;
  reservationExpiresAt?: Date | null;
  createdAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
};

export type AskInviteListRecord = Pick<AskInviteLinkRecord, "id" | "referralRequestId" | "createdByUserId" | "status" | "createdAt" | "expiresAt"> & Pick<AskInviteLinkRecord, "reservationExpiresAt">;
export type NewAskInviteRecord = Omit<AskInviteLinkRecord, "id">;

/** Narrow repository seam makes the lock order and business limits testable without a live MySQL server. */
export interface AskInviteTransaction {
  getAskForUpdate(requestId: number): Promise<AskInviteRequestRecord | undefined>;
  getActiveInviteForUpdate(requestId: number, userId: number): Promise<AskInviteLinkRecord | undefined>;
  getLiveClaimedInviteForUpdate(requestId: number, userId: number, now: Date): Promise<AskInviteLinkRecord | undefined>;
  getLatestInviteForUpdate(requestId: number, userId: number): Promise<AskInviteLinkRecord | undefined>;
  listLinksSince(userId: number, since: Date): Promise<Array<{ createdAt: Date }>>;
  insertInvite(input: NewAskInviteRecord): Promise<number>;
  revokeInvite(linkId: number, closedAt: Date): Promise<void>;
}

export interface AskInviteStore {
  transaction<T>(run: (tx: AskInviteTransaction) => Promise<T>): Promise<T>;
  listForRequests(userId: number, requestIds: number[]): Promise<AskInviteListRecord[]>;
}

const databaseStore: AskInviteStore = {
  async transaction<T>(run: (tx: AskInviteTransaction) => Promise<T>): Promise<T> {
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.transaction(async tx => run({
      // Keep this first in every transaction. D-090 §8 fixes the order as ask -> link.
      getAskForUpdate: async requestId => {
        const [row] = await tx.select({ id: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, status: referralRequests.status, waitingForCoverage: referralRequests.waitingForCoverage, referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, requestId)).limit(1).for("update");
        return row;
      },
      getActiveInviteForUpdate: async (requestId, userId) => {
        const [row] = await tx.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, linkTokenHash: askInviteLinks.linkTokenHash, status: askInviteLinks.status, activeRequestKey: askInviteLinks.activeRequestKey, claimedByUserId: askInviteLinks.claimedByUserId, claimedAt: askInviteLinks.claimedAt, reservationExpiresAt: askInviteLinks.reservationExpiresAt, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt, closedAt: askInviteLinks.closedAt }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, requestId), eq(askInviteLinks.createdByUserId, userId), eq(askInviteLinks.status, "active"), eq(askInviteLinks.activeRequestKey, askInviteActiveRequestKey(requestId)))).limit(1).for("update");
        return row;
      },
      getLiveClaimedInviteForUpdate: async (requestId, userId, now) => {
        const [row] = await tx.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, linkTokenHash: askInviteLinks.linkTokenHash, status: askInviteLinks.status, activeRequestKey: askInviteLinks.activeRequestKey, claimedByUserId: askInviteLinks.claimedByUserId, claimedAt: askInviteLinks.claimedAt, reservationExpiresAt: askInviteLinks.reservationExpiresAt, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt, closedAt: askInviteLinks.closedAt }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, requestId), eq(askInviteLinks.createdByUserId, userId), eq(askInviteLinks.status, "claimed"), gt(askInviteLinks.reservationExpiresAt, now))).limit(1).for("update");
        return row;
      },
      getLatestInviteForUpdate: async (requestId, userId) => {
        const [row] = await tx.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, linkTokenHash: askInviteLinks.linkTokenHash, status: askInviteLinks.status, activeRequestKey: askInviteLinks.activeRequestKey, claimedByUserId: askInviteLinks.claimedByUserId, claimedAt: askInviteLinks.claimedAt, reservationExpiresAt: askInviteLinks.reservationExpiresAt, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt, closedAt: askInviteLinks.closedAt }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, requestId), eq(askInviteLinks.createdByUserId, userId))).orderBy(desc(askInviteLinks.createdAt), desc(askInviteLinks.id)).limit(1).for("update");
        return row;
      },
      listLinksSince: async (userId, since) => tx.select({ createdAt: askInviteLinks.createdAt }).from(askInviteLinks).where(and(eq(askInviteLinks.createdByUserId, userId), gte(askInviteLinks.createdAt, since))).orderBy(asc(askInviteLinks.createdAt)),
      insertInvite: async input => {
        const [row] = await tx.insert(askInviteLinks).values(input).$returningId();
        if (!row) throw new Error("Ask invite insert did not return an id");
        return Number(row.id);
      },
      revokeInvite: async (linkId, closedAt) => {
        await tx.update(askInviteLinks).set({ status: "revoked", activeRequestKey: null, closedAt }).where(and(eq(askInviteLinks.id, linkId), eq(askInviteLinks.status, "active")));
      },
    }));
  },
  async listForRequests(userId, requestIds) {
    const ids = Array.from(new Set(requestIds.filter(id => Number.isInteger(id) && id > 0)));
    if (!ids.length) return [];
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, status: askInviteLinks.status, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt, reservationExpiresAt: askInviteLinks.reservationExpiresAt }).from(askInviteLinks).where(and(eq(askInviteLinks.createdByUserId, userId), inArray(askInviteLinks.referralRequestId, ids))).orderBy(desc(askInviteLinks.createdAt), desc(askInviteLinks.id));
  },
};

export type CreatedAskInvite = { id: number; token: string; createdAt: Date; expiresAt: Date };
export type RevokedAskInvite = { revoked: boolean; linkId: number | null };

export async function createAskInvite(userId: number, requestId: number, nowMs = Date.now(), store: AskInviteStore = databaseStore): Promise<CreatedAskInvite> {
  if (!Number.isInteger(requestId) || requestId <= 0) throw new AskInviteNotFoundError();
  const createdAt = new Date(nowMs);
  const expiresAt = new Date(nowMs + ASK_INVITE_TTL_MS);
  return store.transaction(async tx => {
    const ask = await tx.getAskForUpdate(requestId);
    if (!ask || ask.jobSeekerId !== userId) throw new AskInviteNotFoundError();
    if (ask.status !== "pending" || !ask.waitingForCoverage || ask.referrerId !== null) throw new AskInviteNotWaitingError();

    // The ask row is locked before its link row. A second create for this ask sees the first link.
    if (await tx.getActiveInviteForUpdate(requestId, userId)) throw new AskInviteLinkActiveError();
    if (await tx.getLiveClaimedInviteForUpdate(requestId, userId, new Date(nowMs))) throw new AskInviteLinkActiveError();

    const since = new Date(nowMs - ASK_INVITE_WEEKLY_WINDOW_MS);
    const recent = await tx.listLinksSince(userId, since);
    if (recent.length >= ASK_INVITE_WEEKLY_CAP) {
      const oldest = recent.map(row => row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt)).filter(date => Number.isFinite(date.getTime())).sort((a, b) => a.getTime() - b.getTime())[0];
      throw new AskInviteCapReachedError(oldest ? new Date(oldest.getTime() + ASK_INVITE_WEEKLY_WINDOW_MS) : new Date(nowMs + ASK_INVITE_WEEKLY_WINDOW_MS));
    }

    const token = newAskInviteToken();
    const id = await tx.insertInvite({
      referralRequestId: requestId,
      createdByUserId: userId,
      linkTokenHash: hashAskInviteToken(token),
      status: "active",
      activeRequestKey: askInviteActiveRequestKey(requestId),
      createdAt,
      expiresAt,
      closedAt: null,
    });
    return { id, token, createdAt, expiresAt };
  });
}

export async function revokeAskInvite(userId: number, requestId: number, nowMs = Date.now(), store: AskInviteStore = databaseStore): Promise<RevokedAskInvite> {
  if (!Number.isInteger(requestId) || requestId <= 0) throw new AskInviteNotFoundError();
  return store.transaction(async tx => {
    const ask = await tx.getAskForUpdate(requestId);
    if (!ask || ask.jobSeekerId !== userId) throw new AskInviteNotFoundError();
    const latest = await tx.getLatestInviteForUpdate(requestId, userId);
    if (!latest) return { revoked: false, linkId: null };
    if (latest.status === "revoked") return { revoked: true, linkId: latest.id };
    if (latest.status !== "active") return { revoked: false, linkId: latest.id };
    await tx.revokeInvite(latest.id, new Date(nowMs));
    return { revoked: true, linkId: latest.id };
  });
}

function dateOf(value: Date | string): Date | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

/** Narrow, owner-scoped projection for /mine; raw token, hash and claimer fields are never selected or returned. */
export async function listAskInvitesForRequests(userId: number, requestIds: number[], nowMs = Date.now(), store: AskInviteStore = databaseStore): Promise<Map<number, AskInviteMine>> {
  const ids = Array.from(new Set(requestIds.filter(id => Number.isInteger(id) && id > 0)));
  if (!ids.length) return new Map();
  const rows = await store.listForRequests(userId, ids);
  const latestByRequest = new Map<number, AskInviteListRecord>();
  for (const row of rows) {
    const prior = latestByRequest.get(row.referralRequestId);
    const rowCreatedAt = dateOf(row.createdAt);
    const priorCreatedAt = prior && dateOf(prior.createdAt);
    if (!prior || (rowCreatedAt && priorCreatedAt && rowCreatedAt.getTime() > priorCreatedAt.getTime()) || (rowCreatedAt && priorCreatedAt && rowCreatedAt.getTime() === priorCreatedAt.getTime() && row.id > prior.id)) latestByRequest.set(row.referralRequestId, row);
  }
  const result = new Map<number, AskInviteMine>();
  for (const [requestId, row] of Array.from(latestByRequest.entries())) {
    const createdAt = dateOf(row.createdAt);
    const expiresAt = dateOf(row.expiresAt);
    if (!createdAt || !expiresAt) continue;
    const reservationExpiresAt = row.reservationExpiresAt ? dateOf(row.reservationExpiresAt) : undefined;
    const reservationEnded = row.status === "claimed" && (!reservationExpiresAt || reservationExpiresAt.getTime() <= nowMs);
    const state: AskInviteStatus = (row.status === "active" && expiresAt.getTime() <= nowMs) || reservationEnded ? "expired" : row.status;
    const safe = askInviteMineSchema.safeParse({ state, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() });
    if (safe.success) result.set(requestId, safe.data);
  }
  return result;
}

export type AskInviteLandingResult = { invite: AskInviteLanding; requestId: number; linkId: number };
export type AskInviteClaimResult = { outcome: AskInviteClaimOutcome; claimedNow: boolean; requestId: number; linkId: number };

function waitingForCoverage(ask: { status: string; waitingForCoverage: boolean; referrerId: number | null }): boolean {
  return ask.status === "pending" && ask.waitingForCoverage && ask.referrerId === null;
}

function askInviteLandingState(link: { status: AskInviteStatus; expiresAt: Date | string; reservationExpiresAt: Date | string | null; claimedByUserId: number | null }, ask: { status: string; waitingForCoverage: boolean; referrerId: number | null }, viewerUserId: number | undefined, nowMs: number): AskInviteLanding["state"] {
  if (link.status === "revoked") return "revoked";
  if (!waitingForCoverage(ask)) return "closed";
  if (link.status === "expired") return "expired";
  if (link.status === "active") return (dateOf(link.expiresAt)?.getTime() ?? 0) <= nowMs ? "expired" : "open";
  if (link.status === "claimed") {
    const reservationEnd = link.reservationExpiresAt ? dateOf(link.reservationExpiresAt)?.getTime() : undefined;
    if (!reservationEnd || reservationEnd <= nowMs) return "expired";
    return viewerUserId !== undefined && viewerUserId === link.claimedByUserId ? "claimed_by_you" : "used";
  }
  return "closed";
}

/** Hash-only landing lookup. Public visitors receive role/company facts; private ask context is same-domain and allow-listed. */
export async function getAskInviteLanding(token: string, viewerUserId?: number, nowMs = Date.now()): Promise<AskInviteLandingResult | undefined> {
  if (!ASK_INVITE_TOKEN_PATTERN.test(token)) return undefined;
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [row] = await db.select({ link: askInviteLinks, ask: referralRequests, companyDomain: jobs.company, roleTitle: jobs.title, jobFunction: jobs.jobFunction, workMode: jobs.workMode, location: jobs.location })
    .from(askInviteLinks).innerJoin(referralRequests, eq(referralRequests.id, askInviteLinks.referralRequestId)).innerJoin(jobs, eq(jobs.id, referralRequests.jobId))
    .where(eq(askInviteLinks.linkTokenHash, hashAskInviteToken(token))).limit(1);
  if (!row) return undefined;

  if (viewerUserId !== undefined) {
    const blocked = await blockedCounterpartsFailOpen(db, viewerUserId, [row.ask.jobSeekerId], "ask_invite_landing");
    if (blocked.has(row.ask.jobSeekerId)) return undefined;
  }

  let companyName = row.companyDomain;
  try {
    const [identity] = await db.select({ name: companies.name }).from(companyDomains).innerJoin(companies, eq(companies.id, companyDomains.companyId)).where(eq(companyDomains.domain, row.companyDomain)).limit(1);
    if (identity?.name) companyName = identity.name;
  } catch (error) {
    captureServerError(error, { area: "ask_invite_company_identity" });
  }

  const state = askInviteLandingState(row.link, row.ask, viewerUserId, nowMs);
  let note: string | null = null;
  let lockedFileCount: number | null = null;
  if (viewerUserId !== undefined && viewerUserId !== row.ask.jobSeekerId && (state === "open" || state === "claimed_by_you")) {
    const [profile] = await db.select({ accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt }).from(profiles).where(eq(profiles.userId, viewerUserId)).limit(1);
    if (profile && isVerifiedEmployeeOfCompany(profile, row.companyDomain)) {
      note = row.ask.personalPitch ?? null;
      try {
        const [attachments] = await db.select({ total: count(referralAttachments.id) }).from(referralAttachments).where(eq(referralAttachments.referralRequestId, row.ask.id));
        lockedFileCount = Number(attachments?.total ?? 0);
      } catch (error) {
        captureServerError(error, { area: "ask_invite_attachment_count", requestId: row.ask.id, linkId: row.link.id });
      }
    }
  }
  const invite = askInviteLandingSchema.parse({ state, companyName, roleTitle: row.roleTitle, jobFunction: row.jobFunction, workMode: row.workMode, location: row.location, note, lockedFileCount });
  return { invite, requestId: row.ask.id, linkId: row.link.id };
}

async function recordClaimOutcome(userId: number, action: string, requestId: number, linkId: number, outcome: AskInviteClaimOutcome): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.insert(operationalActivityLogs).values({ actorUserId: userId, action, outcome: "success", resourceType: "ask_invite", resourceId: String(linkId), metadata: JSON.stringify({ requestId, linkId, outcome }) });
  } catch (error) {
    captureServerError(error, { area: "ask_invite_activity", action, requestId, linkId });
  }
}

/** Claims a one-time link under ask → invite row locks, then asks the existing delivery path to spend/hold/reserve. */
export async function claimAskInvite(token: string, userId: number, nowMs = Date.now()): Promise<AskInviteClaimResult> {
  if (!ASK_INVITE_TOKEN_PATTERN.test(token) || !Number.isSafeInteger(userId) || userId <= 0) throw new AskInviteClaimError("not_available");
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const tokenHash = hashAskInviteToken(token);
  const [lookup] = await db.select({ requestId: askInviteLinks.referralRequestId }).from(askInviteLinks).where(eq(askInviteLinks.linkTokenHash, tokenHash)).limit(1);
  if (!lookup) throw new AskInviteClaimError("not_available");

  const claimed = await db.transaction(async tx => {
    // This first locking read serializes claims, delivery, withdrawal and expiry on the ask row.
    const [joined] = await tx.select({ ask: referralRequests, companyDomain: jobs.company }).from(referralRequests).innerJoin(jobs, eq(jobs.id, referralRequests.jobId)).where(eq(referralRequests.id, lookup.requestId)).limit(1).for("update");
    if (!joined) throw new AskInviteClaimError("not_available");
    const [inviteRow] = await tx.select({ link: askInviteLinks }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, lookup.requestId), eq(askInviteLinks.linkTokenHash, tokenHash))).limit(1).for("update");
    if (!inviteRow) throw new AskInviteClaimError("not_available");
    const ask = joined.ask;
    const link = inviteRow.link;
    const blocked = await blockedCounterpartsFailOpen(tx, userId, [ask.jobSeekerId], "ask_invite_claim");
    if (blocked.has(ask.jobSeekerId)) throw new AskInviteClaimError("not_available");
    if (ask.jobSeekerId === userId) throw new AskInviteClaimError("company_email_required");

    const isWaiting = waitingForCoverage(ask);
    const stillAssignedToUser = ask.status === "pending" && !ask.waitingForCoverage && ask.referrerId === userId;
    if (link.status === "delivered") {
      if (link.claimedByUserId === userId && stillAssignedToUser) return { requestId: ask.id, linkId: link.id, claimedNow: false, alreadyDelivered: true };
      if (link.claimedByUserId === userId) throw new AskInviteClaimError("ask_unavailable");
      throw new AskInviteClaimError("link_used");
    }
    if (link.status === "claimed" && !isWaiting && link.claimedByUserId === userId && stillAssignedToUser) return { requestId: ask.id, linkId: link.id, claimedNow: false, alreadyDelivered: true };
    if (link.status === "claimed") {
      const reservationEnd = link.reservationExpiresAt ? dateOf(link.reservationExpiresAt)?.getTime() : undefined;
      if (!reservationEnd || reservationEnd <= nowMs) throw new AskInviteClaimError("link_expired");
      if (link.claimedByUserId !== userId) throw new AskInviteClaimError("link_used");
      if (!isWaiting) throw new AskInviteClaimError("ask_unavailable");
      return { requestId: ask.id, linkId: link.id, claimedNow: false, alreadyDelivered: false };
    }
    if (!isWaiting) throw new AskInviteClaimError("ask_unavailable");
    if (link.status === "revoked") throw new AskInviteClaimError("link_revoked");
    if (link.status === "expired" || (dateOf(link.expiresAt)?.getTime() ?? 0) <= nowMs) throw new AskInviteClaimError("link_expired");

    // Read eligibility after ask/link locks but do not take a profile lock here: the bulk handoff holds
    // profiles before individual asks. The final delivery rechecks this profile under its existing lock.
    const [profile] = await tx.select({ accountType: profiles.accountType, workEmailDomain: profiles.workEmailDomain, workEmailVerifiedAt: profiles.workEmailVerifiedAt, paused: profiles.paused, userSuspended: users.suspended, personSuspended: canonicalPeople.suspended })
      .from(profiles).innerJoin(users, eq(users.id, profiles.userId)).leftJoin(canonicalPeople, eq(canonicalPeople.id, users.canonicalPersonId)).where(eq(profiles.userId, userId)).limit(1);
    if (!profile || !isVerifiedEmployeeOfCompany(profile, joined.companyDomain)) throw new AskInviteClaimError("company_email_required");
    if (profile.paused || profile.userSuspended || profile.personSuspended === true) throw new AskInviteClaimError("referrer_unavailable");

    const claimedAt = new Date(nowMs);
    const reservationExpiresAt = new Date(nowMs + ASK_INVITE_RESERVATION_MS);
    const updated = await tx.update(askInviteLinks).set({ status: "claimed", claimedByUserId: userId, claimedAt, reservationExpiresAt, activeRequestKey: null }).where(and(eq(askInviteLinks.id, link.id), eq(askInviteLinks.status, "active"), gt(askInviteLinks.expiresAt, claimedAt)));
    if (Number(updated[0]?.affectedRows ?? 0) !== 1) throw new AskInviteClaimError("link_used");
    await tx.insert(operationalActivityLogs).values({ actorUserId: userId, action: "ask_invite.claimed", outcome: "success", resourceType: "ask_invite", resourceId: String(link.id), metadata: JSON.stringify({ requestId: ask.id, linkId: link.id, outcome: "claimed" }) });
    return { requestId: ask.id, linkId: link.id, claimedNow: true, alreadyDelivered: false };
  });

  if (claimed.alreadyDelivered) return { outcome: "delivered", claimedNow: false, requestId: claimed.requestId, linkId: claimed.linkId };
  const delivery = await tryDeliverWaitingAsk(claimed.requestId, nowMs);
  let outcome: AskInviteClaimOutcome;
  if (delivery.outcome === "delivered") outcome = "delivered";
  else if (delivery.outcome === "held") outcome = "held";
  else if (delivery.outcome === "settled") {
    const [currentAsk] = await db.select({ referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, claimed.requestId)).limit(1);
    if (currentAsk?.referrerId !== userId) throw new AskInviteClaimError("ask_unavailable");
    outcome = "delivered";
  } else outcome = "reserved";

  if (claimed.claimedNow && outcome !== "delivered") await recordClaimOutcome(userId, outcome === "held" ? "ask_invite.held" : "ask_invite.reserved", claimed.requestId, claimed.linkId, outcome);
  return { outcome, claimedNow: claimed.claimedNow, requestId: claimed.requestId, linkId: claimed.linkId };
}
