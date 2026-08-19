import { describe, expect, it } from "vitest";
import { companyDomainFromTargetUrl, isVerifiedEmployeeOfCompany, isWorkEmailDomain, resolveEmployerDomainFromTargetUrl } from "./db";
import { employerCandidatesFromJobPageHtml, hostedEmployerCandidatesFromTargetUrl, officialEmployerDomainsFromJobPageHtml, publicEmployerPageUrls, verifiedEmployerDomainFromCandidates, verifiedEmployerDomainFromProtectedHostedListing } from "./employerRouting";

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

  it("uses a JobPosting organization URL only when it agrees with the listed employer name", () => {
    const matchingStructuredData = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","hiringOrganization":{"@type":"Organization","name":"Acme, Inc.","sameAs":"https://careers.acme.com/company"}}</script>';
    expect(employerCandidatesFromJobPageHtml(matchingStructuredData)).toContain("acme");
    expect(officialEmployerDomainsFromJobPageHtml(matchingStructuredData)).toEqual(["acme.com"]);

    const mismatchedStructuredData = '<script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"Acme","sameAs":"https://evil.example"}}</script>';
    expect(officialEmployerDomainsFromJobPageHtml(mismatchedStructuredData)).toEqual([]);

    const hostedStructuredData = '<script type="application/ld+json">{"@type":"JobPosting","hiringOrganization":{"name":"Acme","sameAs":"https://www.linkedin.com/company/acme"}}</script>';
    expect(officialEmployerDomainsFromJobPageHtml(hostedStructuredData)).toEqual([]);
  });

  it("can read a standard hosted job-page title without ever treating the hosting platform as the employer", () => {
    const candidates = employerCandidatesFromJobPageHtml('<meta property="og:title" content="Product Designer at Acme, Inc. | LinkedIn">');
    expect(candidates).toEqual(["acme"]);
    expect(verifiedEmployerDomainFromCandidates(candidates, ["acme.com", "linkedin.com"])).toBe("acme.com");
  });

  it("uses LinkedIn's public job-posting representation and extracts its company card only as a verified-domain candidate", () => {
    expect(publicEmployerPageUrls("https://www.linkedin.com/jobs/view/4448866119/?trackingId=example#details")).toEqual(["https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/4448866119"]);
    expect(publicEmployerPageUrls("https://www.indeed.com/viewjob?jk=123")).toEqual(["https://www.indeed.com/viewjob?jk=123"]);
    const candidates = employerCandidatesFromJobPageHtml('<a class="topcard__org-name-link">Rubrik</a>');
    expect(candidates).toEqual(["rubrik"]);
    expect(verifiedEmployerDomainFromCandidates(candidates, ["rubrik.com", "linkedin.com"])).toBe("rubrik.com");
  });

  it("uses reviewed exact fallbacks for independently verified Wellfound listings without routing any other Wellfound URL", async () => {
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://wellfound.com/jobs/3971835-account-executive")).toBe("chatfin.ai");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://wellfound.com/jobs/3971835-account-executive/?source=mobile")).toBe("chatfin.ai");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://wellfound.com/jobs/4220336-senior-product-designer")).toBe("checkhq.com");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://www.wellfound.com/jobs/4220336-senior-product-designer/?source=mobile#details")).toBe("checkhq.com");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://www.linkedin.com/jobs/view/4446365088/?trackingId=example#details")).toBe("ethos.com");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://www.linkedin.com/jobs/view/4448866119/?trackingId=example#details")).toBe("rubrik.com");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://linkedin.com/jobs/view/4389299303")).toBe("makemytrip.com");
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://wellfound.com/jobs/4322255-software-engineer-intern-freshers")).toBeUndefined();
    expect(verifiedEmployerDomainFromProtectedHostedListing("https://www.linkedin.com/jobs/view/4446365089/")).toBeUndefined();
    await expect(resolveEmployerDomainFromTargetUrl("https://wellfound.com/jobs/3971835-account-executive")).resolves.toBe("chatfin.ai");
    await expect(resolveEmployerDomainFromTargetUrl("https://wellfound.com/jobs/4220336-senior-product-designer")).resolves.toBe("checkhq.com");
    await expect(resolveEmployerDomainFromTargetUrl("https://www.linkedin.com/jobs/view/4446365088/")).resolves.toBe("ethos.com");
    await expect(resolveEmployerDomainFromTargetUrl("https://www.linkedin.com/jobs/view/4448866119/")).resolves.toBe("rubrik.com");
    await expect(resolveEmployerDomainFromTargetUrl("https://in.linkedin.com/jobs/view/associate-director-ux-designer-at-makemytrip-4389299303")).resolves.toBe("makemytrip.com");
  });

  it("allows verified company domains while rejecting common consumer email domains", () => {
    expect(isWorkEmailDomain("acme.com")).toBe(true);
    expect(isWorkEmailDomain("gmail.com")).toBe(false);
    expect(isWorkEmailDomain("outlook.com")).toBe(false);
  });

  it("requires a verified Referrer work-email domain to exactly match the resolved employer", () => {
    const verifiedAcmeReferrer = { accountType: "referrer", workEmailDomain: "acme.com", workEmailVerifiedAt: new Date() };
    expect(isVerifiedEmployeeOfCompany(verifiedAcmeReferrer, "acme.com")).toBe(true);
    expect(isVerifiedEmployeeOfCompany(verifiedAcmeReferrer, "other.com")).toBe(false);
    expect(isVerifiedEmployeeOfCompany({ ...verifiedAcmeReferrer, accountType: "job_seeker" }, "acme.com")).toBe(false);
    expect(isVerifiedEmployeeOfCompany({ ...verifiedAcmeReferrer, workEmailVerifiedAt: null }, "acme.com")).toBe(false);
  });
});
