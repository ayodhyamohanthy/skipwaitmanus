import { z } from "zod";

/**
 * #644: what an assistant-proposed referral request would charge if approved now,
 * exactly as the compose screen's quote (GET /api/company-referrals/quote) prices
 * the same job link. D-221: the owner approves this whole object, never a bare
 * count, so a field added here (a D-219 level band or spend source) is compared
 * too, and a client that does not echo it is answered 409, never charged.
 */
export const approvalCostSchema = z.object({
  level: z.number().int().min(1).max(10),
  cost: z.number().int().min(1),
}).strict();
export type ApprovalCost = z.infer<typeof approvalCostSchema>;

/** The decision route's 409 when the shown cost is missing or no longer current. Nothing was charged. */
export const approvalCostChangedSchema = z.object({
  error: z.string().min(1),
  code: z.literal("cost_changed"),
  cost: approvalCostSchema,
});
export type ApprovalCostChanged = z.infer<typeof approvalCostChangedSchema>;

const COST_FIELDS = Object.keys(approvalCostSchema.shape) as (keyof ApprovalCost)[];

/** True only when every field of the cost the owner saw equals the current one. */
export function sameApprovalCost(shown: ApprovalCost, current: ApprovalCost): boolean {
  return COST_FIELDS.every(field => shown[field] === current[field]);
}

export function approvalCostChangedMessage(current: ApprovalCost): string {
  return `This referral request now costs ${current.cost} ${current.cost === 1 ? "referral" : "referrals"}. Approve again to send it at that cost.`;
}

/** A listed approval keeps its cost only when it parses: a malformed cost is dropped, never guessed. */
export function withListedCost<T extends { cost?: unknown }>(approval: T): Omit<T, "cost"> & { cost?: ApprovalCost } {
  const { cost, ...rest } = approval;
  const parsed = approvalCostSchema.safeParse(cost);
  return parsed.success ? { ...rest, cost: parsed.data } : rest;
}

/** An approve carries the cost the owner saw; a decline never carries one. */
export function approvalDecisionBody(approval: { kind: string; cost?: ApprovalCost }, decision: "approved" | "declined") {
  return { decision, kind: approval.kind, ...(decision === "approved" && approval.cost ? { expectedCost: approval.cost } : {}) };
}
