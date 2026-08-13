import { describe, expect, it } from "vitest";
import { companyDomainFromTargetUrl, isWorkEmailDomain } from "./db";

describe("company routing from Target Role URLs", () => {
  it("uses a direct employer careers hostname as the hidden company key", () => {
    expect(companyDomainFromTargetUrl("https://careers.acme.com/jobs/product-designer")).toBe("acme.com");
  });

  it("requires a direct employer URL when an aggregator hostname cannot identify employee email domains", () => {
    expect(companyDomainFromTargetUrl("https://jobs.lever.co/acme/product-designer")).toBeUndefined();
    expect(companyDomainFromTargetUrl("not-a-url")).toBeUndefined();
  });

  it("allows verified company domains while rejecting common consumer email domains", () => {
    expect(isWorkEmailDomain("acme.com")).toBe(true);
    expect(isWorkEmailDomain("gmail.com")).toBe(false);
    expect(isWorkEmailDomain("outlook.com")).toBe(false);
  });
});
