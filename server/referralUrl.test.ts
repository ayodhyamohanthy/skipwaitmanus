import { describe, expect, it } from "vitest";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl } from "@shared/referralUrl";

describe("isValidTargetRoleUrl", () => {
  it("accepts complete HTTP(S) job links and rejects arbitrary text or non-web protocols", () => {
    expect(isValidTargetRoleUrl("https://careers.example.com/jobs/product-designer")).toBe(true);
    expect(isValidTargetRoleUrl("http://jobs.example.com/123")).toBe(true);
    expect(isValidTargetRoleUrl("product designer at Example")).toBe(false);
    expect(isValidTargetRoleUrl("www.example.com/jobs/123")).toBe(false);
    expect(isValidTargetRoleUrl("mailto:jobs@example.com")).toBe(false);
  });

  it("canonicalizes Wellfound mobile tracking, hash, www, and trailing-slash variants before routing", () => {
    expect(normalizeTargetRoleUrl("https://www.wellfound.com/jobs/3971835-account-executive/?source=mobile#details")).toBe("https://wellfound.com/jobs/3971835-account-executive");
  });
});
