import { retryAfterSecondsUntil, setRetryAfter } from "./retryAfter";
import { refuseReviewerExternalAction } from "./_core/reviewerLogin";
import express, { type Express, type Request } from "express";
import { DM_FOLLOW_REQUIRED, dmSendBlockFor, type DmFollowRequired, type DmSendBlock, type ReferrerDmGate } from "../shared/directMessages";
import { DirectMessageFollowRequiredError, dmRecipientExists, dmThreadExists, getDb, isMutualFollow, listDmThread, listDmThreads, sendDirectMessage } from "./db";
import { DirectMessageReferrerGateError, loadReferrerDmGate } from "./dmReferrerGate";
import { DM_REFUSAL_LIMITED_REASON, DM_REFUSAL_LIMIT_ERROR, DM_REFUSAL_WINDOW_MS, DM_SEND_ACTION, countRecentDmRefusals, isDmRefusalLimited } from "./dmRefusalLimit";

type Account = { id: number; openId: string; role?: "user" | "admin" };
type EmailAddress = { emailAddress: string; verification?: { status?: string } | null };
type Identity = { account: Account; primaryEmail?: EmailAddress | null; emailAddresses?: EmailAddress[] };

export type DmRouteDeps = {
  resolveIdentity: (req: Request) => Promise<Identity | undefined>;
  countRecentMessagesBySender?: (userId: number, since: Date) => Promise<number>;
  recordActivity?: (input: { actorUserId?: number; action: string; outcome: "success" | "failure" | "denied"; resourceType?: string; resourceId?: string | number; metadata?: Record<string, string | number | boolean | null | undefined> }) => Promise<void>;
  listDmThreads?: typeof listDmThreads;
  listDmThread?: typeof listDmThread;
  sendDirectMessage?: typeof sendDirectMessage;
  dmThreadExists?: typeof dmThreadExists;
  dmRecipientExists?: typeof dmRecipientExists;
  /** Two members who are not verified referrers need an existing thread or this (D-067: no plan opens a thread). */
  isMutualFollow?: typeof isMutualFollow;
  /** D-012(3): when a verified referrer is involved, sending opens only after they accepted a request linking the two. */
  referrerDmGate?: (senderUserId: number, recipientUserId: number) => Promise<ReferrerDmGate>;
  /** Refused sends by this sender in the last hour (server/dmRefusalLimit.ts). */
  countRecentDmRefusals?: (senderUserId: number) => Promise<number>;
};

const DM_RATE_LIMIT_PER_HOUR = 30;

async function readReferrerDmGate(senderUserId: number, recipientUserId: number): Promise<ReferrerDmGate> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return loadReferrerDmGate(db, senderUserId, recipientUserId);
}

async function readRecentDmRefusals(senderUserId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  return countRecentDmRefusals(db, senderUserId);
}

