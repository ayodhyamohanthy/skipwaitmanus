import { describe, expect, it } from "vitest";
import { completeTargetRoleUrl, isValidTargetRoleUrl, jobLinkFitsCompany, normalizeTargetRoleUrl, reviewedEmployerFromTargetRoleUrl, TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";

describe("isValidTargetRoleUrl", () => {
  it("accepts complete HTTP(S) job links and rejects arbitrary text or non-web protocols", () => {
    expect(isValidTargetRoleUrl("https://careers.example.com/jobs/product-designer")).toBe(true);
    expect(isValidTargetRoleUrl("http://jobs.example.com/123")).toBe(true);
    expect(isValidTargetRoleUrl("product designer at Example")).toBe(false);
    expect(isValidTargetRoleUrl("www.example.com/jobs/123")).toBe(true);
    expect(isValidTargetRoleUrl("mailto:jobs@example.com")).toBe(false);
  });

  it("never asks the seeker to type https:// (owner, Nov 19 2026)", () => {
    expect(TARGET_ROLE_URL_ERROR).not.toMatch(/http/i);
    expect(completeTargetRoleUrl("careers.acme.com/jobs/123")).toBe("https://careers.acme.com/jobs/123");
    expect(completeTargetRoleUrl("  www.linkedin.com/jobs/view/4446365088/  ")).toBe("https://www.linkedin.com/jobs/view/4446365088/");
    expect(completeTargetRoleUrl("acme.com")).toBe("https://acme.com");
    expect(completeTargetRoleUrl("jobs.acme.co.in:8443/role?id=7#apply")).toBe("https://jobs.acme.co.in:8443/role?id=7#apply");
    expect(completeTargetRoleUrl("//boards.greenhouse.io/acme/jobs/1")).toBe("https://boards.greenhouse.io/acme/jobs/1");
    expect(completeTargetRoleUrl("<https://acme.com/jobs/1>")).toBe("https://acme.com/jobs/1");
    expect(completeTargetRoleUrl('"careers.acme.com/jobs/9".')).toBe("https://careers.acme.com/jobs/9");
    expect(completeTargetRoleUrl("Apply here: https://acme.com/jobs/1. Thanks!")).toBe("https://acme.com/jobs/1");
    expect(completeTargetRoleUrl("(see https://acme.com/jobs/1)")).toBe("https://acme.com/jobs/1");
    expect(completeTargetRoleUrl("Apply here: www.acme.com/jobs/1.")).toBe("https://www.acme.com/jobs/1");
    expect(completeTargetRoleUrl("https://en.wikipedia.org/wiki/Foo_(bar)")).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
    expect(completeTargetRoleUrl("HTTPS://ACME.COM/jobs/1")).toBe("HTTPS://ACME.COM/jobs/1");
    // Already complete links are returned as they are, so completing twice changes nothing.
    expect(completeTargetRoleUrl("http://jobs.example.com/123")).toBe("http://jobs.example.com/123");
    expect(completeTargetRoleUrl(completeTargetRoleUrl("acme.com/jobs/1"))).toBe("https://acme.com/jobs/1");
    // What cannot become a web link comes back untouched, and stays invalid.
    for (const text of ["product designer at Acme", "notaurl", "mailto:jobs@acme.com", "javascript:alert(1)", "localhost:3000/jobs", "acme", "", "   "]) {
      expect(completeTargetRoleUrl(text)).toBe(text);
    }
    expect(isValidTargetRoleUrl("javascript:alert(1)")).toBe(false);
    expect(isValidTargetRoleUrl("careers.acme.com/jobs/123")).toBe(true);
    expect(normalizeTargetRoleUrl("www.linkedin.com/jobs/view/senior-designer-4446365088/?trk=x")).toBe("https://linkedin.com/jobs/view/4446365088");
    expect(normalizeTargetRoleUrl("careers.acme.com/jobs/123")).toBe("https://careers.acme.com/jobs/123");
    expect(jobLinkFitsCompany("careers.acme.com/jobs/123", ["acme.com"])).toBe(true);
    expect(reviewedEmployerFromTargetRoleUrl("wellfound.com/jobs/4220336-senior-product-designer")).toEqual({ name: "Check", domain: "checkhq.com" });
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
