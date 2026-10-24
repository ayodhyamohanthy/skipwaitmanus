import { describe, expect, it } from "vitest";
import type { PublicCompany } from "@shared/companies";
import { TARGET_ROLE_URL_ERROR } from "@shared/referralUrl";
import { companyMatches, directorySummary, filterCompanies, linkHint, roleTitleFromUrl } from "./findModel";

const company = (name: string, over: Partial<Pick<PublicCompany, "openToReferrals" | "functions" | "domains" | "industry">> = {}): PublicCompany => ({
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  initials: name.slice(0, 2).toUpperCase(),
  industry: "Software",
  location: "Bengaluru",
  functions: ["Engineering", "Product"],
  blurb: "A company.",
  domains: [`${name.toLowerCase().replace(/\s+/g, "")}.com`],
  openToReferrals: true,
  ...over,
});

describe("find-a-referral directory", () => {
  const alpha = company("Alpha", { domains: ["alpha.com"] });
  const beta = company("Beta", { openToReferrals: false, functions: ["Finance"], domains: ["beta.com"] });
  const gamma = company("Gamma", { functions: ["Design"], domains: ["gamma.com"] });

  it("matches the search across name, industry and functions, case-insensitively", () => {
    expect(companyMatches(alpha, { query: "alp", fn: null })).toBe(true);
    expect(companyMatches(alpha, { query: "software", fn: null })).toBe(true);
    expect(companyMatches(gamma, { query: "design", fn: null })).toBe(true);
    expect(companyMatches(alpha, { query: "finance", fn: null })).toBe(false);
  });

  it("filters by one job function, alphabetically with no availability grouping (D-176)", () => {
    const filter = { query: "", fn: null } as const;
    expect(filterCompanies([beta, alpha, gamma], filter).map(item => item.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(filterCompanies([beta, alpha, gamma], { ...filter, fn: "Finance" }).map(item => item.name)).toEqual(["Beta"]);
  });

  it("sorts alphabetically only - availability never reorders the directory (D-176)", () => {
    const closedEarly = company("Aardvark", { openToReferrals: false, domains: ["aardvark.com"] });
    const openLate = company("Zephyr", { domains: ["zephyr.com"] });
    expect(filterCompanies([closedEarly, openLate, beta, alpha], { query: "", fn: null }).map(item => item.name)).toEqual(["Aardvark", "Alpha", "Beta", "Zephyr"]);
  });

  it("counts the companies shown, with no availability count (D-176)", () => {
    expect(directorySummary([alpha, beta, gamma])).toEqual({ total: 3 });
    expect(directorySummary([])).toEqual({ total: 0 });
  });
});

describe("job-link hint", () => {
  const acme = company("Acme", { domains: ["acme.com"] });

  it("says nothing for an empty field, and holds an unfinished link until touched", () => {
    expect(linkHint("", acme, false)).toBeNull();
    expect(linkHint("not a url", acme, false)).toBeNull();
    expect(linkHint("not a url", acme, true)).toEqual({ tone: "error", text: TARGET_ROLE_URL_ERROR });
  });

  it("passes a link on the company's own careers site", () => {
    expect(linkHint("https://careers.acme.com/jobs/1", acme, false)).toEqual({ tone: "pass", text: "Matches Acme’s careers site" });
  });

  it("refuses a link from a different employer", () => {
    expect(linkHint("https://other.com/jobs/1", acme, false)).toEqual({ tone: "error", text: "This link isn’t from Acme. Paste a job link from Acme’s own careers page." });
  });

  it("accepts a hosted job board but says the employer is confirmed at send", () => {
    expect(linkHint("https://www.linkedin.com/jobs/view/1", acme, false)).toEqual({ tone: "muted", text: "We’ll confirm it’s a Acme role when you send." });
  });

  it("uses the plural possessive for a name that ends in s", () => {
    expect(linkHint("https://careers.tcs.com/jobs/1", company("TCS", { domains: ["tcs.com"] }), false)).toEqual({ tone: "pass", text: "Matches TCS’ careers site" });
  });
});

describe("role title from the job link", () => {
  it("humanizes a readable careers slug", () => {
    expect(roleTitleFromUrl("https://careers.kestrelpay.com/careers/senior-backend-engineer-payments")).toBe("Senior Backend Engineer Payments");
    expect(roleTitleFromUrl("https://acme.com/jobs/product-designer-12345")).toBe("Product Designer");
  });

  it("skips the generic path words around the slug", () => {
    expect(roleTitleFromUrl("https://acme.com/jobs/view/staff-data-engineer/apply")).toBe("Staff Data Engineer");
  });

  it("returns nothing rather than inventing a title from a job id", () => {
    expect(roleTitleFromUrl("https://www.linkedin.com/jobs/view/4446365088")).toBeNull();
    expect(roleTitleFromUrl("not a url")).toBeNull();
    expect(roleTitleFromUrl("")).toBeNull();
  });
});
