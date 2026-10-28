import { and, eq, inArray } from "drizzle-orm";
import { assistantApprovals } from "../drizzle/schema";
import { isApprovalExpired } from "../shared/assistant";
import type { ApprovalCost } from "../shared/assistantApprovalCost";
import { assignJobLevel, creditsForLevel } from "../shared/jobLevel";
import { normalizeTargetRoleUrl } from "../shared/referralUrl";
import { askLevelCostEnabled, FLAT_ASK_COST, getDb } from "./db";

/**
 * #644: the compose screen's quote for a job link, with the functions GET
 * /api/company-referrals/quote uses, in the same order. assistantApprovalCost.test.ts
 * pins it to that route (through its deps) and to the executor's askCreditCost, so
 * the cost an owner approves is the cost createCompanyReferralRequest charges.
 */
export function quoteApprovalCost(targetRoleUrl: string): ApprovalCost {
  const level = assignJobLevel({ url: normalizeTargetRoleUrl(targetRoleUrl) }).level;
  return { level, cost: askLevelCostEnabled() ? creditsForLevel(level) : FLAT_ASK_COST };
}

export type ApprovalCostRow = {
  id: number;
  userId: number;
  kind: "ask_send" | "credit_spend";
  status: "pending" | "approved" | "declined" | "expired";
  expiresAt: Date;
  targetRoleUrl: string | null;
  idempotencyKey: string | null;
};

/**
 * Prices only what decideAssistantApproval charges on approve: the owner's own pending,
 * unexpired ask_send that carries its job link and idempotency key. Every other approval
 * charges nothing on approve, gets no cost, and is decided as before.
 */
export function approvalCostsFromRows(userId: number, rows: readonly ApprovalCostRow[], nowMs: number): Map<number, ApprovalCost> {
  const costs = new Map<number, ApprovalCost>();
  for (const row of rows) {
    if (row.userId !== userId || row.kind !== "ask_send" || row.status !== "pending") continue;
    if (isApprovalExpired(row.expiresAt.getTime(), nowMs) || !row.targetRoleUrl || !row.idempotencyKey) continue;
    costs.set(row.id, quoteApprovalCost(row.targetRoleUrl));
  }
  return costs;
}

/** One read scoped to the signed-in owner. Throws without a database, so a caller never charges on an unknown cost. */
export async function readApprovalCosts(userId: number, approvalIds: readonly number[], nowMs: number = Date.now()): Promise<Map<number, ApprovalCost>> {
  if (approvalIds.length === 0) return new Map();
  const db = await getDb(); if (!db) throw new Error("Database unavailable");
  const rows = await db.select({
    id: assistantApprovals.id,
    userId: assistantApprovals.userId,
    kind: assistantApprovals.kind,
    status: assistantApprovals.status,
    expiresAt: assistantApprovals.expiresAt,
    targetRoleUrl: assistantApprovals.targetRoleUrl,
    idempotencyKey: assistantApprovals.idempotencyKey,
  }).from(assistantApprovals).where(and(eq(assistantApprovals.userId, userId), inArray(assistantApprovals.id, [...approvalIds])));
  return approvalCostsFromRows(userId, rows, nowMs);
}
