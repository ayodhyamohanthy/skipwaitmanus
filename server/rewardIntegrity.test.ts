import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./db.ts",import.meta.url),"utf8");
const fn=(a:string,b:string)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
describe("action-gated reward integrity",()=>{
 it("does not grant before request validation or let rewards fund that request",()=>{const create=fn("export async function createCompanyReferralRequest","const reviewEmailLifetimeMs");expect(create).not.toContain("await grantPendingActionRewards(userId");expect(create.indexOf("grantPendingActionRewardsTx")).toBeGreaterThan(create.indexOf("resume documents changed during submission"));expect(create.indexOf("grantPendingActionRewardsTx")).toBeGreaterThan(create.indexOf("kind:\"direct_request\""));});
 it("uses the caller transaction, conditional pending claim, wallet lock and atomic increment",()=>{const grant=fn("async function grantPendingActionRewardsTx","export async function spendToken");expect(grant).not.toContain("db.transaction");expect(grant).toContain('.for("update")');expect(grant).toContain('eq(tokenTransactions.rewardStatus,"pending")');expect(grant).toContain('balance:sql`${tokenBalances.balance} + ${total}`');expect(grant).toContain('referenceType:"pending_reward"');});
 it("only approved referrals qualify and direct spending never activates rewards",()=>{const approve=fn("export async function oneClickReviewReferralRequest","export async function consumeReferrerReviewEmailLink");expect(approve.indexOf('status: "approved"')).toBeLessThan(approve.indexOf("grantPendingActionRewardsTx"));const spend=fn("export async function spendToken","export async function createChargebeePaymentIntent");expect(spend).not.toContain("grantPendingActionRewards");});
});
