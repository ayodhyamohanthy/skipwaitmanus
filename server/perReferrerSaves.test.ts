import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const db=readFileSync(new URL("./db.ts",import.meta.url),"utf8"),schema=readFileSync(new URL("../drizzle/schema.ts",import.meta.url),"utf8");
describe("per-referrer saves",()=>{
 it("stores one save per request and employee",()=>{expect(schema).toContain('referralRequestSaves');expect(schema).toContain('referral_request_save_request_referrer_unique');});
 it("scopes save and unsave to the acting employee",()=>{const fn=db.slice(db.indexOf('export async function saveCompanyReferralRequest'),db.indexOf('export async function withdrawCompanyReferralRequest'));expect(fn).toContain('referrerId: userId');expect(fn).toContain('eq(referralRequestSaves.referrerId, userId)');expect(fn).not.toContain('set({ savedAt:');expect(fn).toContain('.for("update")');});
 it("hides coworkers saves and passed or unavailable requests",()=>{expect(db).toContain('eq(referralRequestSaves.referrerId, userId)');expect(db).toContain('Boolean(row.savedByYouAt)');expect(db).toContain('!row.savedByYouAt');expect(db).toContain('current.passedByYou');});
});
