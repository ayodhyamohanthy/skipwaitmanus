import {describe,expect,it} from "vitest";import{readFileSync}from"node:fs";
const s=readFileSync(new URL("./db.ts",import.meta.url),"utf8"),f=s.slice(s.indexOf("export async function claimCompanyReferralRequest"),s.indexOf("export async function referralWasClaimedTx"));
// The claim mechanism moved to the shared transition primitive (revision CAS +
// per-user operation keys); these guards pin the claim-specific load-bearing
// elements of the current shape. Transition mechanics themselves are covered
// behaviorally in referralTransitionIntegrity.test.ts.
describe("atomic referral claim",()=>{
 it("locks, checks pass, CAS assigns and emits inside one transaction",()=>{expect(f).toContain("db.transaction");expect(f).toContain('.for("update")');expect(f).toContain("referralRequestPasses");expect(f).toContain("Another verified employee already claimed this request");expect(f).toContain("operationKey: `claim:${userId}`");expect(f).toContain("patch: { referrerId: userId }");expect(f).toContain("Your referral request was claimed");});
 it("replay returns the canonical shape and one deterministic event, and a claim writes no document grant (D-019(e))",()=>{expect(f).not.toContain("return { requestId, claimed: true }");expect(f).toContain("replayed: result.replayed");expect(f).not.toContain("referralDocumentAccessGrants");expect(f).toContain("jobSeekerId: current.request.jobSeekerId");expect(f).toContain("companyDomain: current.company");expect(f).toContain("operationKey: `claim:${userId}`");});
 it("the 5-claim cap is one bounded aggregate read and a replay skips it (D-038-reconcile R-4/R-6)",()=>{
  const cap=f.slice(f.indexOf("D-038-A (§4.7)"),f.indexOf("const result = await transitionReferralRequestTx"));
  // One lock, on the claimant's own profiles row; one non-locking count over their own asks.
  expect(cap.match(/\.for\("update"\)/g)).toHaveLength(1);
  expect(cap).toContain("profiles");expect(cap).toContain("count()");expect(cap).toContain("actorUserId");
  // No per-request locking read and no loop over assigned asks: the count never locks another person's rows.
  expect(cap).not.toContain("referralWasClaimedTx");expect(cap).not.toContain("for (const assignedRow");
  // R-6: a claimant repeating "I'm on it" on an ask they already hold never meets the cap.
  expect(f).toContain("current.request.referrerId !== userId");
 });
});
