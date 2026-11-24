// SKIPPY-6 (D-290 (1), D-142): a seeker's own agent may only *request* a send.
//
// The request lands in the existing assistantApprovals queue with `grantId`
// set. Nothing is sent and nothing is spent until the seeker approves it in
// their own session. This module is that approve path for agent-requested
// rows; every other approval (and every decline) keeps the queue's existing
// behaviour through decideAssistantApproval.
//
// The ask itself runs through the same createCompanyReferralRequest the in-app
// form uses (D-137), so the company check, the credit rules, the waiting-ask
// hold and the refund rules are the ones the product already has.
import { and, eq, gte } from "drizzle-orm";
import { assistantApprovals, askOrigins, seekerAgentControls, seekerAgentGrants, seekerAgentEvents } from "../drizzle/schema";
import { isApprovalExpired } from "../shared/assistant";
import {
  AGENT_ERROR,
  AGENT_SEND_DAILY_CAP,
  AGENT_SEND_HOURLY_CAP,
  AGENT_SEND_PER_REQUEST_CEILING,
} from "../shared/seekerAgents";
import { quoteApprovalCost } from "./assistantApprovalCost";
import { listCompanyDirectory } from "./companyDirectory";
import { createCompanyReferralRequest, decideAssistantApproval, getDb, listMyUnattachedResumes } from "./db";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type AgentSendRefusalCode = "grant" | "limit" | "cost" | "company" | "resume" | "needs_referrals";

/** A refusal the seeker can act on. The route maps each code to a plain answer. */
export class AgentSendRefusal extends Error {
  constructor(message: string, readonly code: AgentSendRefusalCode) {
    super(message);
    this.name = "AgentSendRefusal";
  }
}

export type AgentSendApprovalDeps = {
  getDb: typeof getDb;
  quoteCost: (targetRoleUrl: string) => { level: number; cost: number };
  createRequest: typeof createCompanyReferralRequest;
  listCompanies: typeof listCompanyDirectory;
  listResumes: typeof listMyUnattachedResumes;
  decidePlain: typeof decideAssistantApproval;
  now: () => number;
};

const defaultDeps: AgentSendApprovalDeps = {
  getDb,
  quoteCost: quoteApprovalCost,
  createRequest: createCompanyReferralRequest,
  listCompanies: listCompanyDirectory,
  listResumes: listMyUnattachedResumes,
  decidePlain: decideAssistantApproval,
  now: Date.now,
};

type ApprovalRow = typeof assistantApprovals.$inferSelect;

const parseIds = (raw: string | null): number[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0) : [];
  } catch { return []; }
};

/**
 * The queue's decision route, with the agent-send path in front of it.
 * `attachmentIds` is the resume the seeker chose on the card; without one the
 * most recent unattached resume is used, exactly as the card's default shows.
 */
export async function decideAssistantApprovalWithAgentSend(
  userId: number,
  approvalId: number,
  decision: "approved" | "declined",
  options: { attachmentIds?: number[]; actor?: "seeker" | "agent_auto" } = {},
  deps: AgentSendApprovalDeps = defaultDeps,
) {
  const db = await deps.getDb();
  if (!db) throw new Error("Database unavailable");
  const row = (await db.select().from(assistantApprovals).where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.userId, userId))).limit(1))[0];
  if (!row) throw new Error("This approval is not in your account");
  // Seeker-initiated approvals, and every decline, keep today's path exactly.
  if (row.grantId == null || decision === "declined") return deps.decidePlain(userId, approvalId, decision);
  return approveAgentSend({ userId, approvalId, row, grantId: row.grantId, chosen: options.attachmentIds, actor: options.actor ?? "seeker", deps });
}

