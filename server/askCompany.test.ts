import { describe, expect, it } from "vitest";
import { askCompanyFromCompany, askCompanyFromUrl, careersPlaceholder } from "../shared/askCompany";
import { askChecks, countWords } from "../shared/askQuality";

const companies = [{ name: "Wipro", domains: ["wipro.com"] }, { name: "Acme", domains: ["acme.io", "acme.com"] }];

describe("ask company context", () => {
  it("matches a listed company by exact host or subdomain only", () => {
    expect(askCompanyFromUrl(companies, "https://careers.wipro.com/jobs/1")?.name).toBe("Wipro");
    expect(askCompanyFromUrl(companies, "https://www.acme.io/careers")?.primaryDomain).toBe("acme.io");
    expect(askCompanyFromUrl(companies, "https://notwipro.com/jobs")).toBeUndefined();
    expect(askCompanyFromUrl(companies, "https://wipro.com.evil.example/x")).toBeUndefined();
    expect(askCompanyFromUrl(companies, "not a url")).toBeUndefined();
  });
  it("uses the primary domain for the placeholder and falls back when unknown", () => {
    expect(careersPlaceholder(askCompanyFromCompany(companies[0]))).toBe("https://careers.wipro.com/…");
    expect(careersPlaceholder(undefined)).toBe("https://careers.company.com/…");
  });
});

describe("shared ask quality checks", () => {
  it("is the same implementation the composer uses", () => {
    const note = "I led a team of five that built the payments redesign and cut checkout drop-off by 18% last year. I am applying for the Senior Designer role and would value a referral. ".repeat(1);
    expect(countWords(note)).toBeGreaterThanOrEqual(30);
    expect(askChecks({ officialUrl: true, note, hasResume: true }).every(check => check.ok)).toBe(true);
    expect(askChecks({ officialUrl: false, note: "any role please", hasResume: false }).some(check => check.ok)).toBe(false);
  });
});
