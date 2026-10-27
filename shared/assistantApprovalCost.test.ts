import { describe, expect, it } from "vitest";
import { approvalCostChangedMessage, approvalCostChangedSchema, approvalCostSchema, sameApprovalCost } from "./assistantApprovalCost";

describe("assistant approval cost contract (#644, D-221)", () => {
  it("accepts the quote's cost object and nothing looser", () => {
    expect(approvalCostSchema.parse({ level: 5, cost: 5 })).toEqual({ level: 5, cost: 5 });
    expect(approvalCostSchema.parse({ level: 10, cost: 1 })).toEqual({ level: 10, cost: 1 });
    for (const bad of [
      null, undefined, 3, "3", {}, { cost: 1 }, { level: 2 },
      { level: 0, cost: 1 }, { level: 11, cost: 1 }, { level: 2.5, cost: 1 },
      { level: 2, cost: 0 }, { level: 2, cost: -1 }, { level: 2, cost: 1.5 },
      { level: "2", cost: 1 }, { level: 2, cost: "1" },
      { level: 2, cost: 1, spendSource: "free" },
    ]) expect(approvalCostSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });

  it("compares every field, so a changed level or cost never passes as the one shown", () => {
    expect(sameApprovalCost({ level: 3, cost: 3 }, { level: 3, cost: 3 })).toBe(true);
    expect(sameApprovalCost({ level: 3, cost: 1 }, { level: 3, cost: 3 })).toBe(false);
    expect(sameApprovalCost({ level: 2, cost: 1 }, { level: 3, cost: 1 })).toBe(false);
  });

  it("describes the 409 body the decision route answers", () => {
    const body = { error: approvalCostChangedMessage({ level: 4, cost: 4 }), code: "cost_changed", cost: { level: 4, cost: 4 } };
    expect(approvalCostChangedSchema.parse(body)).toEqual(body);
    expect(approvalCostChangedSchema.safeParse({ ...body, code: "slot_cap_reached" }).success).toBe(false);
    expect(approvalCostChangedSchema.safeParse({ ...body, cost: 4 }).success).toBe(false);
  });

  it("says the new cost in referral words only (D-180)", () => {
    expect(approvalCostChangedMessage({ level: 1, cost: 1 })).toBe("This referral request now costs 1 referral. Approve again to send it at that cost.");
    expect(approvalCostChangedMessage({ level: 6, cost: 6 })).toBe("This referral request now costs 6 referrals. Approve again to send it at that cost.");
    expect(approvalCostChangedMessage({ level: 6, cost: 6 })).not.toMatch(/credit|\bask\b/i);
  });
});