async function approveAgentSend(input: { userId: number; approvalId: number; row: ApprovalRow; grantId: number; chosen?: number[]; actor?: "seeker" | "agent_auto"; deps: AgentSendApprovalDeps }) {
  const { userId, approvalId, row, grantId, actor = "seeker", deps } = input;
  const nowMs = deps.now();
  if (row.status !== "pending") throw new Error("This approval was already handled");
  // The queue's own expiry retires a waiting row with nothing spent (#644).
  if (isApprovalExpired(row.expiresAt.getTime(), nowMs)) return deps.decidePlain(userId, approvalId, "approved");

  const targetRoleUrl = row.targetRoleUrl;
  if (!targetRoleUrl) throw new AgentSendRefusal("This request has no job link", "company");
  // Re-quote with the same functions the charge uses; a changed cost is refused
  // before anything moves (the S-3 rule).
  const quote = deps.quoteCost(targetRoleUrl);
  if (row.creditCount != null && quote.cost !== row.creditCount) throw new AgentSendRefusal("The cost changed. Nothing was spent.", "cost");
  if (quote.cost > AGENT_SEND_PER_REQUEST_CEILING) throw new AgentSendRefusal(AGENT_ERROR.creditLimit, "limit");

  // The company the agent drafted for, so a link outside its domains fails
  // exactly as it does on the company page.
  const domain = (row.companyDomain ?? "").trim().toLowerCase();
  const directory = await deps.listCompanies();
  const company = domain ? directory.companies.find(entry => entry.domains.some(value => value.trim().toLowerCase() === domain)) : undefined;
  if (!company) throw new AgentSendRefusal("Choose a company from the list", "company");

  const db = await deps.getDb();
  if (!db) throw new Error("Database unavailable");
  const now = new Date(nowMs);

  // One transaction for the limit check: the grant row lock serializes two
  // concurrent approvals of this grant, so neither can pass the caps the other
  // is about to use.
  const grant = await db.transaction(async tx => {
    const locked = (await tx.select().from(seekerAgentGrants).where(eq(seekerAgentGrants.id, grantId)).limit(1).for("update"))[0];
    if (!locked || locked.userId !== userId) throw new AgentSendRefusal(AGENT_ERROR.revoked, "grant");
    if (locked.revokedAt) throw new AgentSendRefusal(AGENT_ERROR.revoked, "grant");
    if (locked.expiresAt.getTime() <= nowMs) throw new AgentSendRefusal(AGENT_ERROR.expired, "grant");
    if (!locked.canSend) throw new AgentSendRefusal(AGENT_ERROR.sendScope, "grant");
    const control = (await tx.select({ pausedAt: seekerAgentControls.pausedAt }).from(seekerAgentControls).where(eq(seekerAgentControls.userId, userId)).limit(1))[0];
    if (control?.pausedAt != null) throw new AgentSendRefusal(AGENT_ERROR.paused, "grant");
    // The caps count this grant's approved sends. Selecting the rows (at most a
    // day's cap) keeps the check readable and lets a fixture evaluate it without
    // a SQL aggregate.
    const sentSince = async (since: Date) => (await tx.select({ id: assistantApprovals.id }).from(assistantApprovals)
      .where(and(eq(assistantApprovals.grantId, grantId), eq(assistantApprovals.status, "approved"), gte(assistantApprovals.decidedAt, since)))).length;
    const hourly = await sentSince(new Date(nowMs - HOUR_MS));
    const daily = await sentSince(new Date(nowMs - DAY_MS));
    if (hourly >= AGENT_SEND_HOURLY_CAP || daily >= AGENT_SEND_DAILY_CAP) throw new AgentSendRefusal(AGENT_ERROR.sendLimit, "limit");
    const marked = await tx.update(assistantApprovals).set({ status: "approved", decidedAt: now, decidedBy: actor })
      .where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.status, "pending")));
    if (Number(marked[0]?.affectedRows) !== 1) throw new Error("This approval was already handled");
    return locked;
  });

  // The seeker's chosen resume, else their most recent one (the card's default).
  let ids = (input.chosen ?? []).filter(value => Number.isInteger(value) && value > 0);
  if (!ids.length) ids = parseIds(row.attachmentIds);
  if (!ids.length) {
    const resumes = await deps.listResumes(userId);
    if (resumes[0]) ids = [resumes[0].id];
  }
  if (!ids.length) {
    await revertToPending(db, approvalId);
    throw new AgentSendRefusal("Add a resume before you approve this send", "resume");
  }

  try {
    const created = await deps.createRequest(userId, {
      selectedCompany: { name: company.name, domains: [...company.domains] },
      targetRoleUrl,
      personalPitch: row.note?.trim() || "No personal note was included with this referral request.",
      attachmentIds: ids,
      idempotencyKey: row.idempotencyKey ?? `agent-draft-${approvalId}`,
    });
    // D-142: the referrer sees "Sent via the seeker's assistant" for this ask.
    await db.insert(askOrigins).values({ referralRequestId: created.requestId, channel: "agent", agentGrantId: grant.id })
      .onDuplicateKeyUpdate({ set: { channel: "agent", agentGrantId: grant.id } });
    await db.update(assistantApprovals).set({ executedRequestId: created.requestId }).where(eq(assistantApprovals.id, approvalId));
    await db.insert(seekerAgentEvents).values({ userId, grantId: grant.id, agentName: grant.name, action: "agent.send_approved", outcome: "success", detail: `request ${created.requestId}` });
    return { id: approvalId, status: "approved" as const, requestId: created.requestId };
  } catch (error) {
    // Nothing was sent: the row goes back to waiting so the seeker can fix the
    // cause (add referrals, pick another resume) and approve again.
    await revertToPending(db, approvalId);
    const message = error instanceof Error ? error.message : "";
    await db.insert(seekerAgentEvents).values({ userId, grantId: grant.id, agentName: grant.name, action: "agent.send_approved", outcome: "failure", detail: message.slice(0, 500) }).catch(() => undefined);
    if (/no referral credit available/i.test(message)) throw new AgentSendRefusal(AGENT_ERROR.needsReferrals, "needs_referrals");
    throw error;
  }
}

async function revertToPending(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, approvalId: number) {
  await db.update(assistantApprovals).set({ status: "pending", decidedAt: null, decidedBy: null })
    .where(and(eq(assistantApprovals.id, approvalId), eq(assistantApprovals.status, "approved")));
}