export function registerDmRoutes(app: Express, deps: DmRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const listThreads = deps.listDmThreads ?? listDmThreads;
  const listThread = deps.listDmThread ?? listDmThread;
  const send = deps.sendDirectMessage ?? sendDirectMessage;
  const threadExists = deps.dmThreadExists ?? dmThreadExists;
  const recipientExists = deps.dmRecipientExists ?? dmRecipientExists;
  const mutualFollow = deps.isMutualFollow ?? isMutualFollow;
  const referrerGate = deps.referrerDmGate ?? readReferrerDmGate;
  const recentRefusals = deps.countRecentDmRefusals ?? readRecentDmRefusals;

  // GET /api/dms/compose/:userId is retired (D-012 item 3 review): no client
  // reads it, and its "allowed" answer told any member, without
  // sending anything, whether a user ID has a verified work email.

  app.get("/api/dms/threads", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to see your direct messages" });
      const threads = await listThreads(identity.account.id);
      res.set("Cache-Control", "private, no-store");
      res.json({ threads });
    } catch { res.status(500).json({ error: "We could not load your direct messages" }); }
  });

  app.get("/api/dms/threads/:userId", async (req, res) => {
    const counterpartUserId = Number(req.params.userId);
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to open your direct messages" });
      if (!Number.isInteger(counterpartUserId) || counterpartUserId <= 0) return res.status(400).json({ error: "Invalid member" });
      if (counterpartUserId === identity.account.id) return res.status(400).json({ error: "You cannot message yourself" });
      const thread = await listThread(identity.account.id, counterpartUserId);
      if (!thread) return res.status(404).json({ error: "No direct messages with this member yet" });
      const gate = await referrerGate(identity.account.id, counterpartUserId);
      res.set("Cache-Control", "private, no-store");
      res.json({ thread, sendBlock: dmSendBlockFor(gate) });
    } catch { res.status(500).json({ error: "We could not open this conversation" }); }
  });

  app.post("/api/dms/threads/:userId", async (req, res) => {
    const counterpartUserId = Number(req.params.userId);
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (refuseReviewerExternalAction(res, identity?.account?.openId)) return;
      if (!identity) return res.status(401).json({ error: "Sign in to send a direct message" });
      actorUserId = identity.account.id;
      if (!Number.isInteger(counterpartUserId) || counterpartUserId <= 0) return res.status(400).json({ error: "Invalid member" });
      if (counterpartUserId === identity.account.id) return res.status(400).json({ error: "You cannot message yourself" });
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      const idempotencyKey=typeof req.get("Idempotency-Key")==="string"?req.get("Idempotency-Key")!.trim():"";
      if (!/^[\x21-\x7E]{16,64}$/.test(idempotencyKey)) return res.status(428).json({error:"A valid Idempotency-Key header is required"});
      if (!body) return res.status(400).json({ error: "Write a message before sending" });
      if (body.length > 3000) return res.status(400).json({ error: "Messages can be up to 3,000 characters" });
      if (!(await recipientExists(counterpartUserId))) return res.status(404).json({ error: "This member is not available" });
      const senderUserId = actorUserId;
      // Both refusals are a 403 told apart by their reason (referrer involved, or the member
      // rules); past the hourly refusal limit they look the same.
      const refuse = async (refusal: DmSendBlock | DmFollowRequired) => {
        if (isDmRefusalLimited(await recentRefusals(senderUserId))) {
          record({ actorUserId: senderUserId, action: DM_SEND_ACTION, outcome: "denied", resourceType: "direct_message", metadata: { reason: DM_REFUSAL_LIMITED_REASON } });
          const retryAt = new Date(Date.now() + DM_REFUSAL_WINDOW_MS);
          setRetryAfter(res, retryAfterSecondsUntil(retryAt.getTime(), Date.now()));
          return res.status(429).json({ error: DM_REFUSAL_LIMIT_ERROR, retryAt });
        }
        record({ actorUserId: senderUserId, action: DM_SEND_ACTION, outcome: "denied", resourceType: "direct_message", metadata: { reason: refusal.reason } });
        return res.status(403).json(refusal);
      };
      const gate = await referrerGate(actorUserId, counterpartUserId);
      const block = dmSendBlockFor(gate);
      if (block) return await refuse(block);
      const existing = await threadExists(actorUserId, counterpartUserId);
      if (gate.kind === "not_referrer_pair" && !existing && !(await mutualFollow(actorUserId, counterpartUserId))) return await refuse(DM_FOLLOW_REQUIRED);
      if (deps.countRecentMessagesBySender) { const legacyCount=await deps.countRecentMessagesBySender(actorUserId,new Date(Date.now()-3600_000)); if(legacyCount>=DM_RATE_LIMIT_PER_HOUR)return res.status(429).json({error:"You're sending messages too quickly. Try again in a few minutes."}); }
      const message = await send(actorUserId, counterpartUserId, body, idempotencyKey);
      record({ actorUserId, action: "dm.sent", outcome: "success", resourceType: "direct_message", metadata: { bodyLength: body.length, threadStarted: !existing } });
      res.status(message.replayed?200:201).json({ message });
    } catch (error) {
      if (error instanceof DirectMessageReferrerGateError || error instanceof DirectMessageFollowRequiredError) {
        record({ actorUserId, action: "dm.sent", outcome: "denied", resourceType: "direct_message", metadata: { reason: error.block.reason } });
        return res.status(403).json(error.block);
      }
      const message = error instanceof Error ? error.message : "We could not send this direct message";
      record({ actorUserId, action: "dm.sent", outcome: "failure", resourceType: "direct_message" });
      const retryAt=typeof error==="object"&&error!==null&&"retryAt" in error?(error as {retryAt:Date}).retryAt:undefined;
      if(error instanceof Error&&error.name==="DirectMessageRateLimitError"&&retryAt instanceof Date)setRetryAfter(res,retryAfterSecondsUntil(retryAt.getTime(),Date.now()));
      res.status(error instanceof Error&&error.name==="DirectMessageRateLimitError"?429:error instanceof Error&&error.name==="DirectMessageConflictError"?409:/not available/i.test(message)?404:500).json({ error: message, ...(retryAt?{retryAt}: {}) });
    }
  });
}
