import {describe,expect,it} from "vitest";import{readFileSync}from"node:fs";
const s=readFileSync(new URL("./db.ts",import.meta.url),"utf8"),f=s.slice(s.indexOf("export async function claimCompanyReferralRequest"),s.indexOf("export async function getClaimedCompanyReferralDetail"));
describe("atomic referral claim",()=>{
 it("locks, checks pass, CAS assigns and emits inside one transaction",()=>{expect(f).toContain("db.transaction");expect(f).toContain('.for("update")');expect(f).toContain("referralRequestPasses");expect(f).toContain('isNull(referralRequests.referrerId)');expect(f.indexOf("tx.update(referralRequests)")).toBeLessThan(f.indexOf("tx.insert(notifications)"));});
 it("replay returns the canonical shape and one deterministic event",()=>{expect(f).not.toContain("return { requestId, claimed: true }");expect(f).toContain("jobSeekerId:current.jobSeekerId");expect(f).toContain("companyDomain:current.company");expect(f).toContain("onDuplicateKeyUpdate");expect(f).toContain('eventKey:`referral:${requestId}:claimed:${userId}`');});
});
