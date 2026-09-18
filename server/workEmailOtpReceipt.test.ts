import fs from "node:fs";
import { describe, expect, it } from "vitest";
const service = fs.readFileSync(new URL("./workEmailOtp.ts", import.meta.url), "utf8");
const database = fs.readFileSync(new URL("./db.ts", import.meta.url), "utf8");
describe("work email OTP receipt invariants", () => {
  it("issues random hashed receipts and completes enrollment in one scoped transaction", () => {
    expect(service).toContain('randomBytes(32).toString("base64url")');
    expect(service).toContain('receiptHash: receiptHash(receipt)');
    expect(service).not.toContain('async hasRecentVerification');
    expect(database).toContain('eq(workEmailOtpReceipts.userId, input.userId)');
    expect(database).toContain('eq(workEmailOtpReceipts.email, email)');
    expect(database).toContain('eq(workEmailOtpReceipts.purpose, "work_email_enrollment")');
    expect(database).toContain('isNull(workEmailOtpReceipts.usedAt)');
    expect(database).toContain('.for("update")');
    const fn = database.slice(database.indexOf("export async function completeWorkEmailOtpEnrollment"), database.indexOf("export async function saveVerifiedWorkEmail"));
    expect(fn).toContain("db.transaction");
    expect(fn).toContain("tx.insert(profiles)");
    expect(fn).toContain("tx.insert(companyCoverageRewards)");
  });
});
