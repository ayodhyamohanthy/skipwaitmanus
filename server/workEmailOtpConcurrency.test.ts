import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const source=readFileSync(new URL("./workEmailOtp.ts",import.meta.url),"utf8");
describe("OTP concurrency invariants",()=>{
 it("atomically increments unique fixed-window buckets",()=>{expect(source).toContain("INSERT IGNORE INTO workEmailOtpRateLimits");expect(source).toContain("lt(workEmailOtpRateLimits.hitCount, limit.limit)");expect(source).toContain('throw new Error("OTP_RATE_LIMITED")');});
 it("locks the newest code and atomically consumes or penalizes it",()=>{expect(source).toContain("ORDER BY createdAt DESC, id DESC LIMIT 1 FOR UPDATE");expect(source).toContain("attempts} + 1");expect(source).toContain("isNull(workEmailOtpCodes.consumedAt)");});
 it("limits verify by source and target",()=>{expect(source).toContain('limiterKey("verify-ip10m"');expect(source).toContain('limiterKey("verify-email10m"');});
});
