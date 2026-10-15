import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const db=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
const schema=readFileSync(new URL("../drizzle/schema.ts",import.meta.url),"utf8");
describe("per-employee decline routing",()=>{
 it("records a unique employee pass without mutating the shared request",()=>{expect(schema).toContain("referralRequestPasses");const decline=db.slice(db.indexOf('if (input.decision === "declined")'),db.indexOf('const previousPass'));expect(decline).toContain("passReferralRequestTx");expect(decline).not.toContain("update(referralRequests)");expect(decline).toContain('status: "passed"');});
 // D-021: the pass lives in one shared transition used by both review surfaces; it
 // reopens the ask for the rest of the company and never writes the shared row
 // directly — the claim release goes through the same revision-CAS primitive as
 // every other referral transition.
 it("keeps one shared pass transition that reopens the ask instead of ending it",()=>{const pass=db.slice(db.indexOf("async function passReferralRequestTx"),db.indexOf("export async function consumeReferrerReviewEmailLink"));expect(pass).toContain("tx.insert(referralRequestPasses)");expect(pass).toContain("transitionReferralRequestTx");expect(pass).toContain('toStatus: "pending"');expect(pass).toContain("patch: { referrerId: null, referrerMessage: null }");expect(pass).toContain("referralDocumentAccessGrants");expect(pass).not.toContain("tx.update(referralRequests)");});
 it("routes both decline surfaces through that one transition and never to a terminal decline",()=>{const oneClick=db.slice(db.indexOf("export async function oneClickReviewReferralRequest"),db.indexOf("export async function consumeReferrerReviewEmailLink"));const review=db.slice(db.indexOf("export async function reviewReferralRequest"),db.indexOf("export function authorizeApprovedReferralConversation"));for(const surface of [oneClick,review]){expect(surface).toContain("passReferralRequestTx");expect(surface).not.toContain('toStatus: "declined"');}expect(db).not.toContain("must be released through the queue workflow");});
 it("excludes passed employees from inbox and email fanout",()=>{expect(db).toContain("!passed.has(recipient.userId)");expect(db).toContain("isNull(referralRequestPasses.id)");});
 it("retains one-winner acceptance CAS",()=>{expect(db).toContain("isNull(referralRequests.referrerId)");expect(db).toContain('Another verified employee already claimed this request');});
});
