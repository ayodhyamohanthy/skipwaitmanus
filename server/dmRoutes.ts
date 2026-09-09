import express, { type Express, type Request } from "express";
import { dmRecipientExists, dmThreadExists, hasActivePremiumSubscription, isMutualFollow, listDmThread, listDmThreads, sendDirectMessage } from "./db";

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
  hasActivePremiumSubscription?: typeof hasActivePremiumSubscription;
  isMutualFollow?: typeof isMutualFollow;
};

const DM_RATE_LIMIT_PER_HOUR = 30;
const UPGRADE_ERROR = "Direct messaging is a premium feature. Upgrade to Pro to message referrers directly.";

export function registerDmRoutes(app: Express, deps: DmRouteDeps) {
  const record = (input: Parameters<NonNullable<typeof deps.recordActivity>>[0]) => { void deps.recordActivity?.(input).catch(() => undefined); };
  const listThreads = deps.listDmThreads ?? listDmThreads;
  const listThread = deps.listDmThread ?? listDmThread;
  const send = deps.sendDirectMessage ?? sendDirectMessage;
  const threadExists = deps.dmThreadExists ?? dmThreadExists;
  const recipientExists = deps.dmRecipientExists ?? dmRecipientExists;
  const hasPremium = deps.hasActivePremiumSubscription ?? hasActivePremiumSubscription;
  const mutualFollow = deps.isMutualFollow ?? isMutualFollow;

  app.get("/api/dms/compose/:userId", async (req, res) => {
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to message referrers directly" });
      const counterpartUserId = Number(req.params.userId);
      if (!Number.isInteger(counterpartUserId) || counterpartUserId <= 0) return res.status(400).json({ error: "Invalid member" });
      if (counterpartUserId === identity.account.id) return res.status(400).json({ error: "You cannot message yourself" });
      if (!(await recipientExists(counterpartUserId))) return res.status(404).json({ error: "This member is not available" });
      const existing = await threadExists(identity.account.id, counterpartUserId);
      const isMutual = await mutualFollow(identity.account.id, counterpartUserId);
      const allowed = existing || isMutual || (await hasPremium(identity.account.id));
      res.set("Cache-Control", "private, no-store");
      res.json({ allowed, upgradeRequired: !allowed, threadExists: existing, mutualFollow: isMutual });
    } catch { res.status(500).json({ error: "We could not check direct messaging" }); }
  });

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
      res.set("Cache-Control", "private, no-store");
      res.json({ thread });
    } catch { res.status(500).json({ error: "We could not open this conversation" }); }
  });

  app.post("/api/dms/threads/:userId", async (req, res) => {
    const counterpartUserId = Number(req.params.userId);
    let actorUserId: number | undefined;
    try {
      const identity = await deps.resolveIdentity(req);
      if (!identity) return res.status(401).json({ error: "Sign in to send a direct message" });
      actorUserId = identity.account.id;
      if (!Number.isInteger(counterpartUserId) || counterpartUserId <= 0) return res.status(400).json({ error: "Invalid member" });
      if (counterpartUserId === identity.account.id) return res.status(400).json({ error: "You cannot message yourself" });
      const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
      if (!body) return res.status(400).json({ error: "Write a message before sending" });
      if (body.length > 3000) return res.status(400).json({ error: "Messages can be up to 3,000 characters" });
      if (!(await recipientExists(counterpartUserId))) return res.status(404).json({ error: "This member is not available" });
      const existing = await threadExists(actorUserId, counterpartUserId);
      if (!existing && !(await hasPremium(actorUserId)) && !(await mutualFollow(actorUserId, counterpartUserId))) {
        record({ actorUserId, action: "dm.sent", outcome: "denied", resourceType: "direct_message", metadata: { reason: "premium_required" } });
        return res.status(402).json({ error: UPGRADE_ERROR, upgrade: true });
      }
      const recentCount = deps.countRecentMessagesBySender ? await deps.countRecentMessagesBySender(actorUserId, new Date(Date.now() - 60 * 60 * 1000)) : 0;
      if (recentCount >= DM_RATE_LIMIT_PER_HOUR) {
        record({ actorUserId, action: "dm.rate_limited", outcome: "denied", resourceType: "direct_message" });
        return res.status(429).json({ error: "You're sending messages too quickly. Try again in a few minutes." });
      }
      const message = await send(actorUserId, counterpartUserId, body);
      record({ actorUserId, action: "dm.sent", outcome: "success", resourceType: "direct_message", metadata: { bodyLength: body.length, threadStarted: !existing } });
      res.status(201).json({ message });
    } catch (error) {
      const message = error instanceof Error ? error.message : "We could not send this direct message";
      record({ actorUserId, action: "dm.sent", outcome: "failure", resourceType: "direct_message" });
      res.status(500).json({ error: message });
    }
  });
}
