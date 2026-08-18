import { describe, expect, it } from "vitest";
import { companyDomainFromTargetUrl, isWorkEmailDomain } from "./db";
import { employerCandidatesFromJobPageHtml, hostedEmployerCandidatesFromTargetUrl, verifiedEmployerDomainFromCandidates } from "./employerRouting";

describe("company routing from Target Role URLs", () => {
  it("uses a direct employer careers hostname as the hidden company key", () => {
    expect(companyDomainFromTargetUrl("https://careers.acme.com/jobs/product-designer")).toBe("acme.com");
  });

  it("never treats a hosted job-board domain as the employer domain", () => {
    expect(companyDomainFromTargetUrl("https://jobs.lever.co/acme/product-designer")).toBeUndefined();
    expect(companyDomainFromTargetUrl("https://www.linkedin.com/jobs/view/123")).toBeUndefined();
    expect(companyDomainFromTargetUrl("https://www.indeed.com/viewjob?jk=123")).toBeUndefined();
    expect(companyDomainFromTargetUrl("https://www.glassdoor.com/job-listing/example-JV_IC123.htm")).toBeUndefined();
    expect(companyDomainFromTargetUrl("https://www.naukri.com/job-listings-example-123")).toBeUndefined();
    expect(companyDomainFromTargetUrl("https://www.ziprecruiter.com/jobs/example-123")).toBeUndefined();
    expect(companyDomainFromTargetUrl("not-a-url")).toBeUndefined();
  });

  it("extracts hosted ATS employer handles and routes only when they match one verified employee domain", () => {
    expect(hostedEmployerCandidatesFromTargetUrl("https://jobs.lever.co/acme-inc/123")).toEqual(["acme"]);
    expect(hostedEmployerCandidatesFromTargetUrl("https://boards.greenhouse.io/acme/jobs/123")).toEqual(["acme"]);
    expect(hostedEmployerCandidatesFromTargetUrl("https://acme.bamboohr.com/careers/42")).toEqual(["acme"]);
    expect(verifiedEmployerDomainFromCandidates(["acme"], ["acme.com", "other.com"])).toBe("acme.com");
    expect(verifiedEmployerDomainFromCandidates(["acme"], ["acme.com", "acme.io"])).toBeUndefined();
  });

  it("uses public job-page employer metadata only as a candidate for an exact verified-domain match", () => {
    const candidates = employerCandidatesFromJobPageHtml('{"hiringOrganization":{"name":"Acme, Inc."}}');
    expect(candidates).toEqual(["acme"]);
    expect(verifiedEmployerDomainFromCandidates(candidates, ["acme.com"])).toBe("acme.com");
    expect(verifiedEmployerDomainFromCandidates(candidates, ["linkedin.com"])).toBeUndefined();
  });

  it("can read a standard hosted job-page title without ever treating the hosting platform as the employer", () => {
    const candidates = employerCandidatesFromJobPageHtml('<meta property="og:title" content="Product Designer at Acme, Inc. | LinkedIn">');
    expect(candidates).toEqual(["acme"]);
    expect(verifiedEmployerDomainFromCandidates(candidates, ["acme.com", "linkedin.com"])).toBe("acme.com");
  });

  it("allows verified company domains while rejecting common consumer email domains", () => {
    expect(isWorkEmailDomain("acme.com")).toBe(true);
    expect(isWorkEmailDomain("gmail.com")).toBe(false);
    expect(isWorkEmailDomain("outlook.com")).toBe(false);
  });
});
