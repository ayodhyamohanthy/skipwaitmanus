import { describe, expect, it } from "vitest";
import { isCorporateEmailDomain } from "../shared/const";
import { jobLinkFitsCompany } from "../shared/referralUrl";

describe("work email domains", () => {
  it.each(["gmail.com", "googlemail.com", "yahoo.co.in", "yahoo.in", "outlook.in", "hotmail.co.uk", "live.in", "icloud.com", "rediffmail.com", "proton.me", "protonmail.ch", "mail.ru", "eu.yahoo.com", "ymail.com", "msn.com"])("rejects %s", domain => {
    expect(isCorporateEmailDomain(domain)).toBe(false);
  });
  it.each(["acme.com", "orange.com", "sky.com", "att.com", "skipwait.me", "livestream.com", "mail.acme.com"])("accepts %s", domain => {
    expect(isCorporateEmailDomain(domain)).toBe(true);
  });
});

describe("jobLinkFitsCompany", () => {
  const acme = ["acme.com"];
  it("accepts the company's own domain and subdomains", () => {
    expect(jobLinkFitsCompany("https://careers.acme.com/jobs/1", acme)).toBe(true);
    expect(jobLinkFitsCompany("https://www.acme.com/jobs/1", acme)).toBe(true);
  });
  it("accepts hosted job boards, which the server resolves", () => {
    expect(jobLinkFitsCompany("https://boards.greenhouse.io/acme/jobs/1", acme)).toBe(true);
  });
  it("rejects another company's site and lookalikes", () => {
    expect(jobLinkFitsCompany("https://careers.other.com/jobs/1", acme)).toBe(false);
    expect(jobLinkFitsCompany("https://acme.com.evil.io/jobs/1", acme)).toBe(false);
    expect(jobLinkFitsCompany("https://notacme.com/jobs/1", acme)).toBe(false);
    expect(jobLinkFitsCompany("nonsense", acme)).toBe(false);
  });
});
