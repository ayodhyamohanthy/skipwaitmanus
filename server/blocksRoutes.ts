import { and, desc, eq, inArray, or } from "drizzle-orm";
import express, { type Express, type Request } from "express";
import { referralRequests, userBlocks, users } from "../drizzle/schema";
import { getDb } from "./db";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type Identity = { account: Account };

export type BlockEntry = { id: number; blockedUserId: number; reason: string | null; createdAt: Date };
export type BlockResult = { id: number; blockedUserId: number; created: boolean };

export type BlocksRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number }) => void | Promise<void>;
  blockUser?: (blockerUserId: number, blockedUserId: number, reason: string | null) => Promise<BlockResult>;
  unblockUser?: (blockerUserId: number, blockId: number) => Promise<{ unblocked: true }>;
  listBlocks?: (blockerUserId: number) => Promise<BlockEntry[]>;
  findCounterpart?: (userId: number, referralRequestId: number) => Promise<{ counterpartUserId: number }>;
};

function isDuplicateKeyError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ER_DUP_ENTRY";
}

async function defaultBlockUser(blockerUserId: number, blockedUserId: number, reason: string | null): Promise<BlockResult> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  if (blockedUserId === blockerUserId) throw new Error("You cannot block yourself");
  const target = (await db.select({ id: users.id }).from(users).where(eq(users.id, blockedUserId)).limit(1))[0];
  if (!target) throw new Error("This member is not available");
  const prior = (await db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId))).limit(1))[0];
  if (prior) return { id: prior.id, blockedUserId, created: false };
  try {
    const inserted = await db.insert(userBlocks).values({ blockerUserId, blockedUserId, reason });
    return { id: Number(inserted[0].insertId), blockedUserId, created: true };
  } catch (error) {
    // A concurrent first block can win the unique pair race; re-read so the
    // second writer still reports an idempotent re-block instead of a 500.
    if (!isDuplicateKeyError(error)) throw error;
    const winner = (await db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerUserId, blockerUserId), eq(userBlocks.blockedUserId, blockedUserId))).limit(1))[0];
    if (!winner) throw error;
    return { id: winner.id, blockedUserId, created: false };
  }
}

async function defaultUnblockUser(blockerUserId: number, blockId: number): Promise<{ unblocked: true }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.delete(userBlocks).where(and(eq(userBlocks.id, blockId), eq(userBlocks.blockerUserId, blockerUserId)));
  if (Number(result[0]?.affectedRows ?? 0) === 0) throw new Error("This block could not be found");
  return { unblocked: true };
}

async function defaultListBlocks(blockerUserId: number): Promise<BlockEntry[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: userBlocks.id, blockedUserId: userBlocks.blockedUserId, reason: userBlocks.reason, createdAt: userBlocks.createdAt }).from(userBlocks).where(eq(userBlocks.blockerUserId, blockerUserId)).orderBy(desc(userBlocks.createdAt)).limit(100);
}

async function defaultFindCounterpart(userId: number, referralRequestId: number): Promise<{ counterpartUserId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (await db.select({ jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId }).from(referralRequests).where(eq(referralRequests.id, referralRequestId)).limit(1))[0];
  if (!row || (row.jobSeekerId !== userId && row.referrerId !== userId)) throw new Error("This conversation is not available");
  const counterpart = userId === row.jobSeekerId ? row.referrerId : row.jobSeekerId;
  if (!counterpart) throw new Error("This conversation does not have another participant yet");
  return { counterpartUserId: counterpart };
}

/** Either direction counts: exported for later thread/inbox enforcement (not wired here). */
export async function isBlockedBetween(userA: number, userB: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db.select({ id: userBlocks.id }).from(userBlocks).where(or(and(eq(userBlocks.blockerUserId, userA), eq(userBlocks.blockedUserId, userB)), and(eq(userBlocks.blockerUserId, userB), eq(userBlocks.blockedUserId, userA)))).limit(1);
  return rows.length > 0;
}

/**
 * Batched block check for referral lists and thread guards. Returns the subset
 * of request ids where the other participant is blocked with the viewer, in
 * either direction. One extra query regardless of list size; caller filters.
 */
