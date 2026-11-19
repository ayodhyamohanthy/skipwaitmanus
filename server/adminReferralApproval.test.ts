import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_CANNOT_ACCEPT_CLAIMED_ERROR, AdminCannotAcceptClaimedReferralError, decideAdminReferralApproval } from "./adminReferralApproval";
import { referralStatuses } from "../shared/referral";

describe("administrator decision on a referral request (D-012 item 3)", () => {
  it("never approves a request a verified employee claimed: only that employee can accept it", () => {
    expect(() => decideAdminReferralApproval({ status: "pending", referrerId: 22 }, "approved")).toThrow(AdminCannotAcceptClaimedReferralError);
    expect(() => decideAdminReferralApproval({ status: "pending", referrerId: 22 }, "approved")).toThrow(ADMIN_CANNOT_ACCEPT_CLAIMED_ERROR);
  });

  it("still lets the administrator reject a claimed request, and decide an unclaimed one", () => {
    expect(decideAdminReferralApproval({ status: "pending", referrerId: 22 }, "rejected")).toBe("declined");
    expect(decideAdminReferralApproval({ status: "pending", referrerId: null }, "approved")).toBe("approved");
    expect(decideAdminReferralApproval({ status: "pending", referrerId: null }, "rejected")).toBe("declined");
  });

  it("refuses any decision once the request left pending", () => {
    for (const status of referralStatuses.filter(value => value !== "pending")) for (const decision of ["approved", "rejected"] as const) {
      expect(() => decideAdminReferralApproval({ status, referrerId: null }, decision)).toThrow("This record was already resolved");
    }
  });

  it("is what resolveAdminApproval uses, under a row lock, with the claim re-checked in the update predicate", () => {
    const db = readFileSync(new URL("./db.ts", import.meta.url), "utf8");
    const start = db.indexOf("export async function resolveAdminApproval");
    const referralBranch = db.slice(db.indexOf("return db.transaction(async tx => {\n    // Locked read", start), db.indexOf("// ---- B2B monetization", start));
    expect(referralBranch).toContain("referrerId: referralRequests.referrerId");
    expect(referralBranch).toContain('.limit(1).for("update")');
    expect(referralBranch).toContain("decideAdminReferralApproval(row, decision)");
    expect(referralBranch).toContain('nextStatus === "approved" ? [isNull(referralRequests.referrerId)] : []');
    expect(referralBranch).not.toContain('decision === "approved" ? "approved" : "declined"');
  });
});
