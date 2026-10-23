/**
 * D-090 BYOR server core: the one-time link a seeker sends to an insider they
 * already know. Only the token's SHA-256 is ever stored, and the raw token leaves
 * the server exactly once, in the 201 that creates it.
 *
 * Behind `BYOR_LINK_ENABLED` (off, D-097): with the flag off every route answers
 * 404 before any database read.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import {
  ASK_INVITE_TOKEN_BYTES,
  ASK_INVITE_TTL_MS,
  ASK_INVITE_WEEKLY_CAP,
  ASK_INVITE_WEEKLY_WINDOW_MS,
  askInviteActiveRequestKey,
  askInviteMineSchema,
  type AskInviteMine,
  type AskInviteStatus,
} from "../shared/askInvites";
import { askInviteLinks, referralRequests } from "../drizzle/schema";
import { getDb } from "./db";

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
  createdAt: Date;
  expiresAt: Date;
  closedAt: Date | null;
};

export type AskInviteListRecord = Pick<AskInviteLinkRecord, "id" | "referralRequestId" | "createdByUserId" | "status" | "createdAt" | "expiresAt">;
export type NewAskInviteRecord = Omit<AskInviteLinkRecord, "id">;

/** Narrow repository seam makes the lock order and business limits testable without a live MySQL server. */
export interface AskInviteTransaction {
  getAskForUpdate(requestId: number): Promise<AskInviteRequestRecord | undefined>;
  getActiveInviteForUpdate(requestId: number, userId: number): Promise<AskInviteLinkRecord | undefined>;
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
        const [row] = await tx.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, linkTokenHash: askInviteLinks.linkTokenHash, status: askInviteLinks.status, activeRequestKey: askInviteLinks.activeRequestKey, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt, closedAt: askInviteLinks.closedAt }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, requestId), eq(askInviteLinks.createdByUserId, userId), eq(askInviteLinks.status, "active"), eq(askInviteLinks.activeRequestKey, askInviteActiveRequestKey(requestId)))).limit(1).for("update");
        return row;
      },
      getLatestInviteForUpdate: async (requestId, userId) => {
        const [row] = await tx.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, linkTokenHash: askInviteLinks.linkTokenHash, status: askInviteLinks.status, activeRequestKey: askInviteLinks.activeRequestKey, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt, closedAt: askInviteLinks.closedAt }).from(askInviteLinks).where(and(eq(askInviteLinks.referralRequestId, requestId), eq(askInviteLinks.createdByUserId, userId))).orderBy(desc(askInviteLinks.createdAt), desc(askInviteLinks.id)).limit(1).for("update");
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
    return db.select({ id: askInviteLinks.id, referralRequestId: askInviteLinks.referralRequestId, createdByUserId: askInviteLinks.createdByUserId, status: askInviteLinks.status, createdAt: askInviteLinks.createdAt, expiresAt: askInviteLinks.expiresAt }).from(askInviteLinks).where(and(eq(askInviteLinks.createdByUserId, userId), inArray(askInviteLinks.referralRequestId, ids))).orderBy(desc(askInviteLinks.createdAt), desc(askInviteLinks.id));
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
    const state: AskInviteStatus = row.status === "active" && expiresAt.getTime() <= nowMs ? "expired" : row.status;
    const safe = askInviteMineSchema.safeParse({ state, createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString() });
    if (safe.success) result.set(requestId, safe.data);
  }
  return result;
}