export async function getBlockedRequestIds(userId: number, requestIds: number[]): Promise<Set<number>> {
  const blocked = new Set<number>();
  const db = await getDb();
  if (!db) return blocked;
  const ids = Array.from(new Set(requestIds.filter(id => Number.isInteger(id) && id > 0))).slice(0, 200);
  if (ids.length === 0) return blocked;
  const [rows, blocks] = await Promise.all([
    db.select({ requestId: referralRequests.id, jobSeekerId: referralRequests.jobSeekerId, referrerId: referralRequests.referrerId }).from(referralRequests).where(inArray(referralRequests.id, ids)),
    db.select({ blockerUserId: userBlocks.blockerUserId, blockedUserId: userBlocks.blockedUserId }).from(userBlocks).where(or(eq(userBlocks.blockerUserId, userId), eq(userBlocks.blockedUserId, userId))).limit(500),
  ]);
  const blockedWith = new Set<number>();
  for (const block of blocks) blockedWith.add(block.blockerUserId === userId ? block.blockedUserId : block.blockerUserId);
  if (blockedWith.size === 0) return blocked;
  for (const row of rows) {
    const other = row.jobSeekerId === userId ? row.referrerId : row.jobSeekerId;
    if (other !== null && other !== undefined && blockedWith.has(other)) blocked.add(row.requestId);
  }
  return blocked;
}

export async function getThreadBlockStatus(userId: number, requestId: number): Promise<{ blocked: boolean }> {
  if (!Number.isInteger(requestId) || requestId <= 0) return { blocked: false };
  return { blocked: (await getBlockedRequestIds(userId, [requestId])).has(requestId) };
}

function toPositiveInt(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw.trim());
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

function parseReason(raw: unknown): { valid: true; value: string | null } | { valid: false } {
  if (raw === undefined || raw === null) return { valid: true, value: null };
  if (typeof raw !== "string") return { valid: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { valid: true, value: null };
  if (trimmed.length > 255) return { valid: false };
  return { valid: true, value: trimmed };
}

export function registerBlocksRoutes(app: Express, deps: BlocksRouteDeps) {
  const record = (input: Parameters<NonNullable<BlocksRouteDeps["recordActivity"]>>[0]) => {
    try {
      const result = deps.recordActivity?.(input);
      if (result instanceof Promise) result.catch(() => undefined);
    } catch { /* activity logging never breaks the request */ }
  };
  const doBlock = deps.blockUser ?? defaultBlockUser;
  const doUnblock = deps.unblockUser ?? defaultUnblockUser;
  const listMine = deps.listBlocks ?? defaultListBlocks;
  const findCounterpart = deps.findCounterpart ?? defaultFindCounterpart;

  app.post("/api/blocks", express.json(), async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to block members" });
      const body = (req.body ?? {}) as Record<string, unknown>;
      const hasBlockedKey = body.blockedUserId !== undefined && body.blockedUserId !== null;
      const hasReferralKey = body.referralRequestId !== undefined && body.referralRequestId !== null;
      if (!hasBlockedKey && !hasReferralKey) return res.status(400).json({ error: "Choose who to block" });
      if (hasBlockedKey && hasReferralKey) return res.status(400).json({ error: "Block by member or by conversation, not both" });
      const parsedReason = parseReason(body.reason);
      if (!parsedReason.valid) return res.status(400).json({ error: "Keep the reason under 255 characters" });
      let targetUserId: number | undefined;
      if (hasBlockedKey) {
        targetUserId = toPositiveInt(body.blockedUserId);
        if (targetUserId === undefined) return res.status(400).json({ error: "Invalid member" });
        if (targetUserId === identity.account.id) return res.status(400).json({ error: "You cannot block yourself" });
      } else {
        const referralRequestId = toPositiveInt(body.referralRequestId);
        if (referralRequestId === undefined) return res.status(400).json({ error: "Invalid conversation reference" });
        targetUserId = (await findCounterpart(identity.account.id, referralRequestId)).counterpartUserId;
      }
      const result = await doBlock(identity.account.id, targetUserId, parsedReason.value);
      record({ actorUserId: identity.account.id, action: "block.created", outcome: "success", resourceType: "user_block", resourceId: result.id });
      res.status(result.created ? 201 : 200).json({ blocked: true, created: result.created, id: result.id, blockedUserId: result.blockedUserId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not save this block";
      if (/cannot block yourself/i.test(message)) return res.status(400).json({ error: message });
      if (/another participant/i.test(message)) return res.status(400).json({ error: message });
      if (/not available|could not be found/i.test(message)) return res.status(404).json({ error: message });
      res.status(500).json({ error: "We could not save this block" });
    }
  });

  app.get("/api/blocks/mine", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to view your blocks" });
      res.set("Cache-Control", "private, no-store");
      res.json({ blocks: await listMine(identity.account.id) });
    } catch { res.status(500).json({ error: "We could not load your blocks" }); }
  });

  app.delete("/api/blocks/:id", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to manage blocks" });
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid block reference" });
      await doUnblock(identity.account.id, id);
      record({ actorUserId: identity.account.id, action: "block.removed", outcome: "success", resourceType: "user_block", resourceId: id });
      res.json({ unblocked: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not remove this block";
      if (/could not be found/i.test(message)) return res.status(404).json({ error: message });
      res.status(500).json({ error: "We could not remove this block" });
    }
  });
}
