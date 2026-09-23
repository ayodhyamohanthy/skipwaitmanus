import {describe,expect,it} from "vitest";import{readFileSync}from"node:fs";
const s=readFileSync(new URL("./db.ts",import.meta.url),"utf8"),f=s.slice(s.indexOf("export async function claimCompanyReferralRequest"),s.indexOf("export async function getClaimedCompanyReferralDetail"));
// The claim mechanism moved to the shared transition primitive (revision CAS +
// per-user operation keys); these guards pin the claim-specific load-bearing
// elements of the current shape. Transition mechanics themselves are covered
// behaviorally in referralTransitionIntegrity.test.ts.
describe("atomic referral claim",()=>{
 it("locks, checks pass, CAS assigns and emits inside one transaction",()=>{expect(f).toContain("db.transaction");expect(f).toContain('.for("update")');expect(f).toContain("referralRequestPasses");expect(f).toContain("Another verified employee already claimed this request");expect(f).toContain("operationKey: `claim:${userId}`");expect(f).toContain("patch: { referrerId: userId }");expect(f).toContain("Your referral request was claimed");});
 it("replay returns the canonical shape and one deterministic event",()=>{expect(f).not.toContain("return { requestId, claimed: true }");expect(f).toContain("replayed: result.replayed");expect(f).toContain("if(!result.replayed)");expect(f).toContain("jobSeekerId: current.request.jobSeekerId");expect(f).toContain("companyDomain: current.company");expect(f).toContain("operationKey: `claim:${userId}`");});
});
