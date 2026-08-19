import { describe, expect, it } from "vitest";
import { isValidTargetRoleUrl, normalizeTargetRoleUrl, reviewedEmployerFromTargetRoleUrl } from "@shared/referralUrl";

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
    expect(normalizeTargetRoleUrl("https://www.linkedin.com/jobs/view/4446365088/?trackingId=example#details")).toBe("https://linkedin.com/jobs/view/4446365088");
  });

  it("recognizes only the independently reviewed Check listing and its canonical mobile variant", () => {
    expect(reviewedEmployerFromTargetRoleUrl("https://wellfound.com/jobs/4220336-senior-product-designer")).toEqual({ name: "Check", domain: "checkhq.com" });
    expect(reviewedEmployerFromTargetRoleUrl("https://www.wellfound.com/jobs/4220336-senior-product-designer/?source=mobile#details")).toEqual({ name: "Check", domain: "checkhq.com" });
    expect(reviewedEmployerFromTargetRoleUrl("https://wellfound.com/jobs/4220337-product-designer")).toBeUndefined();
  });

  it("recognizes only the independently reviewed LinkedIn Ethos listing and canonical URL variants", () => {
    expect(reviewedEmployerFromTargetRoleUrl("https://www.linkedin.com/jobs/view/4446365088/")).toEqual({ name: "Ethos", domain: "ethos.com" });
    expect(reviewedEmployerFromTargetRoleUrl("https://linkedin.com/jobs/view/4446365088?trackingId=example#details")).toEqual({ name: "Ethos", domain: "ethos.com" });
    expect(reviewedEmployerFromTargetRoleUrl("https://www.linkedin.com/jobs/view/4446365089/")).toBeUndefined();
  });

  it("recognizes the independently verified MakeMyTrip UX listing without treating nearby LinkedIn listings as MakeMyTrip", () => {
    expect(reviewedEmployerFromTargetRoleUrl("https://linkedin.com/jobs/view/4389299303")).toEqual({ name: "MakeMyTrip", domain: "makemytrip.com" });
    expect(reviewedEmployerFromTargetRoleUrl("https://in.linkedin.com/jobs/view/associate-director-ux-designer-at-makemytrip-4389299303?trackingId=example")).toEqual({ name: "MakeMyTrip", domain: "makemytrip.com" });
    expect(reviewedEmployerFromTargetRoleUrl("https://linkedin.com/jobs/view/4389299304")).toBeUndefined();
  });
});
